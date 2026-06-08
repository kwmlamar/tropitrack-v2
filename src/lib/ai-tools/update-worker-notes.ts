import type { ToolDescriptor } from "./types";

interface Input {
  worker_id: string;
  notes: string;
}

interface Output {
  worker_id: string;
  notes: string;
}

export const updateWorkerNotesTool: ToolDescriptor<Input, Output> = {
  name: "update_worker_notes",
  description:
    "Replace the notes field on a worker. Use the worker's id (from list_workers or get_worker_unpaid). The notes field is free-form text shown on the worker's profile.",
  input_schema: {
    type: "object",
    properties: {
      worker_id: { type: "string", description: "UUID of the worker to update." },
      notes: { type: "string", description: "The new notes value. Replaces existing notes entirely." },
    },
    required: ["worker_id", "notes"],
  },
  tier: "confirm",
  scope: "write",
  skills: ["payroll", "core"],
  async preview(input, ctx) {
    const { data: worker } = await ctx.supabase
      .from("workers")
      .select("first_name, last_name")
      .eq("id", input.worker_id)
      .single();
    const name = worker ? `${worker.first_name} ${worker.last_name}` : input.worker_id;
    const preview = input.notes.length > 80 ? input.notes.slice(0, 80) + "…" : input.notes;
    return { summary: `Set ${name}'s notes to: "${preview}"` };
  },
  async handler(input, ctx) {
    const { data, error } = await ctx.supabase
      .from("workers")
      .update({ notes: input.notes })
      .eq("id", input.worker_id)
      .select("id, notes")
      .single();
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "worker not found (or RLS denied)" };
    return {
      ok: true,
      data: { worker_id: data.id, notes: data.notes },
      target: { table: "workers", rowId: data.id },
    };
  },
};
