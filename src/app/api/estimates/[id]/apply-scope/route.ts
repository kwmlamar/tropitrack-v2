import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { computeLaborCost } from "@/types";

/**
 * POST /api/estimates/[id]/apply-scope
 *
 * Issue #7 — write Claude's structured scope JSON into the two-grain model:
 *   estimate_sections, estimate_line_items (labor-only),
 *   estimate_section_materials (takeoff).
 *
 * Server-side responsibilities:
 *   - Chain section dates from `project_start_date` (durations from Claude)
 *   - Compute labor_cost = man_days × rate (via computeLaborCost)
 *   - Store material/equipment unit costs RAW — markup applies on read by
 *     computeSectionMaterialSell. Do NOT pre-multiply.
 *   - Do NOT write `amount` or `unit_rate` — generated columns.
 *   - Reject (409) if the estimate already has sections (caller clears first).
 *   - Per-tenant via Supabase RLS on the session cookie.
 *   - The update_estimate_totals trigger fires automatically; we don't compute
 *     subtotal / overhead / vat / total here.
 */

const LineItemSchema = z.object({
  description: z.string().min(1),
  client_name: z.string().nullable().optional(),
  unit: z.string().nullable().optional(),
  quantity: z.number().nonnegative().default(1),
  man_days: z.number().nonnegative(),
  notes: z.string().nullable().optional(),
});

