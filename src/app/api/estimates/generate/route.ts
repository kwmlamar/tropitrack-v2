import { NextRequest, NextResponse } from "next/server";

interface Material {
  id: string;
  division_code: string;
  category: string;
  name: string;
  unit: string;
  unit_cost: number;
}

interface GeneratedLineItem {
  description: string;
  quantity: number;
  unit: string;
  labor_cost: number;
  material_cost: number;
  equipment_cost: number;
  material_id: string | null;
  notes: string;
  crew_days: number;
}

interface GeneratedSection {
  name: string;
  items: GeneratedLineItem[];
}

const SYSTEM = `You are an expert construction estimator for ODS Construction, a small construction company in central Eleuthera, Bahamas.

You generate professional construction estimates in the same format used by Bahamian contractors.

Rules:
- All prices in BSD$ (= USD$ at 1:1 parity)
- Labor rates: General laborer BSD$15-18/hr, Skilled trades BSD$20-28/hr, Foreman BSD$25-32/hr
- Typical work day = 8 hours
- Account for Nassau freight costs (materials shipped from Nassau add ~30-45% to base price)
- Standard overhead = 15%, VAT = 10%
- Be realistic for Eleuthera conditions: hurricane-rated materials, moisture/termite resistance, local availability
- Group work into CSI-style trade sections (ROOF REPAIRS, MASONRY/CEMENT WORK, CARPENTRY/WOOD-WORK, etc.)
- Each section has line items with description, qty, unit, labor cost, material cost, equipment cost

When a material from the provided database matches a line item, use its ID and price.
For labor, estimate hours × rate. For materials not in the DB, estimate market price.`;

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  const { description, materials }: { description: string; materials: Material[] } = await req.json();
  if (!description?.trim()) {
    return NextResponse.json({ error: "Description required" }, { status: 400 });
  }

  const matList = materials
    .slice(0, 120)
    .map(m => `${m.id}|${m.name}|${m.unit}|BSD$${m.unit_cost}`)
    .join("\n");

  const prompt = `Generate a detailed construction estimate for the following job:

"${description}"

Available materials from the Eleuthera pricing database (ID|Name|Unit|Price):
${matList}

Return a JSON object with this exact structure:
{
  "property_name": "inferred from description or null",
  "sections": [
    {
      "name": "TRADE SECTION NAME (ALL CAPS)",
      "items": [
        {
          "description": "Clear description of work",
          "quantity": 1,
          "unit": "LS",
          "labor_cost": 0.00,
          "material_cost": 0.00,
          "equipment_cost": 0.00,
          "material_id": "S001 or null",
          "notes": "brief note or empty string",
          "crew_days": 1
        }
      ]
    }
  ]
}

Return ONLY the raw JSON. No markdown. No explanation.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: err }, { status: 502 });
  }

  const data = await res.json();
  const text: string = data.content?.find((b: { type: string }) => b.type === "text")?.text ?? "{}";

  try {
    const result = JSON.parse(text.replace(/```json|```/g, "").trim());
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Failed to parse Claude response", raw: text }, { status: 500 });
  }
}
