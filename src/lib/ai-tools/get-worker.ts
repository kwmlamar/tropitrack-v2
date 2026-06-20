import type { ToolDescriptor } from "./types";

interface Input {
  worker_id: string;
}

export const getWorkerTool: ToolDescriptor<Input, unknown> = {
  name: "get_worker",
  description:
    "Fetch a single worker's full profile by id. Returns name, contact info, rate, status, notes, NIB settings, hire date. Use this when you need details beyond what list_workers returns.",
  input_schema: {
    type: "object",
    properties: {
      worker_id: { type: "string", description: "UUID of the worker." },
    },
    required: ["worker_id"],
  },
  tier: "none",
  scope: "read",
  skills: ["core"],
  async handler(input, ctx) {
    const { data, error } = await ctx.supabase
      .from("workers")
      .select("id, first_name, last_name, email, phone, hourly_rate, overtime_rate_multiplier, status, hire_date, notes, nib_enabled, nib_number")
      .eq("id", input.worker_id)
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "worker not found" };
    return { ok: true, data };
  },
};
