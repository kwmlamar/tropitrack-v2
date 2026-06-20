import type { ToolDescriptor } from "./types";

interface Input {
  worker_id: string;
  pay_period_id: string;
  regular_hours: number;
  overtime_hours?: number;
  regular_rate?: number;
  overtime_rate?: number;
}

interface Output {
  payroll_entry_id: string;
  gross_pay: number;
  net_pay: number;
}

async function lookupWorkerAndPeriod(supabase: import("@supabase/supabase-js").SupabaseClient, workerId: string, periodId: string) {
  const [{ data: worker }, { data: period }] = await Promise.all([
    supabase.from("workers").select("id, first_name, last_name, hourly_rate, overtime_rate_multiplier, nib_enabled, company_id").eq("id", workerId).single(),
    supabase.from("pay_periods").select("id, start_date, end_date, status").eq("id", periodId).single(),
  ]);
  return { worker, period };
}

function computeNib(grossPay: number, nibEnabled: boolean): number {
  if (!nibEnabled) return 0;
  // 4.65% employee deduction, weekly insurable cap $550 → max deduction ~$25.58/wk.
  const insurable = Math.min(grossPay, 550);
  return +(insurable * 0.0465).toFixed(2);
}

export const createPayrollEntryTool: ToolDescriptor<Input, Output> = {
  name: "create_payroll_entry",
  description:
    "Create a new payroll entry for a worker in a specific pay period. Computes gross_pay = regular_hours * rate + overtime_hours * rate * 1.5 (or overtime_rate if supplied). Net pay = gross - NIB employee. Defaults: regular_rate from worker.hourly_rate, overtime_rate from rate * worker.overtime_rate_multiplier. Use only for open/processing periods.",
  input_schema: {
    type: "object",
    properties: {
      worker_id: { type: "string" },
      pay_period_id: { type: "string" },
      regular_hours: { type: "number" },
      overtime_hours: { type: "number" },
      regular_rate: { type: "number", description: "Override worker.hourly_rate." },
      overtime_rate: { type: "number", description: "Override worker.hourly_rate * overtime_multiplier." },
    },
    required: ["worker_id", "pay_period_id", "regular_hours"],
  },
  tier: "confirm",
  scope: "write",
  skills: ["payroll"],

  async preview(input, ctx) {
    const { worker, period } = await lookupWorkerAndPeriod(ctx.supabase, input.worker_id, input.pay_period_id);
    if (!worker) return { summary: `Worker ${input.worker_id} not found.` };
    if (!period) return { summary: `Pay period ${input.pay_period_id} not found.` };
    if (period.status === "paid") return { summary: `⚠ BLOCKED: pay period ${period.start_date}–${period.end_date} is closed.` };
    const rate = Number(input.regular_rate ?? worker.hourly_rate ?? 0);
    const otMult = Number(worker.overtime_rate_multiplier ?? 1.5);
    const otRate = Number(input.overtime_rate ?? rate * otMult);
    const otHours = Number(input.overtime_hours ?? 0);
    const gross = +(input.regular_hours * rate + otHours * otRate).toFixed(2);
    const nib = computeNib(gross, !!worker.nib_enabled);
    const net = +(gross - nib).toFixed(2);
    return {
      summary: `Create payroll entry: ${worker.first_name} ${worker.last_name}, ${period.start_date}–${period.end_date}, ${input.regular_hours}h reg + ${otHours}h OT @ $${rate}/hr → gross $${gross.toFixed(2)}, NIB $${nib.toFixed(2)}, net $${net.toFixed(2)}.`,
    };
  },

  async handler(input, ctx) {
    const { worker, period } = await lookupWorkerAndPeriod(ctx.supabase, input.worker_id, input.pay_period_id);
    if (!worker) return { ok: false, error: "worker not found" };
    if (!period) return { ok: false, error: "pay period not found" };
    if (period.status === "paid") return { ok: false, error: "pay period is closed" };

    const rate = Number(input.regular_rate ?? worker.hourly_rate ?? 0);
    if (!rate) return { ok: false, error: "no regular_rate provided and worker has no hourly_rate on file" };
    const otMult = Number(worker.overtime_rate_multiplier ?? 1.5);
    const otRate = Number(input.overtime_rate ?? rate * otMult);
    const otHours = Number(input.overtime_hours ?? 0);
    const gross = +(input.regular_hours * rate + otHours * otRate).toFixed(2);
    const nib = computeNib(gross, !!worker.nib_enabled);
    const net = +(gross - nib).toFixed(2);

    const { data, error } = await ctx.supabase
      .from("payroll_entries")
      .insert({
        worker_id: input.worker_id,
        pay_period_id: input.pay_period_id,
        company_id: worker.company_id,
        regular_hours: input.regular_hours,
        overtime_hours: otHours,
        regular_rate: rate,
        overtime_rate: otRate,
        gross_pay: gross,
        net_pay: net,
        deductions: nib,
        deduction_details: nib > 0 ? { nib_employee: nib } : {},
      })
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "insert failed" };

    return {
      ok: true,
      data: { payroll_entry_id: data.id, gross_pay: gross, net_pay: net },
      target: { table: "payroll_entries", rowId: data.id },
    };
  },
};
