import type { SupabaseClient } from "@supabase/supabase-js";
import type { ToolDescriptor, ToolContext } from "./types";
import { resolveByName } from "./match";

/**
 * Logging crew hours from a timesheet thread.
 *
 * The reference implementation is src/components/time-tracking/quick-time-entry.tsx
 * — these tools write exactly the rows that screen writes, with the same
 * defaults and the same overtime rule, so a day logged in chat is
 * indistinguishable from one logged on the screen.
 *
 * Two refusals are load-bearing and neither is overridable:
 *
 *   1. A date inside a processed or paid pay period. Payroll entries have
 *      already been generated from that period; a new time entry does not
 *      regenerate them, so payroll and time silently stop agreeing. The period
 *      has to be reopened first (pay_periods.reopened_at / reopen_reason exist
 *      for this). There is no force flag and there should not be one.
 *   2. A duplicate worker + project + date. The existing row is returned so the
 *      user can see what is already there. A genuine second entry for that day
 *      has to be asked for explicitly, and the preview then shows both.
 *
 * approved_by / approved_at stay null. AI-entered time is not pre-approved.
 */

/** 3,716 of 3,918 existing entries are exactly this. */
const DEFAULT_START = "07:00";
const DEFAULT_BREAK_MINUTES = 60;
const DEFAULT_HOURS = 8;
/** Hours beyond this in a day are overtime; regular hours cap here. */
const REGULAR_HOURS_CAP = 8;

