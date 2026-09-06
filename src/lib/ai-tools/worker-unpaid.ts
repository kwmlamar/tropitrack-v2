import type { SupabaseClient } from "@supabase/supabase-js";
import type { CrewWorkerBalance } from "@/types";
import type { ToolDescriptor } from "./types";
import { fetchCrewBalances } from "./crew-balances";
import { resolveByName } from "./match";

export type WorkerUnpaidResult =
  | {
      ok: true;
      as_of: string;
      worker: {
        id: string;
        name: string;
        hourly_rate: number | null;
        status: string;
        nib_enabled: boolean;
      };
      outstanding_payroll: {
        entries: number;
        gross: number;
        paid: number;
        /** gross_pay - total_paid. */
        balance: number;
        /** net_pay - total_paid, after NIB — what /payroll pays against. */
        balance_net: number;
        oldest_period_start: string | null;
      };
      uncovered_time: {
        since: string | null;
        regular_hours: number;
        overtime_hours: number;
        value: number;
      };
      total_owed_gross: number;
      total_owed_net: number;
      currency: "BSD";
      basis_note: string;
      notes: string[];
    }
  | { ok: false; error: string; candidates?: { id: string; name: string }[] };

/**
 * What one worker is owed.
 *
 * Every figure comes from crew_balances(), the same database function behind the
 * dashboard tile and the payroll panel. This file used to run its own queries
 * and do its own arithmetic, including a hand-rolled NIB estimate and a
 * "unbilled time = anything after the last period end" rule that missed hours
 * sitting in a gap BETWEEN periods — which is the exact shape of the hole that
 * hid $53,026.48 of labour. Both are gone.
 */
export async function getWorkerUnpaid(
  supabase: SupabaseClient,
  companyId: string,
  query: string,
): Promise<WorkerUnpaidResult> {
  const balances = await fetchCrewBalances(supabase, companyId);
  if (!balances.ok) return { ok: false, error: balances.error };
  const payload = balances.data;

  // Resolve the name against the whole roster, not just those with a balance,
  // so "what does Felix owe" on a fully-paid worker answers "nothing" instead of
  // "no worker matched".
  const { data: workers, error: wErr } = await supabase
    .from("workers")
    .select("id, first_name, last_name, hourly_rate, status, nib_enabled")
    .eq("company_id", companyId);
  if (wErr) return { ok: false, error: `workers query failed: ${wErr.message}` };
  if (!workers?.length) return { ok: false, error: "no workers found for this company" };

  const resolved = resolveByName(
    query,
    workers as {
      id: string;
      first_name: string;
      last_name: string;
      hourly_rate: number | null;
      status: string;
      nib_enabled: boolean | null;
    }[],
    (w) => [`${w.first_name} ${w.last_name}`.trim(), w.first_name, w.last_name].filter(Boolean),
    "worker",
  );
  if (!resolved.ok) {
    return { ok: false, error: resolved.error, candidates: resolved.candidates };
  }

  const w = resolved.match;
  const name = `${w.first_name} ${w.last_name}`.trim();

  const row: CrewWorkerBalance | undefined = [
    ...payload.workers,
    ...payload.terminated_with_balance,
  ].find((r) => r.worker_id === w.id);

  // No row means nothing outstanding. That is an answer, not a failure.
  const outstanding = row?.outstanding ?? {
    entries: 0,
    gross_pay: 0,
    total_paid: 0,
    balance_gross: 0,
    balance_net: 0,
    oldest_period_start: null,
    in_closed_periods: 0,
  };
  const uncovered = row?.uncovered_time ?? {
    since: null,
    regular_hours: 0,
    overtime_hours: 0,
    entries: 0,
    value: 0,
  };

  return {
    ok: true,
    as_of: payload.as_of,
    worker: {
      id: w.id,
      name,
      hourly_rate: w.hourly_rate,
      status: w.status,
      nib_enabled: Boolean(w.nib_enabled),
    },
    outstanding_payroll: {
      entries: outstanding.entries,
      gross: outstanding.gross_pay,
      paid: outstanding.total_paid,
      balance: outstanding.balance_gross,
      balance_net: outstanding.balance_net,
      oldest_period_start: outstanding.oldest_period_start,
    },
    uncovered_time: {
      since: uncovered.since,
      regular_hours: uncovered.regular_hours,
      overtime_hours: uncovered.overtime_hours,
      value: uncovered.value,
    },
    total_owed_gross: row?.total_owed_gross ?? 0,
    total_owed_net: row?.total_owed_net ?? 0,
    currency: "BSD",
    basis_note: payload.basis_note,
    notes: payload.notes,
  };
}

interface GetWorkerUnpaidInput {
  worker_name: string;
}

export const getWorkerUnpaidTool: ToolDescriptor<GetWorkerUnpaidInput, WorkerUnpaidResult> = {
  name: "get_worker_unpaid",
  description:
    "How much one worker is owed right now: outstanding payroll balance on both the gross and net bases, plus any hours logged into a gap no pay period covers. A per-worker view of the same crew_balances database function the dashboard and payroll screen use, so the numbers always agree. Use fuzzy name matching — first name, last name, full name, or a misspelling are all fine; if it is genuinely ambiguous you get the candidates back and should ask which one.",
  input_schema: {
    type: "object",
    properties: {
      worker_name: {
        type: "string",
        description: "The worker's name as the user wrote it. Spelling errors are fine — match fuzzily.",
      },
    },
    required: ["worker_name"],
  },
  tier: "none",
  scope: "read",
  skills: ["payroll", "core"],
  async handler(input, ctx) {
    const result = await getWorkerUnpaid(ctx.supabase, ctx.companyId, input.worker_name);
    if (result.ok) {
      return { ok: true, data: result, target: { table: "workers", rowId: result.worker.id } };
    }
    return { ok: false, error: result.error, data: result };
  },
};
