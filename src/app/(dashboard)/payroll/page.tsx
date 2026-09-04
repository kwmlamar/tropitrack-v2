"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import type { PayPeriod, Worker, PayrollAdjustment, PayrollAdjustmentType } from "@/types";

// NIB Constants
const NIB_EMPLOYEE_RATE = 0.0465;
const NIB_EMPLOYER_RATE = 0.0665;
const NIB_WEEKLY_MAX_INSURABLE = 550;

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
  deduction_details?: { nib_employee?: number; nib_employer?: number; nib_insurable_wages?: number };
  worker?: { first_name: string; last_name: string; nib_enabled?: boolean };
}

interface PayPeriodWithEntries extends PayPeriod {
  entries?: PayrollEntry[];
}

const PERIOD_DOT: Record<string, string> = {
  open:       "bg-info-solid",
  processing: "bg-primary",
  paid:       "bg-success-solid",
  cancelled:  "bg-destructive-solid",
};

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
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("cash");
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false);
  const [voidDialogOpen, setVoidDialogOpen] = useState(false);
  const [adjustmentDialogOpen, setAdjustmentDialogOpen] = useState(false);
  const [adjustmentsListOpen, setAdjustmentsListOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [voidReason, setVoidReason] = useState("");
  const [adjustments, setAdjustments] = useState<PayrollAdjustment[]>([]);
  const [adjustmentForm, setAdjustmentForm] = useState({
    worker_id: "", adjustment_type: "correction" as PayrollAdjustmentType,
    hours_adjustment: "0", amount_adjustment: "0", reason: "",
  });
  const [periodForm, setPeriodForm] = useState({ start_date: "", end_date: "" });
  const supabase = createClient();

  useEffect(() => {
    if (authLoading) return;
    if (profile && !profile.company_id) { setLoading(false); return; }
    if (profile?.company_id) fetchData();
    else if (profile === null) setLoading(false);
  }, [profile?.company_id, profile, authLoading]);

  const fetchData = async () => {
    if (!profile?.company_id) return;
    setLoading(true);
    try {
      const [{ data: periodsData }, { data: workersData }] = await Promise.all([
        supabase.from("pay_periods").select("*").order("start_date", { ascending: false }),
        supabase.from("workers").select("*").eq("company_id", profile.company_id).eq("status", "active").order("last_name"),
      ]);
      setPayPeriods(periodsData || []);
      setWorkers(workersData || []);
      const openPeriod = periodsData?.find(p => p.status === "open");
      if (openPeriod) await fetchPeriodEntries(openPeriod);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPeriodEntries = async (period: PayPeriod) => {
    const { data } = await supabase
      .from("payroll_entries")
      .select("*, worker:workers(first_name, last_name, nib_enabled)")
      .eq("pay_period_id", period.id);
    setSelectedPeriod({ ...period, entries: data || [] });
  };

  const handleCreatePeriod = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { data, error } = await supabase
        .from("pay_periods")
        .insert({ start_date: periodForm.start_date.split("T")[0], end_date: periodForm.end_date.split("T")[0], status: "open", company_id: profile!.company_id })
        .select().single();
      if (error) throw error;
      toast({ title: "Pay period created" });
      setCreateDialogOpen(false);
      setPeriodForm({ start_date: "", end_date: "" });
      fetchData();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleProcessPayroll = async () => {
    if (!selectedPeriod || !user) return;
    setSubmitting(true);
    try {
      const { data: timeEntries, error } = await supabase
        .from("time_entries")
        .select("worker_id, regular_hours, overtime_hours, date, workers(hourly_rate, overtime_rate_multiplier, nib_enabled)")
        .gte("date", selectedPeriod.start_date)
        .lte("date", selectedPeriod.end_date);
      if (error) throw error;
      if (!timeEntries?.length) {
        toast({ title: "No time entries found", variant: "destructive" });
        setSubmitting(false);
        return;
      }
      const start = new Date(selectedPeriod.start_date);
      const end = new Date(selectedPeriod.end_date);
      const weeksInPeriod = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 7));
      const workerTotals: Record<string, any> = {};
      timeEntries.forEach((entry: any) => {
        const reg = parseFloat(entry.regular_hours) || 0;
        const ot = parseFloat(entry.overtime_hours) || 0;
        if (!workerTotals[entry.worker_id]) {
          workerTotals[entry.worker_id] = { regular_hours: 0, overtime_hours: 0, hourly_rate: Number(entry.workers?.hourly_rate) || 0, overtime_multiplier: Number(entry.workers?.overtime_rate_multiplier) || 1.5, nib_enabled: entry.workers?.nib_enabled ?? true };
        }
        workerTotals[entry.worker_id].regular_hours += reg;
        workerTotals[entry.worker_id].overtime_hours += ot;
      });
      const payrollEntries = Object.entries(workerTotals).map(([worker_id, t]) => {
        const grossPay = t.regular_hours * t.hourly_rate + t.overtime_hours * t.hourly_rate * t.overtime_multiplier;
        let nibEE = 0, nibER = 0, nibWages = 0;
        if (t.nib_enabled) {
          nibWages = Math.min(grossPay, NIB_WEEKLY_MAX_INSURABLE * weeksInPeriod);
          nibEE = nibWages * NIB_EMPLOYEE_RATE;
          nibER = nibWages * NIB_EMPLOYER_RATE;
        }
        return { company_id: profile!.company_id, pay_period_id: selectedPeriod.id, worker_id, regular_hours: t.regular_hours, overtime_hours: t.overtime_hours, regular_rate: t.hourly_rate, overtime_rate: t.hourly_rate * t.overtime_multiplier, gross_pay: grossPay, deductions: nibEE, net_pay: grossPay - nibEE, deduction_details: { nib_employee: nibEE, nib_employer: nibER, nib_insurable_wages: nibWages } };
      });
      const { error: insErr } = await supabase.from("payroll_entries").insert(payrollEntries);
      if (insErr) throw insErr;
      await supabase.from("pay_periods").update({ status: "processing", processed_at: new Date().toISOString(), processed_by: user.id }).eq("id", selectedPeriod.id);
      toast({ title: "Payroll processed", description: `${payrollEntries.length} workers calculated.` });
      setProcessDialogOpen(false);
      fetchData();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkPaid = async () => {
    if (!selectedPeriod) return;
    await supabase.from("pay_periods").update({ status: "paid" }).eq("id", selectedPeriod.id);
    toast({ title: "Marked as paid" });
    fetchData();
  };

  const handleToggleEntry = (id: string) => {
    const s = new Set(selectedEntries);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelectedEntries(s);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked && selectedPeriod?.entries) {
      setSelectedEntries(new Set([...unpaidEntries, ...partialEntries].map(e => e.id)));
    } else {
      setSelectedEntries(new Set());
    }
  };

  const handlePaySelected = async () => {
    if (!selectedEntries.size || !selectedPeriod) return;
    const periodId = selectedPeriod.id;
    setPayingBulk(true);
    try {
      const list = selectedPeriod.entries?.filter(e => selectedEntries.has(e.id)) || [];
      const { error } = await supabase.from("payment_transactions").insert(
        list.map(e => ({ company_id: profile!.company_id, payroll_entry_id: e.id, amount: e.net_pay - (e.total_paid || 0), payment_method: "cash", created_by: user?.id }))
      );
      if (error) throw error;
      const { data: allEntries } = await supabase.from("payroll_entries").select("id, is_paid").eq("pay_period_id", periodId);
      if (allEntries?.every(e => e.is_paid || selectedEntries.has(e.id))) {
        await supabase.from("pay_periods").update({ status: "paid" }).eq("id", periodId);
      }
      toast({ title: "Payment recorded", description: `${list.length} worker(s) paid.` });
      setSelectedEntries(new Set());
      setPayDialogOpen(false);
      const { data: perData } = await supabase.from("pay_periods").select("*").order("start_date", { ascending: false });
      setPayPeriods(perData || []);
      const updated = perData?.find(p => p.id === periodId);
      if (updated) await fetchPeriodEntries(updated);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setPayingBulk(false);
    }
  };

  const openPayDialog = (entry: PayrollEntry) => {
    setPayingEntry(entry);
    setPayAmount((entry.net_pay - (entry.total_paid || 0)).toFixed(2));
    setPayMethod("cash");
    setSinglePayDialogOpen(true);
  };

  const handlePaySingleEntry = async () => {
    if (!selectedPeriod || !payingEntry) return;
    const amount = parseFloat(payAmount);
    if (isNaN(amount) || amount <= 0) { toast({ title: "Invalid amount", variant: "destructive" }); return; }
    const remaining = payingEntry.net_pay - (payingEntry.total_paid || 0);
    if (amount > remaining + 0.01) { toast({ title: "Exceeds balance", variant: "destructive" }); return; }
    const periodId = selectedPeriod.id;
    setPayingEntryId(payingEntry.id);
    try {
      const { error } = await supabase.from("payment_transactions").insert({ company_id: profile!.company_id, payroll_entry_id: payingEntry.id, amount, payment_method: payMethod, created_by: user?.id });
      if (error) throw error;
      const { data: allEntries } = await supabase.from("payroll_entries").select("id, is_paid, net_pay, total_paid").eq("pay_period_id", periodId);
      if (allEntries?.every(e => e.id === payingEntry.id ? (e.total_paid || 0) + amount >= e.net_pay : e.is_paid)) {
        await supabase.from("pay_periods").update({ status: "paid" }).eq("id", periodId);
      }
      toast({ title: "Payment recorded", description: `${formatCurrency(amount)} paid to ${payingEntry.worker?.first_name}` });
      setSinglePayDialogOpen(false);
      setPayingEntry(null);
      const { data: perData } = await supabase.from("pay_periods").select("*").order("start_date", { ascending: false });
      setPayPeriods(perData || []);
      const updated = perData?.find(p => p.id === periodId);
      if (updated) await fetchPeriodEntries(updated);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setPayingEntryId(null);
    }
  };

  const handleReopenPeriod = async () => {
    if (!selectedPeriod || !user || !reopenReason.trim()) return;
    setSubmitting(true);
    try {
      await supabase.from("payroll_entries").delete().eq("pay_period_id", selectedPeriod.id);
      await supabase.from("pay_periods").update({ status: "open", reopened_at: new Date().toISOString(), reopened_by: user.id, reopen_reason: reopenReason, processed_at: null, processed_by: null }).eq("id", selectedPeriod.id);
      toast({ title: "Period reopened" });
      setReopenDialogOpen(false);
      setReopenReason("");
      fetchData();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleVoidPeriod = async () => {
    if (!selectedPeriod || !user || !voidReason.trim()) return;
    setSubmitting(true);
    try {
      await supabase.from("pay_periods").update({ status: "cancelled", voided_at: new Date().toISOString(), voided_by: user.id, void_reason: voidReason }).eq("id", selectedPeriod.id);
      toast({ title: "Period voided" });
      setVoidDialogOpen(false);
      setVoidReason("");
      fetchData();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const fetchAdjustments = async (periodId: string) => {
    const { data } = await supabase.from("payroll_adjustments").select("*, worker:workers(first_name, last_name)").eq("pay_period_id", periodId).order("created_at", { ascending: false });
    if (data) setAdjustments(data);
  };

  const handleCreateAdjustment = async () => {
    if (!selectedPeriod || !user || !adjustmentForm.worker_id || !adjustmentForm.reason.trim()) {
      toast({ title: "Missing information", variant: "destructive" }); return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from("payroll_adjustments").insert({ company_id: profile!.company_id, pay_period_id: selectedPeriod.id, worker_id: adjustmentForm.worker_id, adjustment_type: adjustmentForm.adjustment_type, hours_adjustment: parseFloat(adjustmentForm.hours_adjustment) || 0, amount_adjustment: parseFloat(adjustmentForm.amount_adjustment) || 0, reason: adjustmentForm.reason, created_by: user.id });
      if (error) throw error;
      toast({ title: "Adjustment created" });
      setAdjustmentDialogOpen(false);
      setAdjustmentForm({ worker_id: "", adjustment_type: "correction", hours_adjustment: "0", amount_adjustment: "0", reason: "" });
      fetchAdjustments(selectedPeriod.id);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  // Computed values
  const totalGross = selectedPeriod?.entries?.reduce((s, e) => s + e.gross_pay, 0) || 0;
  const totalNibEE = selectedPeriod?.entries?.reduce((s, e) => s + (e.deduction_details?.nib_employee || 0), 0) || 0;
  const totalNibER = selectedPeriod?.entries?.reduce((s, e) => s + (e.deduction_details?.nib_employer || 0), 0) || 0;
  const totalNet = selectedPeriod?.entries?.reduce((s, e) => s + e.net_pay, 0) || 0;
  const totalPaid = selectedPeriod?.entries?.reduce((s, e) => s + (e.total_paid || 0), 0) || 0;
  const totalUnpaid = totalNet - totalPaid;
  const paidEntries = selectedPeriod?.entries?.filter(e => e.payment_status === "paid" || e.is_paid) || [];
  const partialEntries = selectedPeriod?.entries?.filter(e => e.payment_status === "partial") || [];
  const unpaidEntries = selectedPeriod?.entries?.filter(e => !e.is_paid && e.payment_status !== "partial") || [];
  const selectedTotal = selectedPeriod?.entries?.filter(e => selectedEntries.has(e.id)).reduce((s, e) => s + (e.net_pay - (e.total_paid || 0)), 0) || 0;
  const canSelect = selectedPeriod?.status === "processing" && (unpaidEntries.length > 0 || partialEntries.length > 0);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
        <div>
          <p className="text-[11px] font-mono text-foreground-lighter uppercase tracking-widest">Payroll</p>
          <h1 className="text-[16px] font-semibold text-foreground mt-0.5">Pay Periods</h1>
        </div>
        <button
          onClick={() => setCreateDialogOpen(true)}
          className="text-[12px] font-medium text-brand hover:opacity-80 transition-opacity"
        >
          + New Period
        </button>
      </div>

      {/* Two-panel layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: periods list */}
        <div className="w-[260px] flex-shrink-0 border-r border-border flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">Pay Periods</p>
          </div>
          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="divide-y divide-border">
                {Array(4).fill(0).map((_, i) => <div key={i} className="h-16 animate-pulse" />)}
              </div>
            ) : payPeriods.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-[12px] text-foreground-lighter">No pay periods yet</p>
                <button onClick={() => setCreateDialogOpen(true)} className="mt-2 text-[11px] text-brand hover:opacity-80">
                  Create first →
                </button>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {payPeriods.map(period => (
                  <button
                    key={period.id}
                    onClick={() => fetchPeriodEntries(period)}
                    className={cn(
                      "w-full px-4 py-3 text-left transition-colors",
                      selectedPeriod?.id === period.id ? "bg-surface-100" : "hover:bg-surface-200"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn("h-1.5 w-1.5 rounded-full flex-shrink-0", PERIOD_DOT[period.status] ?? "bg-surface-400")} />
                      <span className="text-[10px] tabular-nums text-foreground-lighter capitalize">{period.status}</span>
                    </div>
                    <p className="text-[12px] text-foreground-light font-medium">
                      {formatDate(period.start_date)} – {formatDate(period.end_date)}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: period detail */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!selectedPeriod ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <p className="text-[13px] text-foreground-lighter">Select a pay period</p>
                <button onClick={() => setCreateDialogOpen(true)} className="mt-3 text-[12px] text-brand hover:opacity-80">
                  or create one →
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Period header */}
              <div className="px-6 py-3 border-b border-border flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div>
                    <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">
                      {formatDate(selectedPeriod.start_date)} — {formatDate(selectedPeriod.end_date)}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={cn("h-1.5 w-1.5 rounded-full", PERIOD_DOT[selectedPeriod.status] ?? "bg-surface-400")} />
                      <span className="text-[11px] tabular-nums text-foreground-lighter capitalize">{selectedPeriod.status}</span>
                      {selectedPeriod.status === "cancelled" && selectedPeriod.void_reason && (
                        <span className="text-[11px] text-foreground-lighter">· {selectedPeriod.void_reason}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {selectedPeriod.status === "open" && (
                    <button onClick={() => setProcessDialogOpen(true)} className="text-[12px] text-brand hover:opacity-80">
                      Process payroll
                    </button>
                  )}
                  {selectedPeriod.status === "processing" && (
                    <>
                      <button onClick={() => setReopenDialogOpen(true)} className="text-[12px] text-brand hover:opacity-80">Reopen</button>
                      <button onClick={() => { fetchAdjustments(selectedPeriod.id); setAdjustmentsListOpen(true); }} className="text-[12px] text-foreground-lighter hover:text-foreground-light transition-colors">Adjustments</button>
                      <button onClick={() => setVoidDialogOpen(true)} className="text-[12px] text-destructive hover:opacity-80">Void</button>
                      {unpaidEntries.length > 0 && (
                        <button onClick={handleMarkPaid} className="text-[12px] text-success hover:opacity-80">
                          Mark all paid
                        </button>
                      )}
                      {selectedEntries.size > 0 && (
                        <button onClick={() => setPayDialogOpen(true)} className="text-[12px] font-medium text-success hover:opacity-80">
                          Pay {selectedEntries.size} selected ({formatCurrency(selectedTotal)})
                        </button>
                      )}
                    </>
                  )}
                  {selectedPeriod.status === "paid" && (
                    <>
                      <span className="text-[11px] tabular-nums text-success">Fully paid</span>
                      <button onClick={() => { fetchAdjustments(selectedPeriod.id); setAdjustmentsListOpen(true); }} className="text-[12px] text-foreground-lighter hover:text-foreground-light transition-colors">Adjustments</button>
                      <button onClick={() => setVoidDialogOpen(true)} className="text-[12px] text-destructive hover:opacity-80">Void</button>
                    </>
                  )}
                </div>
              </div>

              {/* Stat row */}
              {(selectedPeriod.entries?.length ?? 0) > 0 && (
                <div className="px-6 py-3 border-b border-border grid grid-cols-5 gap-3 flex-shrink-0">
                  {[
                    { label: "Gross",    value: formatCurrency(totalGross) },
                    { label: "NIB-EE",   value: formatCurrency(totalNibEE), muted: true },
                    { label: "NIB-ER",   value: formatCurrency(totalNibER), muted: true },
                    { label: "Net Pay",  value: formatCurrency(totalNet), amber: true },
                    { label: "Unpaid",   value: formatCurrency(totalUnpaid), warn: totalUnpaid > 0 },
                  ].map(s => (
                    <div key={s.label} className="rounded-lg border border-border bg-surface-100 px-3 py-2.5">
                      <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-wider">{s.label}</p>
                      <p className={cn(
                        "text-[15px] font-semibold tabular-nums mt-0.5 leading-none",
                        s.amber ? "text-brand" : s.warn ? "text-destructive" : s.muted ? "text-foreground-lighter" : "text-foreground"
                      )}>
                        {s.value}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* Entries table */}
              <div className="flex-1 overflow-auto">
                {!selectedPeriod.entries || selectedPeriod.entries.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full">
                    <p className="text-[13px] text-foreground-lighter">No payroll entries</p>
                    {selectedPeriod.status === "open" && (
                      <button onClick={() => setProcessDialogOpen(true)} className="mt-3 text-[12px] text-brand hover:opacity-80">
                        Process payroll to generate →
                      </button>
                    )}
                  </div>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border sticky top-0 bg-background">
                        {canSelect && (
                          <th className="px-5 py-2.5 w-10">
                            <Checkbox
                              checked={[...unpaidEntries, ...partialEntries].length > 0 && [...unpaidEntries, ...partialEntries].every(e => selectedEntries.has(e.id))}
                              onCheckedChange={handleSelectAll}
                              className="border-strong"
                            />
                          </th>
                        )}
                        <th className="px-5 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">Worker</th>
                        <th className="px-5 py-2.5 text-right text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">Reg</th>
                        <th className="px-5 py-2.5 text-right text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">OT</th>
                        <th className="px-5 py-2.5 text-right text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">Gross</th>
                        <th className="px-5 py-2.5 text-right text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">NIB-EE</th>
                        <th className="px-5 py-2.5 text-right text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">Net Pay</th>
                        <th className="px-5 py-2.5 text-center text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {selectedPeriod.entries.map(entry => {
                        const isPaid = entry.is_paid || entry.payment_status === "paid";
                        const isPartial = entry.payment_status === "partial";
                        const hasBalance = !isPaid && (entry.net_pay - (entry.total_paid || 0)) > 0;
                        return (
                          <tr key={entry.id} className={cn("hover:bg-surface-200 transition-colors", isPaid && "opacity-60")}>
                            {canSelect && (
                              <td className="px-5 py-3">
                                {hasBalance && (
                                  <Checkbox
                                    checked={selectedEntries.has(entry.id)}
                                    onCheckedChange={() => handleToggleEntry(entry.id)}
                                    className="border-strong"
                                  />
                                )}
                              </td>
                            )}
                            <td className="px-5 py-3">
                              <p className="text-[13px] text-foreground-light">{entry.worker?.first_name} {entry.worker?.last_name}</p>
                              <p className="text-[10px] tabular-nums text-foreground-lighter mt-0.5">
                                {entry.regular_hours.toFixed(1)} reg + {entry.overtime_hours.toFixed(1)} OT
                              </p>
                            </td>
                            <td className="px-5 py-3 text-right text-[12px] tabular-nums text-foreground-lighter">{entry.regular_hours.toFixed(1)}h</td>
                            <td className="px-5 py-3 text-right text-[12px] tabular-nums">
                              {entry.overtime_hours > 0 ? <span className="text-brand">{entry.overtime_hours.toFixed(1)}h</span> : <span className="text-foreground-lighter">—</span>}
                            </td>
                            <td className="px-5 py-3 text-right text-[12px] tabular-nums text-foreground-lighter">{formatCurrency(entry.gross_pay)}</td>
                            <td className="px-5 py-3 text-right text-[12px] tabular-nums text-foreground-lighter">
                              {entry.deduction_details?.nib_employee ? formatCurrency(entry.deduction_details.nib_employee) : "—"}
                            </td>
                            <td className="px-5 py-3 text-right">
                              <span className="text-[13px] tabular-nums font-semibold text-foreground-light">{formatCurrency(entry.net_pay)}</span>
                              {isPartial && (
                                <p className="text-[10px] tabular-nums text-brand mt-0.5">
                                  bal {formatCurrency(entry.net_pay - (entry.total_paid || 0))}
                                </p>
                              )}
                            </td>
                            <td className="px-5 py-3 text-center">
                              {isPaid ? (
                                <span className="text-[11px] tabular-nums text-success">Paid</span>
                              ) : isPartial ? (
                                <div className="flex flex-col items-center gap-1">
                                  <span className="text-[11px] tabular-nums text-brand">Partial</span>
                                  {selectedPeriod.status === "processing" && (
                                    <button onClick={() => openPayDialog(entry)} disabled={payingEntryId !== null || payingBulk} className="text-[10px] text-success hover:opacity-80 disabled:opacity-40">
                                      +Pay
                                    </button>
                                  )}
                                </div>
                              ) : selectedPeriod.status === "processing" ? (
                                <button onClick={() => openPayDialog(entry)} disabled={payingEntryId !== null || payingBulk} className="text-[11px] text-success hover:opacity-80 disabled:opacity-40">
                                  Pay
                                </button>
                              ) : (
                                <span className="text-[11px] tabular-nums text-foreground-lighter">Pending</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Create Period Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-sm bg-surface-100 border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-foreground text-[15px]">Create Pay Period</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreatePeriod}>
            <div className="space-y-3 py-2">
              {[
                { label: "Start Date", key: "start_date" },
                { label: "End Date", key: "end_date" },
              ].map(f => (
                <div key={f.key} className="space-y-1">
                  <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">{f.label}</p>
                  <input type="date"
                    className="w-full h-8 px-2.5 rounded-md bg-surface-100 border border-strong text-[13px] text-foreground-light outline-none focus:border-strong transition-colors"
                    value={(periodForm as any)[f.key]}
                    onChange={e => setPeriodForm(p => ({ ...p, [f.key]: e.target.value }))}
                    required
                  />
                </div>
              ))}
            </div>
            <DialogFooter>
              <button type="button" onClick={() => setCreateDialogOpen(false)} className="px-4 py-2 text-[12px] text-foreground-lighter hover:text-foreground-light transition-colors">Cancel</button>
              <button type="submit" disabled={submitting} className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-surface-300 border border-strong text-[12px] text-brand hover:bg-surface-400 transition-colors disabled:opacity-40">
                {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Create
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Process Payroll Dialog */}
      <Dialog open={processDialogOpen} onOpenChange={setProcessDialogOpen}>
        <DialogContent className="max-w-sm bg-surface-100 border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground text-[15px]">Process Payroll</DialogTitle>
            <DialogDescription className="text-foreground-lighter text-[12px]">
              Calculates pay for all workers from their time entries. Cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-4">
            <button onClick={() => setProcessDialogOpen(false)} className="px-4 py-2 text-[12px] text-foreground-lighter hover:text-foreground-light transition-colors">Cancel</button>
            <button onClick={handleProcessPayroll} disabled={submitting} className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-surface-300 border border-strong text-[12px] text-brand hover:bg-surface-400 transition-colors disabled:opacity-40">
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Process
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pay Selected Dialog */}
      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent className="max-w-sm bg-surface-100 border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground text-[15px]">Confirm Bulk Payment</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-2">
            <div className="flex justify-between">
              <span className="text-[12px] text-foreground-lighter">Workers</span>
              <span className="text-[12px] text-foreground-light">{selectedEntries.size}</span>
            </div>
            <div className="flex justify-between border-t border-border pt-2">
              <span className="text-[12px] font-semibold text-foreground">Total</span>
              <span className="text-[15px] tabular-nums font-semibold text-success">{formatCurrency(selectedTotal)}</span>
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setPayDialogOpen(false)} className="px-4 py-2 text-[12px] text-foreground-lighter hover:text-foreground-light transition-colors">Cancel</button>
            <button onClick={handlePaySelected} disabled={payingBulk} className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-surface-300 border border-strong text-[12px] text-success hover:bg-surface-400 transition-colors disabled:opacity-40">
              {payingBulk && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Confirm Payment
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Single Pay Dialog */}
      <Dialog open={singlePayDialogOpen} onOpenChange={setSinglePayDialogOpen}>
        <DialogContent className="max-w-sm bg-surface-100 border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground text-[15px]">
              Pay {payingEntry?.worker?.first_name} {payingEntry?.worker?.last_name}
            </DialogTitle>
          </DialogHeader>
          {payingEntry && (
            <div className="space-y-3 py-2">
              <div className="rounded-lg border border-border bg-background px-3 py-2.5 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-[11px] tabular-nums text-foreground-lighter">Net Pay</span>
                  <span className="text-[12px] tabular-nums text-foreground-light">{formatCurrency(payingEntry.net_pay)}</span>
                </div>
                {(payingEntry.total_paid || 0) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-[11px] tabular-nums text-foreground-lighter">Paid so far</span>
                    <span className="text-[12px] tabular-nums text-success">{formatCurrency(payingEntry.total_paid || 0)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-border pt-1.5">
                  <span className="text-[11px] tabular-nums text-foreground-light font-semibold">Balance</span>
                  <span className="text-[13px] tabular-nums text-foreground font-semibold">{formatCurrency(payingEntry.net_pay - (payingEntry.total_paid || 0))}</span>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">Amount</p>
                <input type="number" step="0.01" min="0.01" max={payingEntry.net_pay - (payingEntry.total_paid || 0)}
                  className="w-full h-8 px-2.5 rounded-md bg-surface-100 border border-strong text-[13px] text-foreground-light outline-none focus:border-strong transition-colors"
                  value={payAmount}
                  onChange={e => setPayAmount(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">Method</p>
                <Select value={payMethod} onValueChange={setPayMethod}>
                  <SelectTrigger className="h-8 bg-surface-100 border-strong text-foreground-light text-[13px] focus:ring-0 focus:border-strong">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-surface-100 border-strong">
                    {["cash","check","bank_transfer","other"].map(m => (
                      <SelectItem key={m} value={m} className="text-foreground-light focus:bg-surface-100 focus:text-foreground capitalize">{m.replace("_", " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <button onClick={() => setSinglePayDialogOpen(false)} className="px-4 py-2 text-[12px] text-foreground-lighter hover:text-foreground-light transition-colors">Cancel</button>
            <button onClick={handlePaySingleEntry} disabled={payingEntryId !== null} className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-surface-300 border border-strong text-[12px] text-success hover:bg-surface-400 transition-colors disabled:opacity-40">
              {payingEntryId && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Record
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reopen Dialog */}
      <Dialog open={reopenDialogOpen} onOpenChange={setReopenDialogOpen}>
        <DialogContent className="max-w-sm bg-surface-100 border-border">
          <DialogHeader>
            <DialogTitle className="text-brand text-[15px]">Reopen Pay Period</DialogTitle>
            <DialogDescription className="text-foreground-lighter text-[12px]">
              Deletes all payroll entries so you can correct timesheets and re-process.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <p className="text-[11px] text-foreground-lighter bg-primary/5 border border-primary/20 rounded-lg px-3 py-2">
              Only use if no actual payments have been made yet.
            </p>
            <div className="space-y-1">
              <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">Reason *</p>
              <textarea rows={2} value={reopenReason} onChange={e => setReopenReason(e.target.value)} placeholder="e.g. Timesheet errors..."
                className="w-full px-2.5 py-2 rounded-md bg-surface-100 border border-strong text-[13px] text-foreground-light placeholder:text-foreground-lighter outline-none focus:border-strong resize-none" />
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setReopenDialogOpen(false)} className="px-4 py-2 text-[12px] text-foreground-lighter hover:text-foreground-light transition-colors">Cancel</button>
            <button onClick={handleReopenPeriod} disabled={submitting || !reopenReason.trim()} className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary/10 border border-primary/30 text-[12px] text-brand hover:bg-primary/20 transition-colors disabled:opacity-40">
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Reopen
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Void Dialog */}
      <Dialog open={voidDialogOpen} onOpenChange={setVoidDialogOpen}>
        <DialogContent className="max-w-sm bg-surface-100 border-border">
          <DialogHeader>
            <DialogTitle className="text-destructive text-[15px]">Void Pay Period</DialogTitle>
            <DialogDescription className="text-foreground-lighter text-[12px]">
              Marks this period as cancelled. Records are kept for audit purposes.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <p className="text-[11px] text-foreground-lighter bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2">
              This cannot be undone. Use adjustments in a new period to correct issues.
            </p>
            <div className="space-y-1">
              <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">Reason *</p>
              <textarea rows={2} value={voidReason} onChange={e => setVoidReason(e.target.value)} placeholder="e.g. Duplicate, major errors..."
                className="w-full px-2.5 py-2 rounded-md bg-surface-100 border border-strong text-[13px] text-foreground-light placeholder:text-foreground-lighter outline-none focus:border-strong resize-none" />
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setVoidDialogOpen(false)} className="px-4 py-2 text-[12px] text-foreground-lighter hover:text-foreground-light transition-colors">Cancel</button>
            <button onClick={handleVoidPeriod} disabled={submitting || !voidReason.trim()} className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-destructive/10 border border-destructive/30 text-[12px] text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-40">
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Void Period
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Adjustments List Dialog */}
      <Dialog open={adjustmentsListOpen} onOpenChange={setAdjustmentsListOpen}>
        <DialogContent className="max-w-2xl bg-surface-100 border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground text-[15px]">Payroll Adjustments</DialogTitle>
            <DialogDescription className="text-foreground-lighter text-[12px]">Applied in subsequent pay periods.</DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <button onClick={() => setAdjustmentDialogOpen(true)} className="text-[12px] text-brand hover:opacity-80">
              + Create Adjustment
            </button>
            {adjustments.length === 0 ? (
              <p className="text-[13px] text-foreground-lighter py-4 text-center">No adjustments yet</p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    {["Worker","Type","Hours","Amount","Reason"].map(h => (
                      <th key={h} className={cn("py-2.5 text-[10px] font-mono uppercase tracking-widest text-foreground-lighter", h === "Reason" ? "text-left px-2" : "text-right px-2")}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {adjustments.map(adj => (
                    <tr key={adj.id}>
                      <td className="px-2 py-2.5 text-right text-[12px] text-foreground-light">{adj.worker?.first_name} {adj.worker?.last_name}</td>
                      <td className="px-2 py-2.5 text-right text-[11px] tabular-nums text-foreground-lighter capitalize">{adj.adjustment_type}</td>
                      <td className={cn("px-2 py-2.5 text-right text-[12px] tabular-nums", adj.hours_adjustment > 0 ? "text-success" : adj.hours_adjustment < 0 ? "text-destructive" : "text-foreground-lighter")}>
                        {adj.hours_adjustment !== 0 ? `${adj.hours_adjustment > 0 ? "+" : ""}${adj.hours_adjustment}h` : "—"}
                      </td>
                      <td className={cn("px-2 py-2.5 text-right text-[12px] tabular-nums", adj.amount_adjustment > 0 ? "text-success" : adj.amount_adjustment < 0 ? "text-destructive" : "text-foreground-lighter")}>
                        {adj.amount_adjustment !== 0 ? `${adj.amount_adjustment > 0 ? "+" : ""}${formatCurrency(adj.amount_adjustment)}` : "—"}
                      </td>
                      <td className="px-2 py-2.5 text-left text-[12px] text-foreground-lighter max-w-xs truncate">{adj.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <DialogFooter>
            <button onClick={() => setAdjustmentsListOpen(false)} className="px-4 py-2 text-[12px] text-foreground-lighter hover:text-foreground-light transition-colors">Close</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Adjustment Dialog */}
      <Dialog open={adjustmentDialogOpen} onOpenChange={setAdjustmentDialogOpen}>
        <DialogContent className="max-w-sm bg-surface-100 border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground text-[15px]">Create Adjustment</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">Worker *</p>
              <Select value={adjustmentForm.worker_id} onValueChange={v => setAdjustmentForm(f => ({ ...f, worker_id: v }))}>
                <SelectTrigger className="h-8 bg-surface-100 border-strong text-foreground-light text-[13px] focus:ring-0 focus:border-strong">
                  <SelectValue placeholder="Select worker..." />
                </SelectTrigger>
                <SelectContent className="bg-surface-100 border-strong">
                  {workers.map(w => (
                    <SelectItem key={w.id} value={w.id} className="text-foreground-light focus:bg-surface-100 focus:text-foreground">{w.first_name} {w.last_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">Type *</p>
              <Select value={adjustmentForm.adjustment_type} onValueChange={v => setAdjustmentForm(f => ({ ...f, adjustment_type: v as PayrollAdjustmentType }))}>
                <SelectTrigger className="h-8 bg-surface-100 border-strong text-foreground-light text-[13px] focus:ring-0 focus:border-strong">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-surface-100 border-strong">
                  {["correction","bonus","deduction","reversal","hours_correction"].map(t => (
                    <SelectItem key={t} value={t} className="text-foreground-light focus:bg-surface-100 focus:text-foreground capitalize">{t.replace("_", " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">Hours Adj</p>
                <input type="number" step="0.5"
                  className="w-full h-8 px-2.5 rounded-md bg-surface-100 border border-strong text-[13px] text-foreground-light outline-none focus:border-strong transition-colors"
                  value={adjustmentForm.hours_adjustment}
                  onChange={e => setAdjustmentForm(f => ({ ...f, hours_adjustment: e.target.value }))}
                />
                <p className="text-[9px] tabular-nums text-foreground-lighter">Neg = reduction</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">Amount Adj</p>
                <input type="number" step="0.01"
                  className="w-full h-8 px-2.5 rounded-md bg-surface-100 border border-strong text-[13px] text-foreground-light outline-none focus:border-strong transition-colors"
                  value={adjustmentForm.amount_adjustment}
                  onChange={e => setAdjustmentForm(f => ({ ...f, amount_adjustment: e.target.value }))}
                />
                <p className="text-[9px] tabular-nums text-foreground-lighter">Neg = deduction</p>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">Reason *</p>
              <textarea rows={2} value={adjustmentForm.reason} onChange={e => setAdjustmentForm(f => ({ ...f, reason: e.target.value }))} placeholder="Explain the adjustment..."
                className="w-full px-2.5 py-2 rounded-md bg-surface-100 border border-strong text-[13px] text-foreground-light placeholder:text-foreground-lighter outline-none focus:border-strong resize-none" />
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setAdjustmentDialogOpen(false)} className="px-4 py-2 text-[12px] text-foreground-lighter hover:text-foreground-light transition-colors">Cancel</button>
            <button onClick={handleCreateAdjustment} disabled={submitting || !adjustmentForm.worker_id || !adjustmentForm.reason.trim()} className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-surface-300 border border-strong text-[12px] text-brand hover:bg-surface-400 transition-colors disabled:opacity-40">
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Create
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
