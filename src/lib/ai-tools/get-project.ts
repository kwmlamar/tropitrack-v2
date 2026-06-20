import type { ToolDescriptor } from "./types";

interface Input {
  project_id: string;
}

export const getProjectTool: ToolDescriptor<Input, unknown> = {
  name: "get_project",
  description: "Fetch a project's full details by id.",
  input_schema: {
    type: "object",
    properties: { project_id: { type: "string" } },
    required: ["project_id"],
  },
  tier: "none",
  scope: "read",
  skills: ["core"],
  async handler(input, ctx) {
    const { data, error } = await ctx.supabase
      .from("projects")
      .select("*")
      .eq("id", input.project_id)
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "project not found" };
    return { ok: true, data };
  },
};
