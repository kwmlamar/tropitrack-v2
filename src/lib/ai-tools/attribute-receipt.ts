import type { SupabaseClient } from "@supabase/supabase-js";
import type { ToolContext, ToolDescriptor } from "./types";
import { resolveByName } from "./match";

/**
 * Putting receipts against the right job.
 *
 * Receipts arriving from WhatsApp land with project_id null, so the job they
 * belong to carries none of that spend and job cost reads low. Intake is
 * somebody else's job; this is the fix-up, and it is deliberately the narrowest
 * write in the registry.
 *
 * attribute_receipt sets receipts.project_id AND NOTHING ELSE. Not the vendor,
 * not the date, not the amount, not the image, not the status, not
 * submitted_by, and never a receipt_line_items row — the scanner owns all of
 * that. A tool that can only change one column cannot quietly rewrite a
 * receipt.
 */

interface ReceiptRow {
  id: string;
  vendor: string | null;
  receipt_date: string | null;
  total_amount: number | null;
  status: string;
  project_id: string | null;
  notes: string | null;
  projects?: { name: string } | { name: string }[] | null;
}

function projectNameOf(r: ReceiptRow): string | null {
  const p = Array.isArray(r.projects) ? r.projects[0] : r.projects;
  return p?.name ?? null;
}

function describe(r: ReceiptRow): string {
  const amount = r.total_amount != null ? `BSD $${Number(r.total_amount).toFixed(2)}` : "amount unknown";
  return `${r.vendor ?? "unknown vendor"} · ${r.receipt_date ?? "no date"} · ${amount}`;
}

async function loadReceipt(supabase: SupabaseClient, companyId: string, id: string) {
  const { data } = await supabase
    .from("receipts")
    .select("id, vendor, receipt_date, total_amount, status, project_id, notes, projects(name)")
    .eq("company_id", companyId)
    .eq("id", id)
    .single();
  return (data as ReceiptRow) ?? null;
}

// ── List ─────────────────────────────────────────────────────────────────────

interface ListInput {
  limit?: number;
}

export const listUnattributedReceiptsTool: ToolDescriptor<ListInput, unknown> = {
  name: "list_unattributed_receipts",
  description:
    "List receipts with no job attached (project_id is null). These are usually receipts that arrived from WhatsApp — until they are attributed, the job that actually incurred the spend shows a lower cost than it really has. Returns vendor, date, amount and status for each, newest first.",
  input_schema: {
    type: "object",
    properties: {
      limit: { type: "number", description: "Maximum receipts to return. Defaults to 50." },
    },
  },
  tier: "none",
  scope: "read",
  skills: ["core", "receipts"],

  async handler(input, ctx) {
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
    const { data, error } = await ctx.supabase
      .from("receipts")
      .select("id, vendor, receipt_date, total_amount, status, notes")
      .eq("company_id", ctx.companyId)
      .is("project_id", null)
      .order("receipt_date", { ascending: false, nullsFirst: false })
      .limit(limit);
    if (error) return { ok: false, error: `receipts query failed: ${error.message}` };

    const rows = (data ?? []).map((r) => ({
      receipt_id: r.id,
      vendor: r.vendor,
      receipt_date: r.receipt_date,
      total_amount: r.total_amount != null ? Number(r.total_amount) : null,
      status: r.status,
      notes: r.notes,
    }));

    return {
      ok: true,
      data: {
        count: rows.length,
        // Not summed on purpose: an unattributed total is not a figure anyone
        // should quote, and totals come from functions, not from this handler.
        receipts: rows,
        note:
          "These receipts are not counted against any job. Attributing one sets its job and changes nothing else about it.",
      },
    };
  },
};

// ── Attribute ────────────────────────────────────────────────────────────────

interface AttributeInput {
  receipt_id: string;
  project_id?: string;
  project_name?: string;
}

async function resolveTarget(
  ctx: ToolContext,
  input: AttributeInput,
): Promise<
  | { ok: true; receipt: ReceiptRow; project: { id: string; name: string } }
  | { ok: false; error: string }