const MaterialSchema = z.object({
  description: z.string().min(1),
  client_name: z.string().nullable().optional(),
  quantity: z.number().nonnegative(),
  unit: z.string().nullable().optional(),
  unit_cost: z.number().nonnegative(),
  is_equipment: z.boolean().default(false),
  material_id: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const SectionSchema = z.object({
  name: z.string().min(1),
  client_name: z.string().nullable().optional(),
  duration_days: z.number().int().positive(),
  items: z.array(LineItemSchema).default([]),
  materials: z.array(MaterialSchema).default([]),
});

const PayloadSchema = z
  .object({
    project_start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD"),
    labor_sell_rate_per_day: z.number().positive().optional(),
    sections: z.array(SectionSchema).min(1, "at least one section required"),
  })
  .refine(
    (p) => p.sections.every((s) => s.items.length > 0 || s.materials.length > 0),
    { message: "every section must have at least one item or material" },
  );

type Payload = z.infer<typeof PayloadSchema>;

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const estimateId = ctx.params.id;
  const supabase = createClient();

  // Auth — RLS enforces company scope on every subsequent query, but we still
  // need a logged-in user.
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse + validate body
  let payload: Payload;
  try {
    const body = await req.json();
    payload = PayloadSchema.parse(body);
  } catch (e) {
    const message = e instanceof z.ZodError ? e.errors : String(e);
    return NextResponse.json({ error: "Invalid payload", details: message }, { status: 400 });
  }

  // Load the estimate (RLS will 0-rows if not in user's company)
  const { data: estimate, error: estErr } = await supabase
    .from("estimates")
    .select("id, labor_sell_rate_per_day")
    .eq("id", estimateId)
    .single();
  if (estErr || !estimate) {
    return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
  }

  // 409 if any sections already exist on this estimate
  const { count: existingSections } = await supabase
    .from("estimate_sections")
    .select("*", { count: "exact", head: true })
    .eq("estimate_id", estimateId);
  if ((existingSections ?? 0) > 0) {
    return NextResponse.json(
      { error: "Estimate already has sections — clear first" },
      { status: 409 },
    );
  }

  // Decide the effective labor sell rate to use for labor_cost computation:
  //   payload value > existing estimate value > 0 (warn on zero — labor lines will store 0)
  const effectiveRate =
    payload.labor_sell_rate_per_day ?? Number(estimate.labor_sell_rate_per_day ?? 0);

  // If the estimate had no rate set but the payload provided one, persist it
  if (
    payload.labor_sell_rate_per_day != null &&
    (estimate.labor_sell_rate_per_day == null || Number(estimate.labor_sell_rate_per_day) === 0)
  ) {
    const { error: rateErr } = await supabase
      .from("estimates")
      .update({ labor_sell_rate_per_day: payload.labor_sell_rate_per_day })
      .eq("id", estimateId);
    if (rateErr) {
      return NextResponse.json({ error: "Failed to persist labor rate", details: rateErr.message }, { status: 500 });
    }
  }

  // Build chained section rows
  let cursor = payload.project_start_date;
  const sectionRows = payload.sections.map((s, idx) => {
    const plannedStart = cursor;
    const plannedEnd = addDays(plannedStart, Math.max(s.duration_days - 1, 0));
    // Next section starts the day after this one ends
    cursor = addDays(plannedEnd, 1);
    return {
      estimate_id: estimateId,
      name: s.name,
      client_name: s.client_name?.trim() || null,
      order_index: idx,
      planned_start: plannedStart,
      planned_end: plannedEnd,
      show_to_client: true,
    };
  });

  // Insert sections first so we can attach children by section_id
  const { data: insertedSections, error: secErr } = await supabase
    .from("estimate_sections")
    .insert(sectionRows)
    .select("id, order_index");
  if (secErr || !insertedSections) {
    return NextResponse.json(
      { error: "Failed to insert sections", details: secErr?.message },
      { status: 500 },
    );
  }

  // Map order_index -> section_id for child attachment
  const sectionIdByIndex = new Map<number, string>();
  for (const row of insertedSections) sectionIdByIndex.set(row.order_index, row.id);

  // Cleanup helper — single CASCADE delete reverses sections + children
  const cleanup = async () => {
    await supabase.from("estimate_sections").delete().eq("estimate_id", estimateId);
  };

  // Build labor line item rows
  const lineItemRows: Array<Record<string, unknown>> = [];
  payload.sections.forEach((s, sIdx) => {
    const sectionId = sectionIdByIndex.get(sIdx);
    if (!sectionId) return;
    const parent = sectionRows[sIdx];
    s.items.forEach((it, iIdx) => {
      const laborCost = computeLaborCost(
        { man_days: it.man_days, labor_sell_rate_per_day: null },
        effectiveRate,
      );
      lineItemRows.push({
        section_id: sectionId,
        estimate_id: estimateId,
        description: it.description,
        client_name: it.client_name?.trim() || null,
        quantity: it.quantity,
        unit: it.unit ?? null,
        man_days: it.man_days,
        labor_cost: laborCost,
        // material_cost + equipment_cost default to 0 — labor lines own labor only
        notes: it.notes ?? null,
        order_index: iIdx,
        show_to_client: true,
        planned_start: parent.planned_start,
        planned_end: parent.planned_end,
      });
    });
  });

  if (lineItemRows.length > 0) {
    const { error: itemErr } = await supabase.from("estimate_line_items").insert(lineItemRows);
    if (itemErr) {
      await cleanup();
      return NextResponse.json(
        { error: "Failed to insert line items", details: itemErr.message },
        { status: 500 },
      );
    }
  }

  // Build section material rows
  const materialRows: Array<Record<string, unknown>> = [];
  payload.sections.forEach((s, sIdx) => {
    const sectionId = sectionIdByIndex.get(sIdx);
    if (!sectionId) return;
    s.materials.forEach((m, mIdx) => {
      materialRows.push({
        section_id: sectionId,
        material_id: m.material_id ?? null,
        description: m.description,
        client_name: m.client_name?.trim() || null,
        quantity: m.quantity,
        unit: m.unit ?? null,
        unit_cost: m.unit_cost,
        is_equipment: m.is_equipment,
        notes: m.notes ?? null,
        order_index: mIdx,
      });
    });
  });

  if (materialRows.length > 0) {
    const { error: matErr } = await supabase
      .from("estimate_section_materials")
      .insert(materialRows);
    if (matErr) {
      await cleanup();
      return NextResponse.json(
        { error: "Failed to insert section materials", details: matErr.message },
        { status: 500 },
      );
    }
  }

  // Trigger update_estimate_totals fires on every insert — fetch the recomputed totals
  const { data: refreshed } = await supabase
    .from("estimates")
    .select("subtotal, overhead_amount, tax_amount, total_amount")
    .eq("id", estimateId)
    .single();

  return NextResponse.json({
    estimate_id: estimateId,
    sections_inserted: insertedSections.length,
    line_items_inserted: lineItemRows.length,
    materials_inserted: materialRows.length,
    totals: refreshed,
  });
}
