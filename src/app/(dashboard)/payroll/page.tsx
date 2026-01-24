"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { DatePicker } from "@/components/ui/date-picker";
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

// NIB Constants (Bahamian National Insurance Board)
const NIB_EMPLOYEE_RATE = 0.0465; // 4.65%
const NIB_EMPLOYER_RATE = 0.0665; // 6.65%
const NIB_WEEKLY_MAX_INSURABLE = 550; // $550 per week max insurable wages

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
  deduction_details?: {
    nib_employee?: number;
    nib_employer?: number;
    nib_insurable_wages?: number;
  };
  worker?: {
    first_name: string;
    last_name: string;
    nib_enabled?: boolean;
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
    if (profile?.company_id) {
      fetchData();
    }
  }, [profile?.company_id]);

  const fetchData = async () => {
    if (!profile?.company_id) return;
    
    setLoading(true);
    try {
      // Fetch pay periods
      const { data: periodsData } = await supabase
        .from("pay_periods")
        .select("*")
        .order("start_date", { ascending: false });
      setPayPeriods(periodsData || []);

      // Fetch active workers (filtered by company_id)
      const { data: workersData } = await supabase
        .from("workers")
        .select("*")
        .eq("company_id", profile.company_id)
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
        worker:workers(first_name, last_name, nib_enabled)
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
      // Ensure dates are in YYYY-MM-DD format (no time component)
      const startDate = periodForm.start_date.split('T')[0];
      const endDate = periodForm.end_date.split('T')[0];
      
      const { data, error } = await supabase
        .from("pay_periods")
        .insert({
          start_date: startDate,
          end_date: endDate,
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
      // Fetch time entries for the pay period with worker NIB settings
      const { data: timeEntries, error: timeEntriesError } = await supabase
        .from("time_entries")
        .select(`
          worker_id,
          regular_hours,
          overtime_hours,
          date,
          workers(hourly_rate, overtime_rate_multiplier, nib_enabled)
        `)
        .gte("date", selectedPeriod.start_date)
        .lte("date", selectedPeriod.end_date);

      if (timeEntriesError) {
        throw new Error(`Failed to fetch time entries: ${timeEntriesError.message}`);
      }

      if (!timeEntries || timeEntries.length === 0) {
        toast({
          title: "No time entries",
          description: "No time entries found for this pay period.",
          variant: "destructive",
        });
        setSubmitting(false);
        return;
      }

      // Calculate number of weeks in pay period for NIB max calculation
      const startDate = new Date(selectedPeriod.start_date);
      const endDate = new Date(selectedPeriod.end_date);
      const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const weeksInPeriod = Math.ceil(daysDiff / 7);

      // Aggregate by worker
      const workerTotals: Record<string, {
        regular_hours: number;
        overtime_hours: number;
        hourly_rate: number;
        overtime_multiplier: number;
        nib_enabled: boolean;
      }> = {};

      timeEntries.forEach((entry: any) => {
        // Convert DECIMAL to number
        const regularHours = typeof entry.regular_hours === 'string' 
          ? parseFloat(entry.regular_hours) 
          : Number(entry.regular_hours) || 0;
        const overtimeHours = typeof entry.overtime_hours === 'string'
          ? parseFloat(entry.overtime_hours)
          : Number(entry.overtime_hours) || 0;

        if (!workerTotals[entry.worker_id]) {
          workerTotals[entry.worker_id] = {
            regular_hours: 0,
            overtime_hours: 0,
            hourly_rate: Number(entry.workers?.hourly_rate) || 0,
            overtime_multiplier: Number(entry.workers?.overtime_rate_multiplier) || 1.5,
            nib_enabled: entry.workers?.nib_enabled ?? true,
          };
        }
        workerTotals[entry.worker_id].regular_hours += regularHours;
        workerTotals[entry.worker_id].overtime_hours += overtimeHours;
      });

      // Create payroll entries with proper NIB calculations
      const payrollEntries = Object.entries(workerTotals).map(([worker_id, totals]) => {
        const regularPay = totals.regular_hours * totals.hourly_rate;
        const overtimePay = totals.overtime_hours * totals.hourly_rate * totals.overtime_multiplier;
        const grossPay = regularPay + overtimePay;

        // Calculate NIB deductions if enabled
        let nibEmployeeDeduction = 0;
        let nibEmployerContribution = 0;
        let nibInsurableWages = 0;

        if (totals.nib_enabled) {
          // Max insurable wages for the pay period (based on number of weeks)
          const maxInsurableWages = NIB_WEEKLY_MAX_INSURABLE * weeksInPeriod;

          // Insurable wages is the lesser of gross pay or max
          nibInsurableWages = Math.min(grossPay, maxInsurableWages);

          // Calculate NIB contributions
          nibEmployeeDeduction = nibInsurableWages * NIB_EMPLOYEE_RATE;
          nibEmployerContribution = nibInsurableWages * NIB_EMPLOYER_RATE;
        }

        const totalDeductions = nibEmployeeDeduction;
        const netPay = grossPay - totalDeductions;

        return {
          pay_period_id: selectedPeriod.id,
          worker_id,
          regular_hours: totals.regular_hours,
          overtime_hours: totals.overtime_hours,
          regular_rate: totals.hourly_rate,
          overtime_rate: totals.hourly_rate * totals.overtime_multiplier,
          gross_pay: grossPay,
          deductions: totalDeductions,
          net_pay: netPay,
          deduction_details: {
            nib_employee: nibEmployeeDeduction,
            nib_employer: nibEmployerContribution,
            nib_insurable_wages: nibInsurableWages,
          },
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
      
      // Refresh the pay periods list
      const { data: periodsData } = await supabase
        .from("pay_periods")
        .select("*")
        .order("start_date", { ascending: false });
      setPayPeriods(periodsData || []);
      
      // Refresh the selected period to show the new payroll entries
      if (selectedPeriod) {
        const updatedPeriod = periodsData?.find((p) => p.id === selectedPeriod.id);
        if (updatedPeriod) {
          await fetchPeriodEntries(updatedPeriod);
        }
      }
    } catch (error: unknown) {
      console.error("Payroll processing error:", error);
      const errorMessage = error instanceof Error ? error.message : "An error occurred";
      toast({
        title: "Error processing payroll",
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
      open: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
      processing: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
      paid: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
      cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    };
    return colors[status] || "bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-300";
  };

  const totalGrossPay = selectedPeriod?.entries?.reduce((sum, e) => sum + e.gross_pay, 0) || 0;
  const totalDeductions = selectedPeriod?.entries?.reduce((sum, e) => sum + e.deductions, 0) || 0;
  const totalNetPay = selectedPeriod?.entries?.reduce((sum, e) => sum + e.net_pay, 0) || 0;
  const totalNibEmployee = selectedPeriod?.entries?.reduce((sum, e) => sum + (e.deduction_details?.nib_employee || 0), 0) || 0;
  const totalNibEmployer = selectedPeriod?.entries?.reduce((sum, e) => sum + (e.deduction_details?.nib_employer || 0), 0) || 0;

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
                  <DatePicker
                    id="start_date"
                    value={periodForm.start_date}
                    onChange={(value) => setPeriodForm({ ...periodForm, start_date: value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end_date">End Date</Label>
                  <DatePicker
                    id="end_date"
                    value={periodForm.end_date}
                    onChange={(value) => setPeriodForm({ ...periodForm, end_date: value })}
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
                        Mark as Paid
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Summary Cards */}
                  <div className="grid gap-4 md:grid-cols-4 mb-6">
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
                          <AlertCircle className="h-4 w-4 text-orange-500" />
                          <span className="text-sm text-muted-foreground">NIB Employee (4.65%)</span>
                        </div>
                        <p className="text-2xl font-bold mt-1">{formatCurrency(totalNibEmployee)}</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="h-4 w-4 text-blue-500" />
                          <span className="text-sm text-muted-foreground">NIB Employer (6.65%)</span>
                        </div>
                        <p className="text-2xl font-bold mt-1 text-blue-600">{formatCurrency(totalNibEmployer)}</p>
                        <p className="text-xs text-muted-foreground mt-1">Company expense</p>
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
                          <TableHead className="text-right">Hours</TableHead>
                          <TableHead className="text-right">Gross Pay</TableHead>
                          <TableHead className="text-right">NIB (EE)</TableHead>
                          <TableHead className="text-right">NIB (ER)</TableHead>
                          <TableHead className="text-right">Net Pay</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedPeriod.entries.map((entry) => (
                          <TableRow key={entry.id}>
                            <TableCell>
                              <div className="font-medium">
                                {entry.worker?.first_name} {entry.worker?.last_name}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {entry.regular_hours.toFixed(1)} reg + {entry.overtime_hours.toFixed(1)} OT
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              {(entry.regular_hours + entry.overtime_hours).toFixed(1)}
                            </TableCell>
                            <TableCell className="text-right">{formatCurrency(entry.gross_pay)}</TableCell>
                            <TableCell className="text-right text-orange-600">
                              {entry.deduction_details?.nib_employee
                                ? formatCurrency(entry.deduction_details.nib_employee)
                                : "-"}
                            </TableCell>
                            <TableCell className="text-right text-blue-600">
                              {entry.deduction_details?.nib_employer
                                ? formatCurrency(entry.deduction_details.nib_employer)
                                : "-"}
                            </TableCell>
                            <TableCell className="text-right font-medium text-green-600">
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
