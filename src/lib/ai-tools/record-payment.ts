import type { ToolDescriptor } from "./types";

interface Input {
  payroll_entry_id: string;
  amount: number;
  payment_method?: "cash" | "check" | "bank_transfer" | "other";
  reference_number?: string;
  notes?: string;
}

interface Output {
  payment_transaction_id: string;
  payroll_entry_id: string;
  amount_recorded: number;
  new_total_paid: number;
  new_payment_status: string;
}

async function loadEntry(supabase: import("@supabase/supabase-js").SupabaseClient, id: string) {
  const { data } = await supabase
    .from("payroll_entries")
    .select("id, gross_pay, total_paid, payment_status, voided_at, workers!inner(first_name, last_name), pay_periods!inner(start_date, end_date, status)")
    .eq("id", id)
    .single();
  if (!data) return null;
  const w = Array.isArray(data.workers) ? data.workers[0] : data.workers;
  const p = Array.isArray(data.pay_periods) ? data.pay_periods[0] : data.pay_periods;
  return {
    id: data.id as string,
    gross: Number(data.gross_pay ?? 0),
    paid: Number(data.total_paid ?? 0),
    balance: Number(data.gross_pay ?? 0) - Number(data.total_paid ?? 0),
    voided_at: data.voided_at,
    worker_name: `${w?.first_name ?? ""} ${w?.last_name ?? ""}`.trim(),
    period_start: p?.start_date as string,
    period_end: p?.end_date as string,
    period_status: p?.status as string,
  };
}

export const recordPaymentTool: ToolDescriptor<Input, Output> = {
  name: "record_payment",
  description:
    "Record a payment against a payroll entry. Inserts a row in payment_transactions; the database trigger then updates total_paid and payment_status on the parent entry automatically. NEVER call this if the entry is voided or the pay period is closed (`paid`). Amount can be partial; full balance is the most common.",
  input_schema: {
    type: "object",
    properties: {
      payroll_entry_id: { type: "string" },
      amount: { type: "number", description: "Payment amount in BSD$. Must be > 0 and ≤ outstanding balance." },
      payment_method: { type: "string", enum: ["cash", "check", "bank_transfer", "other"], description: "Defaults to cash." },
      reference_number: { type: "string" },
      notes: { type: "string" },
    },
    required: ["payroll_entry_id", "amount"],
  },
  tier: "confirm",
  scope: "write",
  skills: ["payroll"],

  async preview(input, ctx) {
    const e = await loadEntry(ctx.supabase, input.payroll_entry_id);
    if (!e) return { summary: `Payroll entry ${input.payroll_entry_id} not found.` };
    if (e.voided_at) return { summary: `⚠ BLOCKED: entry is voided.` };
    if (e.period_status === "paid") return { summary: `⚠ BLOCKED: pay period closed; use adjustment instead.` };
    if (input.amount <= 0) return { summary: `⚠ Amount must be positive (got ${input.amount}).` };
    if (input.amount > e.balance + 0.005) return { summary: `⚠ Amount $${input.amount.toFixed(2)} exceeds outstanding balance $${e.balance.toFixed(2)}.` };
    const method = input.payment_method ?? "cash";
    return {
      summary: `Record $${input.amount.toFixed(2)} ${method} payment to ${e.worker_name} for period ${e.period_start}–${e.period_end} (balance after: $${(e.balance - input.amount).toFixed(2)}).`,
    };
  },

  async handler(input, ctx) {
    const e = await loadEntry(ctx.supabase, input.payroll_entry_id);
    if (!e) return { ok: false, error: "payroll entry not found" };
    if (e.voided_at) return { ok: false, error: "entry is voided" };
    if (e.period_status === "paid") return { ok: false, error: "pay period is closed; use adjustment" };
    if (input.amount <= 0) return { ok: false, error: "amount must be positive" };
    if (input.amount > e.balance + 0.005) {
      return { ok: false, error: `amount $${input.amount.toFixed(2)} exceeds balance $${e.balance.toFixed(2)}` };
    }

    const { data, error } = await ctx.supabase
      .from("payment_transactions")
      .insert({
        payroll_entry_id: e.id,
        amount: input.amount,
        payment_method: input.payment_method ?? "cash",
        reference_number: input.reference_number ?? null,
        notes: input.notes ?? null,
        created_by: ctx.userId,
      })
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "insert failed" };

    // Re-read entry to capture trigger-updated values.
    const after = await loadEntry(ctx.supabase, e.id);
    const { data: refresh } = await ctx.supabase
      .from("payroll_entries")
      .select("payment_status, total_paid")
      .eq("id", e.id)
      .single();
    return {
      ok: true,
      data: {
        payment_transaction_id: data.id,
        payroll_entry_id: e.id,
        amount_recorded: input.amount,
        new_total_paid: Number(refresh?.total_paid ?? after?.paid ?? 0),
        new_payment_status: (refresh?.payment_status as string) ?? "unknown",
      },
      target: { table: "payment_transactions", rowId: data.id },
    };
  },
};
