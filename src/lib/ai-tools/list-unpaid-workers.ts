import type { ToolDescriptor } from "./types";

interface WorkerOwed {
  worker_id: string;
  name: string;
  outstanding: number;
  entry_count: number;
}

export const listUnpaidWorkersTool: ToolDescriptor<Record<string, never>, WorkerOwed[]> = {
  name: "list_unpaid_workers",
  description:
    "List every worker in the company with an outstanding payroll balance — non-voided entries in open pay periods where total_paid < gross_pay. Sorted highest owed first. Use this when the user asks 'who do I owe?' or wants a payday snapshot.",
  input_schema: { type: "object", properties: {} },
  tier: "none",
  scope: "read",
  skills: ["core", "payroll"],
  async handler(_input, ctx) {
    const { data, error } = await ctx.supabase
      .from("payroll_entries")
      .select("worker_id, gross_pay, total_paid, voided_at, pay_periods!inner(status), workers!inner(first_name, last_name)")
      .in("payment_status", ["unpaid", "partial"])
      .is("voided_at", null)
      .neq("pay_periods.status", "paid");
    if (error) return { ok: false, error: error.message };

    const byWorker = new Map<string, WorkerOwed>();
    for (const row of data ?? []) {
      const worker = Array.isArray(row.workers) ? row.workers[0] : row.workers;
      const balance = Number(row.gross_pay ?? 0) - Number(row.total_paid ?? 0);
      if (balance <= 0) continue;
      const existing = byWorker.get(row.worker_id);
      const name = `${worker?.first_name ?? ""} ${worker?.last_name ?? ""}`.trim();
      if (existing) {
        existing.outstanding = +(existing.outstanding + balance).toFixed(2);
        existing.entry_count += 1;
      } else {
        byWorker.set(row.worker_id, {
          worker_id: row.worker_id,
          name,
          outstanding: +balance.toFixed(2),
          entry_count: 1,
        });
      }
    }
    const result = [...byWorker.values()].sort((a, b) => b.outstanding - a.outstanding);
    return { ok: true, data: result };
  },
};