/** 07:00 start + worked hours + 1h break. 8 hours → 16:00, same as the screen. */
function calculateEndTime(totalHours: number): string {
  const endHour = 7 + totalHours + 1;
  const hours = Math.floor(endHour);
  const minutes = Math.round((endHour - hours) * 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** Split a day's hours the way quick-time-entry.tsx does. */
function splitHours(hours: number): { regular: number; overtime: number } {
  const regular = Math.min(REGULAR_HOURS_CAP, hours);
  return { regular, overtime: Math.max(0, hours - REGULAR_HOURS_CAP) };
}

interface RowInput {
  worker_name?: string;
  worker_id?: string;
  hours?: number;
  notes?: string;
}

interface ResolvedRow {
  worker_id: string;
  worker_name: string;
  project_id: string;
  project_name: string;
  date: string;
  hours: number;
  regular_hours: number;
  overtime_hours: number;
  start_time: string;
  end_time: string;
  break_duration_minutes: number;
  notes: string | null;
}

interface BlockedPeriod {
  id: string;
  start_date: string;
  end_date: string;
  status: string;
}

interface ExistingEntry {
  id: string;
  worker_name: string;
  date: string;
  regular_hours: number;
  overtime_hours: number;
}

interface Resolution {
  rows: ResolvedRow[];
  /** Fatal — nothing is written while any of these is non-empty. */
  blockedByPeriod: { row: ResolvedRow; period: BlockedPeriod }[];
  duplicates: { row: ResolvedRow; existing: ExistingEntry }[];
  errors: string[];
}

function todayInNassau(): string {
  // The database anchors to America/Nassau; "today" here must mean the same day.
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Nassau" });
}

async function resolveRows(
  ctx: ToolContext,
  input: { project_name?: string; project_id?: string; date?: string; rows: RowInput[]; allow_duplicate?: boolean },
): Promise<Resolution> {
  const out: Resolution = { rows: [], blockedByPeriod: [], duplicates: [], errors: [] };
  const supabase: SupabaseClient = ctx.supabase;
  const date = input.date || todayInNassau();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    out.errors.push(`date "${date}" is not yyyy-mm-dd`);
    return out;
  }

  // ── Project ──
  const { data: projects, error: pErr } = await supabase
    .from("projects")
    .select("id, name, client_name, location")
    .eq("company_id", ctx.companyId);
  if (pErr) {
    out.errors.push(`projects query failed: ${pErr.message}`);
    return out;
  }
  if (!projects?.length) {
    out.errors.push("no jobs found for this company");
    return out;
  }

  let project = projects.find((p) => p.id === input.project_id);
  if (!project) {
    if (!input.project_name) {
      out.errors.push("give either project_id or project_name");
      return out;
    }
    const resolved = resolveByName(
      input.project_name,
      projects as { id: string; name: string; client_name: string | null; location: string | null }[],
      (p) => [p.name, p.client_name ?? "", p.location ?? ""].filter(Boolean),
      "job",
    );
    if (!resolved.ok) {
      out.errors.push(
        `${resolved.error} — candidates: ${resolved.candidates.map((c) => c.name).join(", ")}`,
      );
      return out;
    }
    project = resolved.match;
  }

  // ── Settled period check, once for the date ──
  // Any non-voided period covering this date whose status means payroll has
  // already been generated from it.
  const { data: periods, error: perErr } = await supabase
    .from("pay_periods")
    .select("id, start_date, end_date, status")
    .eq("company_id", ctx.companyId)
    .is("voided_at", null)
    .lte("start_date", date)
    .gte("end_date", date);
  if (perErr) {
    out.errors.push(`pay_periods query failed: ${perErr.message}`);
    return out;
  }
  const settled = (periods ?? []).find((p) =>
    ["processed", "processing", "paid"].includes(p.status),
  ) as BlockedPeriod | undefined;

  // ── Workers ──
  const { data: workers, error: wErr } = await supabase
    .from("workers")
    .select("id, first_name, last_name, status")
    .eq("company_id", ctx.companyId);
  if (wErr) {
    out.errors.push(`workers query failed: ${wErr.message}`);
    return out;
  }
  if (!workers?.length) {
    out.errors.push("no workers found for this company");
    return out;
  }

  for (const r of input.rows) {
    let worker = workers.find((w) => w.id === r.worker_id);
    if (!worker) {
      if (!r.worker_name) {
        out.errors.push("each row needs worker_id or worker_name");
        continue;
      }
      const resolved = resolveByName(
        r.worker_name,
        workers as { id: string; first_name: string; last_name: string; status: string }[],
        (w) => [`${w.first_name} ${w.last_name}`.trim(), w.first_name, w.last_name].filter(Boolean),
        "worker",
      );
      if (!resolved.ok) {
        out.errors.push(
          `${resolved.error} — candidates: ${resolved.candidates.map((c) => c.name).join(", ")}`,
        );
        continue;
      }
      worker = resolved.match;
    }

    const hours = r.hours ?? DEFAULT_HOURS;
    if (!(hours > 0) || hours > 24) {
      out.errors.push(`${worker.first_name} ${worker.last_name}: ${hours} hours is not a valid day`);
      continue;
    }
    const { regular, overtime } = splitHours(hours);

    const row: ResolvedRow = {
      worker_id: worker.id,
      worker_name: `${worker.first_name} ${worker.last_name}`.trim(),
      project_id: project.id,
      project_name: project.name,
      date,
      hours,
      regular_hours: regular,
      overtime_hours: overtime,
      start_time: DEFAULT_START,
      end_time: calculateEndTime(hours),
      break_duration_minutes: DEFAULT_BREAK_MINUTES,
      notes: r.notes ?? null,
    };

    if (settled) {
      out.blockedByPeriod.push({ row, period: settled });
      continue;
    }

    const { data: existing } = await supabase
      .from("time_entries")
      .select("id, regular_hours, overtime_hours")
      .eq("company_id", ctx.companyId)
      .eq("worker_id", row.worker_id)
      .eq("project_id", row.project_id)
      .eq("date", row.date)
      .limit(1);

    if (existing?.length && !input.allow_duplicate) {
      out.duplicates.push({
        row,
        existing: {
          id: existing[0].id,
          worker_name: row.worker_name,
          date: row.date,
          regular_hours: Number(existing[0].regular_hours ?? 0),
          overtime_hours: Number(existing[0].overtime_hours ?? 0),
        },
      });
      continue;
    }

    out.rows.push(row);
  }

  return out;
}

function refusalSummary(res: Resolution): string | null {
  const parts: string[] = [];

  for (const b of res.blockedByPeriod) {
    parts.push(
      `⚠ BLOCKED: ${b.row.date} falls inside pay period ${b.period.start_date}–${b.period.end_date}, which is "${b.period.status}". Payroll entries have already been generated from it, so a new time entry would leave payroll and time out of step. Reopen the period on the payroll screen first — this cannot be forced.`,
    );
  }

  for (const d of res.duplicates) {
    parts.push(
      `⚠ BLOCKED: ${d.existing.worker_name} already has an entry on ${d.existing.date} for this job — ${d.existing.regular_hours}h regular${
        d.existing.overtime_hours > 0 ? ` + ${d.existing.overtime_hours}h OT` : ""
      } (entry ${d.existing.id}). If a second entry for that day is genuinely wanted, ask again with allow_duplicate.`,
    );
  }

  if (res.errors.length) parts.push(...res.errors.map((e) => `⚠ ${e}`));

  return parts.length ? parts.join("\n\n") : null;
}

function rowLine(r: ResolvedRow): string {
  return `• ${r.worker_name} — ${r.project_name} — ${r.date} — ${r.regular_hours}h regular${
    r.overtime_hours > 0 ? ` + ${r.overtime_hours}h OT` : ""
  } (${r.start_time}–${r.end_time}, ${r.break_duration_minutes}min break)${
    r.notes ? ` — ${r.notes}` : ""
  }`;
}

async function insertRows(ctx: ToolContext, rows: ResolvedRow[]) {
  return ctx.supabase
    .from("time_entries")
    .insert(
      rows.map((r) => ({
        worker_id: r.worker_id,
        project_id: r.project_id,
        company_id: ctx.companyId,
        date: r.date,
        start_time: r.start_time,
        end_time: r.end_time,
        break_duration_minutes: r.break_duration_minutes,
        regular_hours: r.regular_hours,
        overtime_hours: r.overtime_hours,
        notes: r.notes,
        created_by: ctx.userId,
        // Deliberately absent: approved_by / approved_at.
      })),
    )
    .select("id");
}

// ── Single entry ─────────────────────────────────────────────────────────────

interface SingleInput {
  worker_name?: string;
  worker_id?: string;
  project_name?: string;
  project_id?: string;
  date?: string;
  hours?: number;
  notes?: string;
  allow_duplicate?: boolean;
}

const SINGLE_PROPERTIES = {
  worker_name: { type: "string", description: "Worker as the user named them. Fuzzy-matched." },
  worker_id: { type: "string", description: "Worker id, when you already have it." },
  project_name: { type: "string", description: "Job as the user named it. Fuzzy-matched." },
  project_id: { type: "string", description: "Job id, when you already have it." },
  date: { type: "string", description: "yyyy-mm-dd. Defaults to today (America/Nassau)." },
  hours: {
    type: "number",
    description:
      "Total hours worked that day. Defaults to 8 — the house standard day. Anything over 8 becomes overtime automatically and the end time extends.",
  },
  notes: { type: "string" },
  allow_duplicate: {
    type: "boolean",
    description:
      "Only set this after the user has SEEN the existing entry and explicitly asked for a second one. Never set it pre-emptively.",
  },
};

export const createTimeEntryTool: ToolDescriptor<SingleInput, unknown> = {
  name: "create_time_entry",
  description:
    "Log one worker's day on one job. Defaults to the house standard day: 07:00–16:00, 60 minute break, 8.00 regular hours. Hours over 8 become overtime and the end time extends. REFUSES a date inside a pay period that has been processed or paid (payroll was already generated from it — the period must be reopened first), and REFUSES a duplicate worker+job+date, returning the existing entry so the user can see it. Entries are not marked approved. For several workers at once use bulk_create_time_entries.",
  input_schema: { type: "object", properties: SINGLE_PROPERTIES },
  tier: "confirm",
  scope: "write",
  skills: ["timesheet"],

  async preview(input, ctx) {
    const res = await resolveRows(ctx, {
      project_id: input.project_id,
      project_name: input.project_name,
      date: input.date,
      allow_duplicate: input.allow_duplicate,
      rows: [{ worker_id: input.worker_id, worker_name: input.worker_name, hours: input.hours, notes: input.notes }],
    });
    const refusal = refusalSummary(res);
    if (refusal) return { summary: refusal };
    if (!res.rows.length) return { summary: "⚠ Nothing to log." };
    const r = res.rows[0];
    return { summary: `Log time:\n${rowLine(r)}\n\nEntry will not be marked approved.` };
  },

  async handler(input, ctx) {
    const res = await resolveRows(ctx, {
      project_id: input.project_id,
      project_name: input.project_name,
      date: input.date,
      allow_duplicate: input.allow_duplicate,
      rows: [{ worker_id: input.worker_id, worker_name: input.worker_name, hours: input.hours, notes: input.notes }],
    });
    const refusal = refusalSummary(res);
    if (refusal) return { ok: false, error: refusal };
    if (!res.rows.length) return { ok: false, error: "nothing to log" };

    const { data, error } = await insertRows(ctx, res.rows);
    if (error || !data?.length) return { ok: false, error: error?.message ?? "insert failed" };

    return {
      ok: true,
      data: { created: 1, entry_id: data[0].id, entry: res.rows[0] },
      target: { table: "time_entries", rowId: data[0].id },
    };
  },
};

// ── Bulk ─────────────────────────────────────────────────────────────────────

interface BulkInput {
  project_name?: string;
  project_id?: string;
  date?: string;
  workers: RowInput[];
  allow_duplicate?: boolean;
}

/** A crew is a crew, not a payroll run. Twenty is generous for one job-day. */
const BULK_CAP = 20;

export const bulkCreateTimeEntriesTool: ToolDescriptor<BulkInput, unknown> = {
  name: "bulk_create_time_entries",
  description:
    "Log a whole crew onto one job for one day. Same defaults and refusals as create_time_entry: 07:00–16:00, 60 minute break, 8.00 regular hours, overtime past 8; refuses a settled pay period, refuses duplicates. One preview lists every row, one confirmation covers the batch, and the insert is all-or-nothing — if any row is refused, nothing is written. Maximum 20 workers per call.",
  input_schema: {
    type: "object",
    properties: {
      project_name: SINGLE_PROPERTIES.project_name,
      project_id: SINGLE_PROPERTIES.project_id,
      date: SINGLE_PROPERTIES.date,
      allow_duplicate: SINGLE_PROPERTIES.allow_duplicate,
      workers: {
        type: "array",
        description: "One entry per worker. hours defaults to 8 for any worker who does not give one.",
        items: {
          type: "object",
          properties: {
            worker_name: SINGLE_PROPERTIES.worker_name,
            worker_id: SINGLE_PROPERTIES.worker_id,
            hours: SINGLE_PROPERTIES.hours,
            notes: SINGLE_PROPERTIES.notes,
          },
        },
      },
    },
    required: ["workers"],
  },
  tier: "confirm",
  scope: "write",
  skills: ["timesheet"],

  async preview(input, ctx) {
    if (!input.workers?.length) return { summary: "⚠ No workers given." };
    if (input.workers.length > BULK_CAP) {
      return { summary: `⚠ ${input.workers.length} workers exceeds the ${BULK_CAP}-per-call limit. Split it.` };
    }
    const res = await resolveRows(ctx, { ...input, rows: input.workers });
    const refusal = refusalSummary(res);
    // All-or-nothing: a single refusal blocks the batch rather than writing a
    // partial crew-day that then has to be reconciled by hand.
    if (refusal) return { summary: `${refusal}\n\nNothing will be written.` };
    if (!res.rows.length) return { summary: "⚠ Nothing to log." };

    const totalHours = res.rows.reduce((n, r) => n + r.hours, 0);
    return {
      summary: `Log ${res.rows.length} time ${
        res.rows.length === 1 ? "entry" : "entries"
      } on ${res.rows[0].project_name}, ${res.rows[0].date} (${totalHours} hours total):\n${res.rows
        .map(rowLine)
        .join("\n")}\n\nEntries will not be marked approved.`,
    };
  },

  async handler(input, ctx) {
    if (!input.workers?.length) return { ok: false, error: "no workers given" };
    if (input.workers.length > BULK_CAP) {
      return { ok: false, error: `${input.workers.length} workers exceeds the ${BULK_CAP}-per-call limit` };
    }
    const res = await resolveRows(ctx, { ...input, rows: input.workers });
    const refusal = refusalSummary(res);
    if (refusal) return { ok: false, error: refusal };
    if (!res.rows.length) return { ok: false, error: "nothing to log" };

    const { data, error } = await insertRows(ctx, res.rows);
    if (error || !data?.length) return { ok: false, error: error?.message ?? "insert failed" };

    return {
      ok: true,
      data: { created: data.length, entry_ids: data.map((d) => d.id), entries: res.rows },
      target: { table: "time_entries", rowId: data[0].id },
    };
  },
};
