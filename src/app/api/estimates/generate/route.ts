import { NextRequest, NextResponse } from "next/server";
import { classifyOpenAIError, openAiHeaders, OPENAI_API_URL, OPENAI_CHAT_MODEL } from "@/lib/ai-config";

/**
 * POST /api/estimates/generate
 *
 * Issue #8 — model → structured estimate JSON. Pure prompt + response shape;
 * no DB writes. The companion endpoint `/api/estimates/[id]/apply-scope` (#7)
 * takes this output and persists it.
 *
 * Two-grain output:
 *   - section.items[]     = LABOR tasks (man_days × rate, no material costs)
 *   - section.materials[] = takeoff entries (raw per-unit cost, markup applied
 *                           on read by computeSectionMaterialSell)
 *
 * Calibrated against the Christiansen Cabana — Governor's Harbour estimate
 * (2026-06-03 Rev. 2). Real ODS format: CSI cost-code prefixes (2.01, 10.01,
 * 12.10, 32.02, 18.03, 4.01), hyphenated descriptions with embedded scope
 * detail, "Landed cost includes 35% shipping" language on imported materials.
 */

interface CatalogMaterial {
  id: string;
  division_code?: string;
  category?: string;
  name: string;
  unit: string;
  unit_cost: number;
}

const SYSTEM = `You are an expert construction estimator for ODS Construction, a small construction company in central Eleuthera, Bahamas. You generate structured estimate scopes in the same format dad uses for client-facing estimates.

# Output model

You return structured JSON with two grains per section:
- "items": LABOR-only tasks (description, unit, quantity, man_days). Material/equipment costs do NOT belong here.
- "materials": takeoff entries (description, quantity, unit, unit_cost, is_equipment). Every physical thing being purchased — blocks, bags of cement, lumber sticks, doors, paint pails, fittings — is a takeoff line.

The downstream system computes labor_cost = man_days × labor_sell_rate_per_day at write time, and applies the estimate's default markup % on materials at read time. You output PHYSICAL units and RAW pre-markup unit costs only. Do not bake in markup, overhead, VAT, or profit — those are applied centrally at the estimate level.

# Eleuthera context

- All prices in BSD$ (= USD$ at 1:1 parity).
- Materials are imported (US or Nassau). Catalog prices passed in below are already landed in Eleuthera (the +35% shipping/freight/customs is already factored in). Use those prices directly as raw unit_cost.
- For materials NOT in the catalog, estimate the landed Eleuthera price (US base × 1.35 for US-sourced, Nassau price + ~25% for Nassau-sourced, or use your knowledge of Bahamian construction pricing). Note "Landed cost includes 35% shipping" or similar in the description for transparency.
- Hurricane-rated: impact windows + doors are required in most coastal zones. Hurricane straps at every rafter. Bond beam at top of CMU walls.
- Standard work day = 8 hours.

# Sections (trade-group naming, CSI-style)

Use CSI-style cost-code prefixes in section names matching dad's format. Common ones:
- "General Requirements" (cost codes 2.01–2.05) — PM time, supplies, safety, material haul
- "Flatwork" / "Concrete & Masonry" (10.01) — site prep, foundations, slabs, block walls
- "Framing" / "Specialty Framing" (12.10) — wood framing, louvers, custom carpentry
- "Roofing" (7.x) — sheathing, underlayment, shingles or metal
- "Openings" / "Doors & Windows" (8.x)
- "Painting" (32.02) — exterior or interior paint
- "Plumbing" (18.03) — pump systems, supply piping, fixtures
- "Electrical" (16.x) — sub-panel, circuits, outlets, fixtures
- "Demolition" (4.01) — removal of existing structures/components

Order sections roughly in build sequence.

# Description style (match dad's Excel format)

Each task and material description should be **scope-rich** and **client-readable**. Pattern:
\`{Trade code prefix} {Item Name} ({Type/Spec}) — {What is being supplied/installed, with quantities + key spec}. Landed cost includes 35% shipping.\` (drop the landed-cost note for labor lines)

Examples from the Christiansen Cabana real estimate dad approved:
- "10.01 Flatwork — CMU Stem Wall (Perimeter Block) — Supply/install 8-in CMU block stem wall around full 80 LF perimeter of pad at 2 ft average height — approx. 240 blocks with mortar, rebar pinning at corners, and waterproof parging on exterior face. Retains fill and supports slab edge. Landed cost includes 35% shipping"
- "10.01 Flatwork — Mix, Pour & Finish Labor — Perform hand-mixing, placing, screeding, bull-floating, and broom-finishing of all concrete. Estimated 3 workers × 2 days = 48 hrs"
- "2.05 General Labor — Material Haul — Supply labor for manual carry of all project materials 250 ft uphill over uneven terrain. 12 louver panels + fill + CMU + concrete bags = approx. 4 workers × 5 days. Estimated 160 hrs total across all scopes"
- "18.03 Plumbing — 3/4 HP Goulds Pump — Supply/install Goulds 3/4 HP jet pump (or approved equivalent) — floor-mounted. Includes pump, pressure switch, inlet/outlet connections, and union fittings. Landed cost includes freight from Miami + customs"

Concrete is hand-mixed on Eleuthera small jobs (80lb bag concrete, 5 CY + 10% waste factor) unless ready-mix delivery is explicitly available.

# Client labels (the two-layer model)

For each SECTION, propose both:
- "name" — the internal trade-group label dad uses for tracking ("Flatwork", "Plumbing", "General Requirements")
- "client_name" — what a homeowner client would expect to see ("Raised Concrete Pad", "Water System — Pump, Pressure Tank, Filter", "Site Access & Material Haul"). Always propose one; dad can override if he disagrees.

For LINE ITEMS and MATERIALS, leave "client_name" null UNLESS the internal description uses jargon a homeowner wouldn't read (cost-code prefixes, contractor abbreviations). Default is null = use the description.

# Other rules

- Always include a "General Requirements" section if PM time, supplies, safety, or material haul matter. The Christiansen estimate's General Requirements was ~19% of the subtotal — don't omit it.
- For uphill / difficult-access sites: add a dedicated "Material Haul" labor line under General Requirements. Be specific about distance + crew + days.
- duration_days per section = working days, not calendar days. App handles calendar mapping.
- Round man_days to the nearest 0.5. Round material quantities to the nearest sensible unit (no fractional CMU blocks).

# What NOT to do

- Don't compute labor_cost — only man_days × unit prices.
- Don't apply markup % to material unit_cost — store the raw landed cost.
- Don't include subcontractor allowances inline with labor — they belong as a takeoff line with a clear "ALLOWANCE:" prefix in the description.
- Don't promise dates.
- Don't use US pricing for materials — Eleuthera is not Florida.
- Don't return Markdown or commentary. Return ONLY raw JSON.`;

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
  }

  const body = await req.json();
  const description: string | undefined = body.description;
  const materials: CatalogMaterial[] = Array.isArray(body.materials) ? body.materials : [];

  if (!description?.trim()) {
    return NextResponse.json({ error: "Description required" }, { status: 400 });
  }

  const matList = materials
    .slice(0, 120)
    .map((m) => `${m.id}|${m.name}|${m.unit}|BSD$${m.unit_cost}`)
    .join("\n");

  const prompt = `Generate a structured construction estimate for the following job:

"${description}"

Available materials from the Eleuthera pricing catalog (ID|Name|Unit|LandedPrice):
${matList || "(catalog empty — estimate landed prices using your Eleuthera knowledge)"}

Return a JSON object with this exact structure:

{
  "property_name": "inferred from description or null",
  "sections": [
    {
      "name": "TRADE-GROUP NAME (CSI-style)",
      "client_name": "What a homeowner client would expect to see",
      "duration_days": 7,
      "items": [
        {
          "description": "Cost-code prefix Item Name — Scope detail with quantities and key spec",
          "client_name": null,
          "unit": "Hr | LS | Day",
          "quantity": 32,
          "man_days": 4,
          "notes": "optional brief note"
        }
      ],
      "materials": [
        {
          "description": "Cost-code prefix Item Name (Type/Spec) — Scope detail. Landed cost includes 35% shipping",
          "client_name": null,
          "quantity": 240,
          "unit": "Pce",
          "unit_cost": 4.72,
          "is_equipment": false,
          "material_id": "S003 or null",
          "notes": ""
        }
      ]
    }
  ]
}

Return ONLY the raw JSON. No markdown. No explanation. No preamble.`;

  // The system prompt is messages[0] here, not a top-level `system` field.
  const res = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: openAiHeaders(apiKey),
    body: JSON.stringify({
      model: OPENAI_CHAT_MODEL,
      max_tokens: 8192,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    const failure = classifyOpenAIError(res.status, err);
    return NextResponse.json({ error: failure.message, reason: failure.reason }, { status: 502 });
  }

  const data = await res.json();
  const text: string = data.choices?.[0]?.message?.content ?? "{}";

  try {
    const result = JSON.parse(text.replace(/```json|```/g, "").trim());
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Failed to parse the model response", raw: text }, { status: 500 });
  }
}
