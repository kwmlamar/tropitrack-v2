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
  Check,
  X,
  Banknote,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
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
  is_paid?: boolean;
  paid_at?: string;
  total_paid?: number;
  payment_status?: "unpaid" | "partial" | "paid";
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
  const { user, profile, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [payPeriods, setPayPeriods] = useState<PayPeriodWithEntries[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<PayPeriodWithEntries | null>(null);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [processDialogOpen, setProcessDialogOpen] = useState(false);
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(new Set());
  const [payingEntryId, setPayingEntryId] = useState<string | null>(null);
  const [payingBulk, setPayingBulk] = useState(false);
  const [singlePayDialogOpen, setSinglePayDialogOpen] = useState(false);
  const [payingEntry, setPayingEntry] = useState<PayrollEntry | null>(null);
  const [payAmount, setPayAmount] = useState<string>("");
  const [payMethod, setPayMethod] = useState<string>("cash");
  const supabase = createClient();

  const [periodForm, setPeriodForm] = useState({
    start_date: "",
    end_date: "",
  });

  useEffect(() => {
    // Wait for auth to finish loading
    if (authLoading) return;
    
    // If profile exists but no company_id, stop loading
    if (profile && !profile.company_id) {
      setLoading(false);
      return;
    }
    
    // If profile has company_id, fetch data
    if (profile?.company_id) {
      fetchData();
    } else if (profile === null) {
      setLoading(false);
    }
  }, [profile?.company_id, profile, authLoading]);

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

  const handleToggleEntry = (entryId: string) => {
    const newSelected = new Set(selectedEntries);
    if (newSelected.has(entryId)) {
      newSelected.delete(entryId);
    } else {
      newSelected.add(entryId);
    }
    setSelectedEntries(newSelected);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked && selectedPeriod?.entries) {
      // Select all entries with remaining balance
      const unpaidIds = selectedPeriod.entries
        .filter((e) => !e.is_paid && e.payment_status !== "paid")
        .map((e) => e.id);
      setSelectedEntries(new Set(unpaidIds));
    } else {
      setSelectedEntries(new Set());
    }
  };

  const handlePaySelected = async () => {
    if (selectedEntries.size === 0 || !selectedPeriod) return;

    const currentPeriodId = selectedPeriod.id;
    setPayingBulk(true);
    try {
      // Get selected entries with their remaining balances
      const selectedEntryList = selectedPeriod.entries?.filter((e) => selectedEntries.has(e.id)) || [];

      // Create payment transactions for each (pays remaining balance)
      const transactions = selectedEntryList.map((entry) => ({
        payroll_entry_id: entry.id,
        amount: entry.net_pay - (entry.total_paid || 0),
        payment_method: "cash",
        created_by: user?.id,
      }));

      const { error } = await supabase
        .from("payment_transactions")
        .insert(transactions);

      if (error) throw error;

      // Check if all entries in the period are now paid
      const { data: allEntries } = await supabase
        .from("payroll_entries")
        .select("id, is_paid")
        .eq("pay_period_id", currentPeriodId);

      const allPaid = allEntries?.every((e) => e.is_paid || selectedEntries.has(e.id));

      // If all are paid, update the period status
      if (allPaid) {
        await supabase
          .from("pay_periods")
          .update({ status: "paid" })
          .eq("id", currentPeriodId);
      }

      toast({
        title: "Payment recorded",
        description: `Paid ${selectedEntryList.length} worker(s).`,
        variant: "success",
      });

      setSelectedEntries(new Set());
      setPayDialogOpen(false);

      // Refresh data
      const { data: periodsData } = await supabase
        .from("pay_periods")
        .select("*")
        .order("start_date", { ascending: false });
      setPayPeriods(periodsData || []);

      const updatedPeriod = periodsData?.find((p) => p.id === currentPeriodId);
      if (updatedPeriod) {
        await fetchPeriodEntries(updatedPeriod);
      }
    } catch (error: any) {
      console.error("Error recording payments:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to record payments",
        variant: "destructive",
      });
    } finally {
      setPayingBulk(false);
    }
  };

  const openPayDialog = (entry: PayrollEntry) => {
    setPayingEntry(entry);
    const remaining = entry.net_pay - (entry.total_paid || 0);
    setPayAmount(remaining.toFixed(2));
    setPayMethod("cash");
    setSinglePayDialogOpen(true);
  };

  const handlePaySingleEntry = async () => {
    if (!selectedPeriod || !payingEntry) return;

    const amount = parseFloat(payAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: "Invalid amount",
        description: "Please enter a valid payment amount",
        variant: "destructive",
      });
      return;
    }

    const remaining = payingEntry.net_pay - (payingEntry.total_paid || 0);
    if (amount > remaining + 0.01) {
      toast({
        title: "Amount exceeds balance",
        description: `Maximum payment is ${formatCurrency(remaining)}`,
        variant: "destructive",
      });
      return;
    }

    const currentPeriodId = selectedPeriod.id;
    setPayingEntryId(payingEntry.id);
    try {
      // Insert payment transaction (trigger will update payroll_entry)
      const { error } = await supabase
        .from("payment_transactions")
        .insert({
          payroll_entry_id: payingEntry.id,
          amount: amount,
          payment_method: payMethod,
          created_by: user?.id,
        });

      if (error) throw error;

      // Check if all entries in the period are now paid
      const { data: allEntries } = await supabase
        .from("payroll_entries")
        .select("id, is_paid, net_pay, total_paid")
        .eq("pay_period_id", currentPeriodId);

      const allPaid = allEntries?.every((e) => {
        if (e.id === payingEntry.id) {
          return (e.total_paid || 0) + amount >= e.net_pay;
        }
        return e.is_paid;
      });

      if (allPaid) {
        await supabase
          .from("pay_periods")
          .update({ status: "paid" })
          .eq("id", currentPeriodId);
      }

      toast({
        title: "Payment recorded",
        description: `${formatCurrency(amount)} paid to ${payingEntry.worker?.first_name}`,
        variant: "success",
      });

      setSinglePayDialogOpen(false);
      setPayingEntry(null);

      // Refresh data
      const { data: periodsData } = await supabase
        .from("pay_periods")
        .select("*")
        .order("start_date", { ascending: false });
      setPayPeriods(periodsData || []);

      const updatedPeriod = periodsData?.find((p) => p.id === currentPeriodId);
      if (updatedPeriod) {
        await fetchPeriodEntries(updatedPeriod);
      }
    } catch (error: any) {
      console.error("Error recording payment:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to record payment",
        variant: "destructive",
      });
    } finally {
      setPayingEntryId(null);
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

  const paidEntries = selectedPeriod?.entries?.filter((e) => e.payment_status === "paid" || e.is_paid) || [];
  const partialEntries = selectedPeriod?.entries?.filter((e) => e.payment_status === "partial") || [];
  const unpaidEntries = selectedPeriod?.entries?.filter((e) => !e.is_paid && e.payment_status !== "partial") || [];
  const totalPaidAmount = selectedPeriod?.entries?.reduce((sum, e) => sum + (e.total_paid || 0), 0) || 0;
  const totalUnpaidAmount = totalNetPay - totalPaidAmount;
  const selectedTotal = selectedPeriod?.entries
    ?.filter((e) => selectedEntries.has(e.id))
    .reduce((sum, e) => sum + (e.net_pay - (e.total_paid || 0)), 0) || 0;

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
                    {selectedPeriod.status === "processing" && unpaidEntries.length > 0 && (
                      <>
                        {selectedEntries.size > 0 && (
                          <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
                            <DialogTrigger asChild>
                              <Button variant="default">
                                <Banknote className="h-4 w-4 mr-2" />
                                Pay Selected ({selectedEntries.size})
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Confirm Payment</DialogTitle>
                                <DialogDescription>
                                  You are about to mark {selectedEntries.size} worker(s) as paid
                                  for a total of {formatCurrency(selectedTotal)}.
                                </DialogDescription>
                              </DialogHeader>
                              <div className="py-4">
                                <div className="rounded-lg bg-muted p-4">
                                  <div className="flex justify-between items-center">
                                    <span className="text-sm text-muted-foreground">Workers selected</span>
                                    <span className="font-medium">{selectedEntries.size}</span>
                                  </div>
                                  <div className="flex justify-between items-center mt-2">
                                    <span className="text-sm text-muted-foreground">Total amount</span>
                                    <span className="text-lg font-bold text-green-600">
                                      {formatCurrency(selectedTotal)}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <DialogFooter>
                                <Button variant="outline" onClick={() => setPayDialogOpen(false)}>
                                  Cancel
                                </Button>
                                <Button onClick={handlePaySelected} disabled={payingBulk}>
                                  {payingBulk && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                  Confirm Payment
                                </Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                        )}
                        <Button variant="outline" onClick={handleMarkPaid}>
                          Mark All Paid
                        </Button>
                      </>
                    )}
                    {selectedPeriod.status === "paid" && (
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 px-3 py-1">
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Fully Paid
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Summary Cards */}
                  <div className="grid gap-4 md:grid-cols-5 mb-6">
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
                          <span className="text-sm text-muted-foreground">NIB Employee</span>
                        </div>
                        <p className="text-2xl font-bold mt-1">{formatCurrency(totalNibEmployee)}</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="h-4 w-4 text-blue-500" />
                          <span className="text-sm text-muted-foreground">NIB Employer</span>
                        </div>
                        <p className="text-2xl font-bold mt-1 text-blue-600">{formatCurrency(totalNibEmployer)}</p>
                      </CardContent>
                    </Card>
                    <Card className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-green-600" />
                          <span className="text-sm text-muted-foreground">Paid</span>
                        </div>
                        <p className="text-2xl font-bold mt-1 text-green-600">
                          {formatCurrency(totalPaidAmount)}
                        </p>
                        <p className="text-xs text-muted-foreground">{paidEntries.length} worker(s)</p>
                      </CardContent>
                    </Card>
                    <Card className="bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-orange-600" />
                          <span className="text-sm text-muted-foreground">Unpaid</span>
                        </div>
                        <p className="text-2xl font-bold mt-1 text-orange-600">
                          {formatCurrency(totalUnpaidAmount)}
                        </p>
                        <p className="text-xs text-muted-foreground">{unpaidEntries.length} worker(s)</p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Payroll Entries */}
                  {selectedPeriod.entries && selectedPeriod.entries.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {selectedPeriod.status === "processing" && (unpaidEntries.length > 0 || partialEntries.length > 0) && (
                            <TableHead className="w-10">
                              <Checkbox
                                checked={
                                  (unpaidEntries.length > 0 || partialEntries.length > 0) &&
                                  [...unpaidEntries, ...partialEntries].every((e) => selectedEntries.has(e.id))
                                }
                                onCheckedChange={handleSelectAll}
                                aria-label="Select all with balance"
                              />
                            </TableHead>
                          )}
                          <TableHead>Worker</TableHead>
                          <TableHead className="text-right">Hours</TableHead>
                          <TableHead className="text-right">Gross Pay</TableHead>
                          <TableHead className="text-right">NIB (EE)</TableHead>
                          <TableHead className="text-right">NIB (ER)</TableHead>
                          <TableHead className="text-right">Net Pay</TableHead>
                          <TableHead className="text-center">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedPeriod.entries.map((entry) => {
                          const isPaid = entry.is_paid || entry.payment_status === "paid";
                          const hasBalance = !isPaid && (entry.net_pay - (entry.total_paid || 0)) > 0;
                          return (
                          <TableRow
                            key={entry.id}
                            className={isPaid ? "bg-green-50/50 dark:bg-green-900/10" : entry.payment_status === "partial" ? "bg-amber-50/30 dark:bg-amber-900/10" : ""}
                          >
                            {selectedPeriod.status === "processing" && (unpaidEntries.length > 0 || partialEntries.length > 0) && (
                              <TableCell>
                                {hasBalance && (
                                  <Checkbox
                                    checked={selectedEntries.has(entry.id)}
                                    onCheckedChange={() => handleToggleEntry(entry.id)}
                                    aria-label={`Select ${entry.worker?.first_name}`}
                                  />
                                )}
                              </TableCell>
                            )}
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
                            <TableCell className="text-right">
                              <div className="font-medium text-green-600">{formatCurrency(entry.net_pay)}</div>
                              {(entry.total_paid || 0) > 0 && !entry.is_paid && (
                                <div className="text-xs text-muted-foreground">
                                  Bal: {formatCurrency(entry.net_pay - (entry.total_paid || 0))}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              {entry.is_paid || entry.payment_status === "paid" ? (
                                <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                                  <Check className="h-3 w-3 mr-1" />
                                  Paid
                                </Badge>
                              ) : entry.payment_status === "partial" ? (
                                <div className="flex flex-col items-center gap-1">
                                  <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 text-xs">
                                    Partial
                                  </Badge>
                                  {selectedPeriod.status === "processing" && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => openPayDialog(entry)}
                                      disabled={payingEntryId !== null || payingBulk}
                                      className="h-6 text-xs px-2"
                                    >
                                      +Pay
                                    </Button>
                                  )}
                                </div>
                              ) : selectedPeriod.status === "processing" ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openPayDialog(entry)}
                                  disabled={payingEntryId !== null || payingBulk}
                                  className="h-7 text-xs"
                                >
                                  <Banknote className="h-3 w-3 mr-1" />
                                  Pay
                                </Button>
                              ) : (
                                <Badge variant="outline" className="text-muted-foreground">
                                  Pending
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                        })}
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

      {/* Single Payment Dialog */}
      <Dialog open={singlePayDialogOpen} onOpenChange={setSinglePayDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              {payingEntry?.worker?.first_name} {payingEntry?.worker?.last_name}
            </DialogDescription>
          </DialogHeader>
          {payingEntry && (
            <div className="space-y-4 py-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Net Pay</span>
                <span className="font-medium">{formatCurrency(payingEntry.net_pay)}</span>
              </div>
              {(payingEntry.total_paid || 0) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Already Paid</span>
                  <span className="text-green-600">{formatCurrency(payingEntry.total_paid || 0)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-medium border-t pt-2">
                <span>Balance Due</span>
                <span>{formatCurrency(payingEntry.net_pay - (payingEntry.total_paid || 0))}</span>
              </div>

              <div className="space-y-2">
                <Label htmlFor="pay_amount">Payment Amount</Label>
                <Input
                  id="pay_amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={payingEntry.net_pay - (payingEntry.total_paid || 0)}
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="pay_method">Method</Label>
                <Select value={payMethod} onValueChange={setPayMethod}>
                  <SelectTrigger id="pay_method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="check">Check</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSinglePayDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handlePaySingleEntry} disabled={payingEntryId !== null}>
              {payingEntryId && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Record Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
