import type { SupabaseClient } from "@supabase/supabase-js";
import type { ToolDescriptor } from "./types";

export type WorkerUnpaidResult =
  | {
      ok: true;
      worker: { id: string; name: string; hourly_rate: number | null };
      outstanding_payroll: {
        entries: number;
        gross: number;
        paid: number;
        balance: number;
      };
      unbilled_time: {
        since: string | null;
        regular_hours: number;
        overtime_hours: number;
        gross: number;
      };
      total_owed: number;
      nib_employee_estimate: number;
      net_cash_estimate: number;
      currency: "BSD";
      notes: string[];
    }
  | { ok: false; error: string; candidates?: { id: string; name: string }[] };

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + cost);
    }
  }
  return m[a.length][b.length];
}

function scoreMatch(query: string, candidate: string): number {
  const q = query.toLowerCase().trim();
  const c = candidate.toLowerCase().trim();
  if (!q || !c) return 0;
  if (c === q) return 1;
  if (c.startsWith(q) || q.startsWith(c)) return 0.9;
  if (c.includes(q) || q.includes(c)) return 0.8;
  const dist = levenshtein(q, c);
  const maxLen = Math.max(q.length, c.length);
  return Math.max(0, 1 - dist / maxLen);
}

export async function getWorkerUnpaid(
  supabase: SupabaseClient,
  companyId: string,
  query: string,
): Promise<WorkerUnpaidResult> {
  const { data: workers, error: wErr } = await supabase
    .from("workers")
    .select("id, first_name, last_name, hourly_rate, overtime_rate_multiplier, status, nib_enabled")
    .eq("company_id", companyId)
    .neq("status", "terminated");

  if (wErr) return { ok: false, error: `workers query failed: ${wErr.message}` };
  if (!workers?.length) return { ok: false, error: "no workers found for this company" };

  const scored = workers
    .map((w) => {
      const full = `${w.first_name} ${w.last_name}`.trim();
      const score = Math.max(
        scoreMatch(query, full),
        scoreMatch(query, w.first_name ?? ""),
        scoreMatch(query, w.last_name ?? ""),
      );
      return { ...w, full, score };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score < 0.55) {
    return {
      ok: false,
      error: `no worker matched "${query}"`,
      candidates: scored.slice(0, 5).map((s) => ({ id: s.id, name: s.full })),
    };
  }

  if (scored[1] && scored[1].score >= best.score - 0.05 && best.score < 0.9) {
    return {
      ok: false,
      error: `ambiguous: "${query}" could match multiple workers`,
      candidates: scored.slice(0, 5).map((s) => ({ id: s.id, name: s.full })),
    };
  }

  const workerId = best.id;
  const rate = Number(best.hourly_rate ?? 0);
  const otMult = Number(best.overtime_rate_multiplier ?? 1.5);

  // Outstanding = entries in OPEN periods that aren't fully paid.
  // Closed pay periods (status='paid') are the source of truth that no money is owed,
  // regardless of per-entry payment_status (which can drift from data imports).
  const { data: payrollRows, error: pErr } = await supabase
    .from("payroll_entries")
    .select("id, gross_pay, total_paid, payment_status, pay_period_id, pay_periods!inner(end_date, status)")
    .eq("worker_id", workerId)
    .in("payment_status", ["unpaid", "partial"])
    .neq("pay_periods.status", "paid");

  if (pErr) return { ok: false, error: `payroll query failed: ${pErr.message}` };

  let outstandingGross = 0;
  let outstandingPaid = 0;
  let latestPeriodEnd: string | null = null;
  for (const row of payrollRows ?? []) {
    outstandingGross += Number(row.gross_pay ?? 0);
    outstandingPaid += Number(row.total_paid ?? 0);
    const periods = row.pay_periods as unknown as { end_date: string } | { end_date: string }[];
    const end = Array.isArray(periods) ? periods[0]?.end_date : periods?.end_date;
    if (end && (!latestPeriodEnd || end > latestPeriodEnd)) latestPeriodEnd = end;
  }
  const outstandingBalance = Math.max(0, outstandingGross - outstandingPaid);

  if (latestPeriodEnd === null) {
    const { data: lastPeriod } = await supabase
      .from("payroll_entries")
      .select("pay_periods!inner(end_date)")
      .eq("worker_id", workerId)
      .order("pay_periods(end_date)", { ascending: false })
      .limit(1);
    const periods = lastPeriod?.[0]?.pay_periods as unknown as { end_date: string } | { end_date: string }[];
    latestPeriodEnd = Array.isArray(periods) ? periods[0]?.end_date ?? null : periods?.end_date ?? null;
  }

  let timeQuery = supabase
    .from("time_entries")
    .select("regular_hours, overtime_hours, date")
    .eq("worker_id", workerId);
  if (latestPeriodEnd) timeQuery = timeQuery.gt("date", latestPeriodEnd);

  const { data: timeRows, error: tErr } = await timeQuery;
  if (tErr) return { ok: false, error: `time entries query failed: ${tErr.message}` };

  let regHours = 0;
  let otHours = 0;
  for (const t of timeRows ?? []) {
    regHours += Number(t.regular_hours ?? 0);
    otHours += Number(t.overtime_hours ?? 0);
  }
  const unbilledGross = regHours * rate + otHours * rate * otMult;

  const totalOwed = outstandingBalance + unbilledGross;

  const notes: string[] = [];
  if (!rate && unbilledGross === 0 && regHours + otHours > 0) {
    notes.push("worker has no hourly_rate on file — unbilled gross set to 0");
  }
  if (latestPeriodEnd === null) {
    notes.push("no prior payroll on file — unbilled time covers all logged hours");
  }

  const insurableWeeklyCap = 550;
  const weeks = Math.max(1, Math.ceil(((regHours + otHours) || 1) / 40));
  const insurableGross = Math.min(unbilledGross + outstandingBalance, insurableWeeklyCap * weeks);
  const nibEmployee = best.nib_enabled ? +(insurableGross * 0.0465).toFixed(2) : 0;
  const netCash = +(totalOwed - nibEmployee).toFixed(2);

  return {
    ok: true,
    worker: { id: best.id, name: best.full, hourly_rate: best.hourly_rate },
    outstanding_payroll: {
      entries: payrollRows?.length ?? 0,
      gross: +outstandingGross.toFixed(2),
      paid: +outstandingPaid.toFixed(2),
      balance: +outstandingBalance.toFixed(2),
    },
    unbilled_time: {
      since: latestPeriodEnd,
      regular_hours: +regHours.toFixed(2),
      overtime_hours: +otHours.toFixed(2),
      gross: +unbilledGross.toFixed(2),
    },
    total_owed: +totalOwed.toFixed(2),
    nib_employee_estimate: nibEmployee,
    net_cash_estimate: netCash,
    currency: "BSD",
    notes,
  };
}

interface GetWorkerUnpaidInput {
  worker_name: string;
}

export const getWorkerUnpaidTool: ToolDescriptor<GetWorkerUnpaidInput, WorkerUnpaidResult> = {
  name: "get_worker_unpaid",
  description:
    "Calculate how much money is owed to a worker right now. Combines (a) outstanding balance on existing payroll entries (unpaid + partial) and (b) gross pay for time entries logged since the last pay period, valued at the worker's current hourly rate. Includes NIB estimate and net cash. Use fuzzy name matching — accept first name, last name, full name, or partial/misspelled forms.",
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

// Legacy export kept for any external callers; new code should use getWorkerUnpaidTool.
export const getWorkerUnpaidToolDef = {
  name: getWorkerUnpaidTool.name,
  description: getWorkerUnpaidTool.description,
  input_schema: getWorkerUnpaidTool.input_schema,
};
