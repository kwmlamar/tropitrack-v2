import { NextRequest, NextResponse } from "next/server";
import { classifyOpenAIError, openAiHeaders, OPENAI_API_URL, OPENAI_VISION_MODEL } from "@/lib/ai-config";

interface Material {
  id: string;
  name: string;
  unit: string;
  unit_cost: number;
}

interface ParsedLineItem {
  receiptName: string;
  qty: number | null;
  unit: string | null;
  unitCost: number | null;
  totalCost: number | null;
  vendor: string | null;
  receiptDate: string | null;
  matchId: string | null;
  matchConfidence: "high" | "medium" | "low" | "none";
  suggestedDiv: string | null;
  suggestedCat: string | null;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
  }

  let body: { image: string; mediaType: string; materials: Material[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { image, mediaType, materials } = body;
  if (!image || !mediaType) {
    return NextResponse.json({ error: "image and mediaType are required" }, { status: 400 });
  }

  const matList = (materials ?? [])
    .slice(0, 100)
    .map((m: Material) => `${m.id}: ${m.name} (${m.unit}, BSD$${m.unit_cost})`)
    .join("\n");

  const prompt = `You are a construction receipt scanner for ODS Construction in Eleuthera, Bahamas.

Analyze this receipt/invoice image and extract every line item purchased.

For each line item return a JSON object with:
- "receiptName": exact text from receipt
- "qty": quantity purchased (number or null)
- "unit": unit as shown (EA, LF, SF, CY, BAG, SHEET, etc. or null)
- "unitCost": cost per unit in BSD$ (number or null)
- "totalCost": line total in BSD$ (number or null)
- "vendor": vendor/supplier name from receipt (or null)
- "receiptDate": date on receipt as YYYY-MM-DD (or null)
- "matchId": best matching material ID from list below, or null
- "matchConfidence": "high", "medium", "low", or "none"
- "suggestedDiv": CSI division code (e.g. "06") if new item, else null
- "suggestedCat": suggested category if new item, else null

Existing materials (ID: name, unit, current price):
${matList}

IMPORTANT: Return ONLY a raw JSON array. No markdown fences. No explanation. Example:
[{"receiptName":"2x4x8 PT","qty":20,"unit":"EA","unitCost":13.50,"totalCost":270,"vendor":"Thompson Hardware","receiptDate":"2026-05-15","matchId":"S019","matchConfidence":"high","suggestedDiv":null,"suggestedCat":null}]`;

  try {
    // OpenAI takes an image as a data: URI in an image_url part, where
    // Anthropic took a base64 source block with a separate media_type.
    const res = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: openAiHeaders(apiKey),
      body: JSON.stringify({
        model: OPENAI_VISION_MODEL,
        max_tokens: 2000,
        messages: [{
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:${mediaType};base64,${image}` } },
            { type: "text", text: prompt },
          ],
        }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      const failure = classifyOpenAIError(res.status, err);
      return NextResponse.json({ error: failure.message, reason: failure.reason }, { status: 502 });
    }

    const data = await res.json();
    const text: string = data.choices?.[0]?.message?.content ?? "[]";
    const items: ParsedLineItem[] = JSON.parse(text.replace(/```json|```/g, "").trim());
    return NextResponse.json({ items });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
