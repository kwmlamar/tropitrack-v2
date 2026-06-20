import type { ToolDescriptor } from "./types";

interface Input {
  search?: string;
  status?: "active" | "inactive" | "terminated";
}

interface WorkerRow {
  id: string;
  name: string;
  hourly_rate: number | null;
  status: string;
}

export const listWorkersTool: ToolDescriptor<Input, WorkerRow[]> = {
  name: "list_workers",
  description:
    "List workers in the company. Optionally filter by partial name (matches first or last name, case-insensitive) and/or status. Returns id, name, hourly_rate, status. Use this to find a worker before calling tools that need an id.",
  input_schema: {
    type: "object",
    properties: {
      search: { type: "string", description: "Partial name match (first or last). Omit for all workers." },
      status: { type: "string", enum: ["active", "inactive", "terminated"], description: "Filter by status. Defaults to active." },
    },
  },
  tier: "none",
  scope: "read",
  skills: ["core"],
  async handler(input, ctx) {
    let q = ctx.supabase
      .from("workers")
      .select("id, first_name, last_name, hourly_rate, status")
      .eq("status", input.status ?? "active")
      .order("first_name");
    if (input.search) {
      const s = `%${input.search.trim()}%`;
      q = q.or(`first_name.ilike.${s},last_name.ilike.${s}`);
    }
    const { data, error } = await q;
    if (error) return { ok: false, error: error.message };
    return {
      ok: true,
      data: (data ?? []).map((w) => ({
        id: w.id,
        name: `${w.first_name} ${w.last_name}`.trim(),
        hourly_rate: w.hourly_rate,
        status: w.status,
      })),
    };
  },
};
