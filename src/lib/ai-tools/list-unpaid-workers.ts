import type { CrewWorkerBalance } from "@/types";
import type { ToolDescriptor } from "./types";
import { fetchCrewBalances } from "./crew-balances";

interface WorkerOwed {
  worker_id: string;
  name: string;
  /** gross_pay - total_paid, the basis this tool has always reported. */
  outstanding: number;
  /** net_pay - total_paid, the basis the payroll screen pays against. */
  outstanding_net: number;
  entry_count: number;
  oldest_period_start: string | null;
  /** Time in a gap no pay period covers — never reached payroll at all. */
  uncovered_time_value: number;
  total_owed_gross: number;
  total_owed_net: number;
}

interface Output {
  as_of: string;
  workers: WorkerOwed[];
  total_owed_gross: number;
  total_owed_net: number;
  uncovered_time_value: number;
  basis_note: string;
  notes: string[];
}

/**
 * Kept for continuity — this is the tool name the model has always reached for
 * on "who do I owe?" — but it no longer does its own arithmetic.
 *
 * It used to run its own query and sum in TypeScript, with two bugs baked in:
 * it reported the gross basis only, and it filtered out entries whose pay period
 * had been marked 'paid', silently dropping a part-paid worker the moment the
 * period was closed. Both are fixed by delegating to crew_balances(), which is
 * the same function the dashboard tile and the payroll panel read.
 *
 * Prefer `crew_balances` for anything richer than a list.
 */
export const listUnpaidWorkersTool: ToolDescriptor<Record<string, never>, Output> = {
  name: "list_unpaid_workers",
  description:
    "List every worker with an outstanding balance, highest first. A thin view over the same crew_balances database function the dashboard and payroll screen use, so the numbers always agree. Returns both the gross and net bases and flags time that never reached payroll. For the full picture — company totals, workers who have left still owed money, the basis note — call crew_balances instead.",
  input_schema: { type: "object", properties: {} },
  tier: "none",
  scope: "read",
  skills: ["core", "payroll"],

  async handler(_input, ctx) {
    const result = await fetchCrewBalances(ctx.supabase, ctx.companyId);
    if (!result.ok) return { ok: false, error: result.error };

    const payload = result.data;
    // Projection only. Every number below is copied out of the payload; nothing
    // here is recomputed.
    const project = (w: CrewWorkerBalance): WorkerOwed => ({
      worker_id: w.worker_id,
      name: w.name,
      outstanding: w.outstanding.balance_gross,
      outstanding_net: w.outstanding.balance_net,
      entry_count: w.outstanding.entries,
      oldest_period_start: w.outstanding.oldest_period_start,
      uncovered_time_value: w.uncovered_time.value,
      total_owed_gross: w.total_owed_gross,
      total_owed_net: w.total_owed_net,
    });

    return {
      ok: true,
      data: {
        as_of: payload.as_of,
        // Workers who have left are appended rather than dropped — someone who
        // is owed money must not disappear because they stopped working here.
        workers: [...payload.workers, ...payload.terminated_with_balance].map(project),
        total_owed_gross: payload.totals.grand_total_gross,
        total_owed_net: payload.totals.grand_total_net,
        uncovered_time_value: payload.totals.uncovered_time_value,
        basis_note: payload.basis_note,
        notes: payload.notes,
      },
    };
  },
};
