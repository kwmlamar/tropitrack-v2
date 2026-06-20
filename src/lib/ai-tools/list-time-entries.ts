import type { ToolDescriptor } from "./types";

interface Input {
  worker_id?: string;
  project_id?: string;
  since?: string;
  until?: string;
  limit?: number;
}

export const listTimeEntriesTool: ToolDescriptor<Input, unknown[]> = {
  name: "list_time_entries",
  description:
    "List time entries (worker hours logged against a project). Filter by worker, project, or date range. Returns the most recent 50 entries by default.",
  input_schema: {
    type: "object",
    properties: {
      worker_id: { type: "string" },
      project_id: { type: "string" },
      since: { type: "string", description: "ISO date (YYYY-MM-DD). Inclusive lower bound on entry.date." },
      until: { type: "string", description: "ISO date (YYYY-MM-DD). Inclusive upper bound on entry.date." },
      limit: { type: "number", description: "Defaults to 50, capped at 200." },
    },
  },
  tier: "none",
  scope: "read",
  skills: ["core", "payroll", "timesheet"],
  async handler(input, ctx) {
    let q = ctx.supabase
      .from("time_entries")
      .select("id, worker_id, project_id, date, start_time, end_time, regular_hours, overtime_hours, notes, workers!inner(first_name, last_name), projects!inner(name)")
      .order("date", { ascending: false })
      .limit(Math.min(input.limit ?? 50, 200));
    if (input.worker_id) q = q.eq("worker_id", input.worker_id);
    if (input.project_id) q = q.eq("project_id", input.project_id);
    if (input.since) q = q.gte("date", input.since);
    if (input.until) q = q.lte("date", input.until);
    const { data, error } = await q;
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: data ?? [] };
  },
};
