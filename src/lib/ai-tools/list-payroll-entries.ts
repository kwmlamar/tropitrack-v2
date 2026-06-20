import type { ToolDescriptor } from "./types";

interface Input {
  worker_id?: string;
  pay_period_id?: string;
  include_voided?: boolean;
  status?: "unpaid" | "partial" | "paid";
  limit?: number;
}

export const listPayrollEntriesTool: ToolDescriptor<Input, unknown[]> = {
  name: "list_payroll_entries",
  description:
    "List payroll entries with optional filters. Default behavior: returns the most recent 50 active (non-voided) entries. Filter by worker_id, pay_period_id, or payment_status. Each row includes the entry id (needed for delete_payroll_entry, record_payment, void_payroll_entry).",
  input_schema: {
    type: "object",
    properties: {
      worker_id: { type: "string" },
      pay_period_id: { type: "string" },
      include_voided: { type: "boolean", description: "Include voided entries. Defaults to false." },
      status: { type: "string", enum: ["unpaid", "partial", "paid"] },
      limit: { type: "number", description: "Max rows. Defaults to 50, capped at 200." },
    },
  },
  tier: "none",
  scope: "read",
  skills: ["core", "payroll"],
  async handler(input, ctx) {
    let q = ctx.supabase
      .from("payroll_entries")
      .select("id, worker_id, pay_period_id, regular_hours, overtime_hours, regular_rate, gross_pay, total_paid, payment_status, voided_at, void_reason, created_at, pay_periods!inner(start_date, end_date, status), workers!inner(first_name, last_name)")
      .order("created_at", { ascending: false })
      .limit(Math.min(input.limit ?? 50, 200));
    if (input.worker_id) q = q.eq("worker_id", input.worker_id);
    if (input.pay_period_id) q = q.eq("pay_period_id", input.pay_period_id);
    if (input.status) q = q.eq("payment_status", input.status);
    if (!input.include_voided) q = q.is("voided_at", null);
    const { data, error } = await q;
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: data ?? [] };
  },
};
