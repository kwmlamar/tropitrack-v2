import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface MatchRequest {
  line_items: Array<{
    product_code?: string;
    description: string;
    unit_price: number;
  }>;
  vendor_id: string;
}

interface MaterialMatch {
  id: string;
  name: string;
  category: string;
  unit: string;
  unit_cost: number;
  last_purchase_price: number | null;
  last_purchase_date: string | null;
  average_price: number | null;
  vendor_product_code: string | null;
}

interface MatchResult {
  index: number;
  description: string;
  product_code?: string;
  match: {
    existing: MaterialMatch | null;
    confidence: "high" | "medium" | "new";
    price_change?: {
      previous: number;
      current: number;
      percentage: number;
    };
    possible_matches?: MaterialMatch[];
  };
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, company_id")
      .eq("id", user.id)
      .single();

    if (!profile?.company_id) {
      return NextResponse.json(
        { error: "User not associated with a company" },
        { status: 400 }
      );
    }

    const body: MatchRequest = await request.json();
    const { line_items, vendor_id } = body;

    if (!vendor_id || !line_items) {
      return NextResponse.json(
        { error: "Vendor ID and line items are required" },
        { status: 400 }
      );
    }

    // Fetch all materials for this vendor
    const { data: vendorMaterials } = await supabase
      .from("materials")
      .select("id, name, category, unit, unit_cost, last_purchase_price, last_purchase_date, average_price, vendor_product_code")
      .eq("company_id", profile.company_id)
      .eq("supplier_id", vendor_id);

    const results: MatchResult[] = [];

    for (let i = 0; i < line_items.length; i++) {
      const item = line_items[i];
      let existingMaterial: MaterialMatch | null = null;
      let confidence: "high" | "medium" | "new" = "new";
      const possibleMatches: MaterialMatch[] = [];

      if (vendorMaterials && vendorMaterials.length > 0) {
        // Try exact product code match
        if (item.product_code) {
          const codeMatch = vendorMaterials.find(
            (m) => m.vendor_product_code === item.product_code
          );
          if (codeMatch) {
            existingMaterial = codeMatch as MaterialMatch;
            confidence = "high";
          }
        }

        // Try fuzzy name match if no code match
        if (!existingMaterial) {
          const itemWords = item.description.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2);

          for (const material of vendorMaterials) {
            const materialWords = material.name.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2);
            const overlap = itemWords.filter((w: string) =>
              materialWords.some((mw: string) => mw.includes(w) || w.includes(mw))
            );

            const similarity = overlap.length / Math.max(itemWords.length, materialWords.length);

            if (similarity > 0.5) {
              possibleMatches.push(material as MaterialMatch);
            }
          }

          // Sort by similarity and take best match if confident
          if (possibleMatches.length === 1) {
            existingMaterial = possibleMatches[0];
            confidence = "medium";
          } else if (possibleMatches.length > 0) {
            // Keep as possible matches but don't auto-select
            confidence = "new";
          }
        }
      }

      // Calculate price change if matching existing material
      let priceChange: MatchResult["match"]["price_change"] | undefined;
      if (existingMaterial) {
        const previousPrice = existingMaterial.last_purchase_price || existingMaterial.unit_cost;
        if (previousPrice && previousPrice !== item.unit_price) {
          priceChange = {
            previous: previousPrice,
            current: item.unit_price,
            percentage: Math.round(((item.unit_price - previousPrice) / previousPrice) * 100),
          };
        }
      }

      results.push({
        index: i,
        description: item.description,
        product_code: item.product_code,
        match: {
          existing: existingMaterial,
          confidence,
          price_change: priceChange,
          possible_matches: confidence === "new" && possibleMatches.length > 0 ? possibleMatches.slice(0, 3) : undefined,
        },
      });
    }

    return NextResponse.json({
      success: true,
      matches: results,
      summary: {
        total: results.length,
        matched_high: results.filter((r) => r.match.confidence === "high").length,
        matched_medium: results.filter((r) => r.match.confidence === "medium").length,
        new: results.filter((r) => r.match.confidence === "new").length,
      },
    });
  } catch (error) {
    console.error("Material matching error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to match materials" },
      { status: 500 }
    );
  }
}
