import type { ToolDescriptor } from "./types";

interface Input {
  payroll_entry_id: string;
  reason: string;
}

interface Output {
  voided_id: string;
  worker_name: string;
  period: string;
  reason: string;
}

async function load(supabase: import("@supabase/supabase-js").SupabaseClient, id: string) {
  const { data } = await supabase
    .from("payroll_entries")
    .select("id, gross_pay, total_paid, voided_at, workers!inner(first_name, last_name), pay_periods!inner(start_date, end_date, status)")
    .eq("id", id)
    .single();
  if (!data) return null;
  const w = Array.isArray(data.workers) ? data.workers[0] : data.workers;
  const p = Array.isArray(data.pay_periods) ? data.pay_periods[0] : data.pay_periods;
  return {
    id: data.id as string,
    gross: Number(data.gross_pay ?? 0),
    paid: Number(data.total_paid ?? 0),
    voided_at: data.voided_at,
    worker_name: `${w?.first_name ?? ""} ${w?.last_name ?? ""}`.trim(),
    period_start: p?.start_date as string,
    period_end: p?.end_date as string,
    period_status: p?.status as string,
  };
}

export const voidPayrollEntryTool: ToolDescriptor<Input, Output> = {
  name: "void_payroll_entry",
  description:
    "Mark a payroll entry as voided. The row stays for audit but is excluded from balances and outstanding calculations. Use when an entry was created in error AND money has been recorded against it (otherwise prefer delete_payroll_entry). Voiding does NOT refund payments — handle payment reversals manually.",
  input_schema: {
    type: "object",
    properties: {
      payroll_entry_id: { type: "string" },
      reason: { type: "string", description: "Free-text reason for voiding (required, shown in audit trail)." },
    },
    required: ["payroll_entry_id", "reason"],
  },
  tier: "double-confirm",
  scope: "write",
  skills: ["payroll"],

  async preview(input, ctx) {
    const e = await load(ctx.supabase, input.payroll_entry_id);
    if (!e) return { summary: `Payroll entry ${input.payroll_entry_id} not found.` };
    if (e.voided_at) return { summary: `⚠ already voided at ${e.voided_at}.` };
    if (e.period_status === "paid") return { summary: `⚠ BLOCKED: pay period closed; use adjustment workflow instead.` };
    const paidNote = e.paid > 0 ? ` $${e.paid.toFixed(2)} has already been recorded as paid against this entry — voiding does NOT refund it.` : "";
    return {
      summary: `VOID ${e.worker_name}'s entry for ${e.period_start}–${e.period_end} (gross $${e.gross.toFixed(2)}).${paidNote} Reason: ${input.reason}`,
      doubleConfirmAnswer: e.worker_name,
    };
  },

  async handler(input, ctx) {
    const e = await load(ctx.supabase, input.payroll_entry_id);
    if (!e) return { ok: false, error: "payroll entry not found" };
    if (e.voided_at) return { ok: false, error: "entry already voided" };
    if (e.period_status === "paid") return { ok: false, error: "pay period closed; use adjustment" };

    const { error } = await ctx.supabase
      .from("payroll_entries")
      .update({
        voided_at: new Date().toISOString(),
        voided_by: ctx.userId,
        void_reason: input.reason,
      })
      .eq("id", e.id);
    if (error) return { ok: false, error: error.message };

    return {
      ok: true,
      data: { voided_id: e.id, worker_name: e.worker_name, period: `${e.period_start}–${e.period_end}`, reason: input.reason },
      target: { table: "payroll_entries", rowId: e.id },
    };
  },
};
