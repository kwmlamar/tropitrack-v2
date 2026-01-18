"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  Plus,
  DollarSign,
  Calendar,
  Users,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader2,
  Calculator,
  FileText,
} from "lucide-react";
import type { PayPeriod, Worker } from "@/types";

interface PayrollEntry {
  id: string;
  worker_id: string;
  regular_hours: number;
  overtime_hours: number;
  regular_rate: number;
  overtime_rate: number;
  gross_pay: number;
  deductions: number;
  net_pay: number;
  worker?: {
    first_name: string;
    last_name: string;
  };
}

interface PayPeriodWithEntries extends PayPeriod {
  entries?: PayrollEntry[];
}

export default function PayrollPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [payPeriods, setPayPeriods] = useState<PayPeriodWithEntries[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<PayPeriodWithEntries | null>(null);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [processDialogOpen, setProcessDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const supabase = createClient();

  const [periodForm, setPeriodForm] = useState({
    start_date: "",
    end_date: "",
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch pay periods
      const { data: periodsData } = await supabase
        .from("pay_periods")
        .select("*")
        .order("start_date", { ascending: false });
      setPayPeriods(periodsData || []);

      // Fetch active workers
      const { data: workersData } = await supabase
        .from("workers")
        .select("*")
        .eq("status", "active")
        .order("last_name");
      setWorkers(workersData || []);

      // Select most recent open period
      const openPeriod = periodsData?.find((p) => p.status === "open");
      if (openPeriod) {
        await fetchPeriodEntries(openPeriod);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPeriodEntries = async (period: PayPeriod) => {
    const { data: entriesData } = await supabase
      .from("payroll_entries")
      .select(`
        *,
        worker:workers(first_name, last_name)
      `)
      .eq("pay_period_id", period.id);

    setSelectedPeriod({
      ...period,
      entries: entriesData || [],
    });
  };

  const handleCreatePeriod = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { data, error } = await supabase
        .from("pay_periods")
        .insert({
          start_date: periodForm.start_date,
          end_date: periodForm.end_date,
          status: "open",
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Pay period created",
        description: `Pay period from ${formatDate(periodForm.start_date)} to ${formatDate(periodForm.end_date)} has been created.`,
        variant: "success",
      });

      setCreateDialogOpen(false);
      setPeriodForm({ start_date: "", end_date: "" });
      fetchData();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "An error occurred";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleProcessPayroll = async () => {
    if (!selectedPeriod || !user) return;

    setSubmitting(true);
    try {
      // Fetch time entries for the pay period
      const { data: timeEntries } = await supabase
        .from("time_entries")
        .select(`
          worker_id,
          regular_hours,
          overtime_hours,
          workers(hourly_rate, overtime_rate_multiplier)
        `)
        .gte("date", selectedPeriod.start_date)
        .lte("date", selectedPeriod.end_date);

      if (!timeEntries || timeEntries.length === 0) {
        toast({
          title: "No time entries",
          description: "No time entries found for this pay period.",
          variant: "destructive",
        });
        setSubmitting(false);
        return;
      }

      // Aggregate by worker
      const workerTotals: Record<string, {
        regular_hours: number;
        overtime_hours: number;
        hourly_rate: number;
        overtime_multiplier: number;
      }> = {};

      timeEntries.forEach((entry: any) => {
        if (!workerTotals[entry.worker_id]) {
          workerTotals[entry.worker_id] = {
            regular_hours: 0,
            overtime_hours: 0,
            hourly_rate: entry.workers?.hourly_rate || 0,
            overtime_multiplier: entry.workers?.overtime_rate_multiplier || 1.5,
          };
        }
        workerTotals[entry.worker_id].regular_hours += entry.regular_hours;
        workerTotals[entry.worker_id].overtime_hours += entry.overtime_hours;
      });

      // Create payroll entries
      const payrollEntries = Object.entries(workerTotals).map(([worker_id, totals]) => {
        const regularPay = totals.regular_hours * totals.hourly_rate;
        const overtimePay = totals.overtime_hours * totals.hourly_rate * totals.overtime_multiplier;
        const grossPay = regularPay + overtimePay;
        const deductions = grossPay * 0.0385; // NIB contribution ~3.85%
        const netPay = grossPay - deductions;

        return {
          pay_period_id: selectedPeriod.id,
          worker_id,
          regular_hours: totals.regular_hours,
          overtime_hours: totals.overtime_hours,
          regular_rate: totals.hourly_rate,
          overtime_rate: totals.hourly_rate * totals.overtime_multiplier,
          gross_pay: grossPay,
          deductions,
          net_pay: netPay,
          deduction_details: { nib: deductions },
        };
      });

      // Insert payroll entries
      const { error: entriesError } = await supabase
        .from("payroll_entries")
        .insert(payrollEntries);

      if (entriesError) throw entriesError;

      // Update pay period status
      const { error: periodError } = await supabase
        .from("pay_periods")
        .update({
          status: "processing",
          processed_at: new Date().toISOString(),
          processed_by: user.id,
        })
        .eq("id", selectedPeriod.id);

      if (periodError) throw periodError;

      toast({
        title: "Payroll processed",
        description: `Payroll has been calculated for ${payrollEntries.length} workers.`,
        variant: "success",
      });

      setProcessDialogOpen(false);
      fetchData();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "An error occurred";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkPaid = async () => {
    if (!selectedPeriod) return;

    try {
      const { error } = await supabase
        .from("pay_periods")
        .update({ status: "paid" })
        .eq("id", selectedPeriod.id);

      if (error) throw error;

      toast({
        title: "Pay period marked as paid",
        variant: "success",
      });

      fetchData();
    } catch (error) {
      console.error("Error updating period:", error);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      open: "bg-blue-100 text-blue-800",
      processing: "bg-yellow-100 text-yellow-800",
      paid: "bg-green-100 text-green-800",
      cancelled: "bg-red-100 text-red-800",
    };
    return colors[status] || "bg-gray-100 text-gray-800";
  };

  const totalGrossPay = selectedPeriod?.entries?.reduce((sum, e) => sum + e.gross_pay, 0) || 0;
  const totalDeductions = selectedPeriod?.entries?.reduce((sum, e) => sum + e.deductions, 0) || 0;
  const totalNetPay = selectedPeriod?.entries?.reduce((sum, e) => sum + e.net_pay, 0) || 0;

  return (
    <div className="flex flex-col min-h-screen">
      <Header title="Payroll" description="Manage pay periods and worker compensation">
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Pay Period
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Pay Period</DialogTitle>
              <DialogDescription>Define the date range for this pay period</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreatePeriod}>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="start_date">Start Date</Label>
                  <Input
                    id="start_date"
                    type="date"
                    value={periodForm.start_date}
                    onChange={(e) => setPeriodForm({ ...periodForm, start_date: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end_date">End Date</Label>
                  <Input
                    id="end_date"
                    type="date"
                    value={periodForm.end_date}
                    onChange={(e) => setPeriodForm({ ...periodForm, end_date: e.target.value })}
                    required
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Create Period
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </Header>

      <div className="flex-1 p-6 space-y-6">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Pay Periods List */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle>Pay Periods</CardTitle>
              <CardDescription>Select a period to view details</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-4 text-center">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                </div>
              ) : payPeriods.length > 0 ? (
                <div className="divide-y">
                  {payPeriods.map((period) => (
                    <button
                      key={period.id}
                      onClick={() => fetchPeriodEntries(period)}
                      className={`w-full p-4 text-left hover:bg-muted transition-colors ${
                        selectedPeriod?.id === period.id ? "bg-muted" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm">
                            {formatDate(period.start_date)} - {formatDate(period.end_date)}
                          </p>
                          <Badge className={`mt-1 ${getStatusColor(period.status)}`}>
                            {period.status}
                          </Badge>
                        </div>
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="p-4 text-center text-muted-foreground">
                  No pay periods created yet
                </div>
              )}
            </CardContent>
          </Card>

          {/* Period Details */}
          <Card className="lg:col-span-2">
            {selectedPeriod ? (
              <>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>
                      {formatDate(selectedPeriod.start_date)} - {formatDate(selectedPeriod.end_date)}
                    </CardTitle>
                    <CardDescription>
                      <Badge className={getStatusColor(selectedPeriod.status)}>
                        {selectedPeriod.status}
                      </Badge>
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    {selectedPeriod.status === "open" && (
                      <Dialog open={processDialogOpen} onOpenChange={setProcessDialogOpen}>
                        <DialogTrigger asChild>
                          <Button>
                            <Calculator className="h-4 w-4 mr-2" />
                            Process Payroll
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Process Payroll</DialogTitle>
                            <DialogDescription>
                              This will calculate pay for all workers based on their time entries
                              for this pay period. This action cannot be undone.
                            </DialogDescription>
                          </DialogHeader>
                          <DialogFooter>
                            <Button variant="outline" onClick={() => setProcessDialogOpen(false)}>
                              Cancel
                            </Button>
                            <Button onClick={handleProcessPayroll} disabled={submitting}>
                              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                              Process
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    )}
                    {selectedPeriod.status === "processing" && (
                      <Button onClick={handleMarkPaid}>
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Mark as Paid
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Summary Cards */}
                  <div className="grid gap-4 md:grid-cols-3 mb-6">
                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2">
                          <DollarSign className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">Gross Pay</span>
                        </div>
                        <p className="text-2xl font-bold mt-1">{formatCurrency(totalGrossPay)}</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">Deductions</span>
                        </div>
                        <p className="text-2xl font-bold mt-1">{formatCurrency(totalDeductions)}</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-green-600" />
                          <span className="text-sm text-muted-foreground">Net Pay</span>
                        </div>
                        <p className="text-2xl font-bold mt-1 text-green-600">
                          {formatCurrency(totalNetPay)}
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Payroll Entries */}
                  {selectedPeriod.entries && selectedPeriod.entries.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Worker</TableHead>
                          <TableHead>Regular Hrs</TableHead>
                          <TableHead>OT Hrs</TableHead>
                          <TableHead>Gross Pay</TableHead>
                          <TableHead>Deductions</TableHead>
                          <TableHead>Net Pay</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedPeriod.entries.map((entry) => (
                          <TableRow key={entry.id}>
                            <TableCell className="font-medium">
                              {entry.worker?.first_name} {entry.worker?.last_name}
                            </TableCell>
                            <TableCell>{entry.regular_hours.toFixed(1)}</TableCell>
                            <TableCell>{entry.overtime_hours.toFixed(1)}</TableCell>
                            <TableCell>{formatCurrency(entry.gross_pay)}</TableCell>
                            <TableCell>{formatCurrency(entry.deductions)}</TableCell>
                            <TableCell className="font-medium">
                              {formatCurrency(entry.net_pay)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No payroll entries yet</p>
                      {selectedPeriod.status === "open" && (
                        <p className="text-sm mt-2">
                          Process payroll to generate entries
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </>
            ) : (
              <CardContent className="p-12 text-center">
                <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No period selected</h3>
                <p className="text-muted-foreground">
                  Select a pay period to view details
                </p>
              </CardContent>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