> {
  if (!input.receipt_id) return { ok: false, error: "receipt_id is required" };

  const receipt = await loadReceipt(ctx.supabase, ctx.companyId, input.receipt_id);
  if (!receipt) return { ok: false, error: `receipt ${input.receipt_id} not found` };

  const { data: projects, error } = await ctx.supabase
    .from("projects")
    .select("id, name, client_name, location")
    .eq("company_id", ctx.companyId);
  if (error) return { ok: false, error: `projects query failed: ${error.message}` };
  if (!projects?.length) return { ok: false, error: "no jobs found for this company" };

  let project = projects.find((p) => p.id === input.project_id);
  if (!project) {
    if (!input.project_name) return { ok: false, error: "give either project_id or project_name" };
    const resolved = resolveByName(
      input.project_name,
      projects as { id: string; name: string; client_name: string | null; location: string | null }[],
      (p) => [p.name, p.client_name ?? "", p.location ?? ""].filter(Boolean),
      "job",
    );
    if (!resolved.ok) {
      return {
        ok: false,
        error: `${resolved.error} — candidates: ${resolved.candidates.map((c) => c.name).join(", ")}`,
      };
    }
    project = resolved.match;
  }

  return { ok: true, receipt, project: { id: project.id, name: project.name } };
}

export const attributeReceiptTool: ToolDescriptor<AttributeInput, unknown> = {
  name: "attribute_receipt",
  description:
    "Put one receipt against a job. Sets receipts.project_id and NOTHING else — never the vendor, date, amount, image, status or any line item; the scanner owns those. Re-attributing a receipt that already has a job is allowed, and the confirmation card shows the old job and the new one explicitly. If a receipt's vendor or amount is wrong, say so and point at the receipts screen instead of trying to fix it here.",
  input_schema: {
    type: "object",
    properties: {
      receipt_id: { type: "string", description: "From list_unattributed_receipts." },
      project_id: { type: "string", description: "Job id, when you already have it." },
      project_name: { type: "string", description: "Job as the user named it. Fuzzy-matched." },
    },
    required: ["receipt_id"],
  },
  tier: "confirm",
  scope: "write",
  skills: ["receipts"],

  async preview(input, ctx) {
    const resolved = await resolveTarget(ctx, input);
    if (!resolved.ok) return { summary: `⚠ ${resolved.error}` };

    const { receipt, project } = resolved;
    const current = projectNameOf(receipt) ?? "unassigned";

    if (receipt.project_id === project.id) {
      return { summary: `⚠ This receipt is already on ${project.name}. Nothing to change.` };
    }

    // Re-attribution is stated as a move, not as a fresh assignment — the user
    // should see what is being taken off one job as well as what lands on another.
    return {
      summary: `Attribute receipt: ${describe(receipt)}\n\n${current} → ${project.name}\n\nOnly the job changes. Vendor, date, amount, image and line items are untouched.`,
    };
  },

  async handler(input, ctx) {
    const resolved = await resolveTarget(ctx, input);
    if (!resolved.ok) return { ok: false, error: resolved.error };

    const { receipt, project } = resolved;
    if (receipt.project_id === project.id) {
      return { ok: false, error: `receipt is already on ${project.name}` };
    }

    // One column. Company id comes from the tool context, never from model
    // input, and the filter is belt-and-braces over RLS.
    const { data, error } = await ctx.supabase
      .from("receipts")
      .update({ project_id: project.id })
      .eq("id", receipt.id)
      .eq("company_id", ctx.companyId)
      .select("id, project_id")
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "update failed" };

    return {
      ok: true,
      data: {
        receipt_id: data.id,
        previous_project: projectNameOf(receipt) ?? null,
        previous_project_id: receipt.project_id,
        new_project: project.name,
        new_project_id: data.project_id,
      },
      target: { table: "receipts", rowId: data.id },
    };
  },
};
