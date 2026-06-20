import type { ToolDescriptor } from "./types";

interface Input {
  search?: string;
  status?: "planning" | "active" | "on_hold" | "completed" | "cancelled";
  limit?: number;
}

export const listProjectsTool: ToolDescriptor<Input, unknown[]> = {
  name: "list_projects",
  description: "List projects/jobs. Default returns active projects. Filter by partial name or status.",
  input_schema: {
    type: "object",
    properties: {
      search: { type: "string" },
      status: { type: "string", enum: ["planning", "active", "on_hold", "completed", "cancelled"] },
      limit: { type: "number" },
    },
  },
  tier: "none",
  scope: "read",
  skills: ["core"],
  async handler(input, ctx) {
    let q = ctx.supabase
      .from("projects")
      .select("id, name, client_name, location, status, start_date, estimated_end_date, budget, contract_value")
      .order("start_date", { ascending: false })
      .limit(Math.min(input.limit ?? 50, 200));
    if (input.status) q = q.eq("status", input.status);
    else q = q.in("status", ["planning", "active", "on_hold"]);
    if (input.search) q = q.ilike("name", `%${input.search.trim()}%`);
    const { data, error } = await q;
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: data ?? [] };
  },
};
