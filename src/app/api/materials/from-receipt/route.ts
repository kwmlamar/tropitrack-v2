import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { MaterialCategory } from "@/types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface MaterialFromReceiptItem {
  product_code?: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  category?: MaterialCategory;
  unit?: string;
}

interface ImportMaterialsRequest {
  line_items: MaterialFromReceiptItem[];
  vendor_id: string;
  receipt_date: string;
  purchase_order_id?: string;
}

interface MaterialRow {
  id: string;
  name: string;
  category: string;
  unit: string;
  unit_cost: number;
  quantity_in_stock: number;
  minimum_stock_level: number;
  supplier_id: string | null;
  vendor_product_code: string | null;
  last_purchase_price: number | null;
  last_purchase_date: string | null;
  average_price: number | null;
  company_id: string;
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

    const body: ImportMaterialsRequest = await request.json();
    const { line_items, vendor_id, receipt_date, purchase_order_id } = body;

    if (!vendor_id) {
      return NextResponse.json({ error: "Vendor ID is required" }, { status: 400 });
    }

    if (!line_items || line_items.length === 0) {
      return NextResponse.json({ error: "No items to import" }, { status: 400 });
    }

    const results = {
      created: [] as MaterialRow[],
      updated: [] as MaterialRow[],
      errors: [] as { item: string; error: string }[],
    };

    for (const item of line_items) {
      try {
        // Try to find existing material by product code + vendor
        let existingMaterial: MaterialRow | null = null;

        if (item.product_code) {
          const { data: codeMatch } = await supabase
            .from("materials")
            .select("*")
            .eq("company_id", profile.company_id)
            .eq("supplier_id", vendor_id)
            .eq("vendor_product_code", item.product_code)
            .maybeSingle();

          if (codeMatch) {
            existingMaterial = codeMatch as MaterialRow;
          }
        }

        // If no match by product code, try fuzzy match by name
        if (!existingMaterial) {
          const searchWords = item.description.toLowerCase().split(/\s+/).filter(w => w.length > 2);
          if (searchWords.length > 0) {
            const { data: fuzzyMatches } = await supabase
              .from("materials")
              .select("*")
              .eq("company_id", profile.company_id)
              .eq("supplier_id", vendor_id)
              .ilike("name", `%${searchWords[0]}%`)
              .limit(5);

            if (fuzzyMatches && fuzzyMatches.length === 1) {
              // Only auto-match if exactly one fuzzy match
              existingMaterial = fuzzyMatches[0] as MaterialRow;
            }
          }
        }

        if (existingMaterial) {
          // Update existing material with new pricing
          const newAvgPrice = calculateNewAverage(
            existingMaterial.average_price || existingMaterial.unit_cost,
            getTotalPurchases(existingMaterial),
            item.unit_price
          );

          const { data: updated, error: updateError } = await supabase
            .from("materials")
            .update({
              last_purchase_price: item.unit_price,
              last_purchase_date: receipt_date,
              average_price: newAvgPrice,
              unit_cost: item.unit_price, // Update current unit cost to latest price
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingMaterial.id)
            .select()
            .single();

          if (updateError) {
            throw new Error(`Failed to update material: ${updateError.message}`);
          }

          // Add to price history
          await supabase.from("material_price_history").insert({
            material_id: existingMaterial.id,
            vendor_id,
            product_code: item.product_code || null,
            purchase_date: receipt_date,
            quantity: item.quantity,
            unit_price: item.unit_price,
            purchase_order_id: purchase_order_id || null,
            company_id: profile.company_id,
          });

          results.updated.push(updated as MaterialRow);
        } else {
          // Create new material
          const category = item.category || inferCategory(item.description);

          const { data: newMaterial, error: createError } = await supabase
            .from("materials")
            .insert({
              company_id: profile.company_id,
              name: cleanDescription(item.description),
              category,
              unit: item.unit || "each",
              unit_cost: item.unit_price,
              quantity_in_stock: 0,
              minimum_stock_level: 0,
              supplier_id: vendor_id,
              vendor_product_code: item.product_code || null,
              last_purchase_price: item.unit_price,
              last_purchase_date: receipt_date,
              average_price: item.unit_price,
            })
            .select()
            .single();

          if (createError) {
            throw new Error(`Failed to create material: ${createError.message}`);
          }

          // Add to price history
          await supabase.from("material_price_history").insert({
            material_id: newMaterial.id,
            vendor_id,
            product_code: item.product_code || null,
            purchase_date: receipt_date,
            quantity: item.quantity,
            unit_price: item.unit_price,
            purchase_order_id: purchase_order_id || null,
            company_id: profile.company_id,
          });

          results.created.push(newMaterial as MaterialRow);
        }
      } catch (error) {
        console.error(`Error processing material: ${item.description}`, error);
        results.errors.push({
          item: item.description,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return NextResponse.json({
      success: true,
      summary: {
        created: results.created.length,
        updated: results.updated.length,
        errors: results.errors.length,
      },
      results,
    });
  } catch (error) {
    console.error("Materials import error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to import materials" },
      { status: 500 }
    );
  }
}

/**
 * Calculate new weighted average price
 */
function calculateNewAverage(
  currentAvg: number,
  currentCount: number,
  newPrice: number
): number {
  if (!currentAvg || currentCount === 0) return newPrice;

  const total = currentAvg * currentCount + newPrice;
  return Math.round((total / (currentCount + 1)) * 100) / 100;
}

/**
 * Get total purchases count (estimate from price history or default to 1)
 */
function getTotalPurchases(material: MaterialRow): number {
  // This is a simplified version - ideally we'd count from price_history
  return material.average_price && material.last_purchase_price
    ? Math.max(1, Math.round(material.unit_cost / Math.abs(material.average_price - material.unit_cost) || 1))
    : 1;
}

/**
 * Infer material category from description
 */
function inferCategory(description: string): MaterialCategory {
  const desc = description.toLowerCase();

  if (desc.includes("pvc") || desc.includes("pipe") || desc.includes("fitting") || desc.includes("conduit")) {
    return "plumbing";
  }
  if (desc.includes("nail") || desc.includes("screw") || desc.includes("bolt") || desc.includes("fastener")) {
    return "hardware";
  }
  if (desc.includes("lumber") || desc.includes("wood") || desc.includes("plywood") || desc.includes("pt ") || desc.includes("2x4") || desc.includes("2x6")) {
    return "lumber";
  }
  if (desc.includes("cement") || desc.includes("concrete") || desc.includes("block") || desc.includes("mortar")) {
    return "concrete";
  }
  if (desc.includes("wire") || desc.includes("outlet") || desc.includes("breaker") || desc.includes("electric")) {
    return "electrical";
  }
  if (desc.includes("roof") || desc.includes("shingle") || desc.includes("tar")) {
    return "roofing";
  }
  if (desc.includes("paint") || desc.includes("drywall") || desc.includes("trim") || desc.includes("primer") || desc.includes("stain")) {
    return "finishing";
  }
  if (desc.includes("tool") || desc.includes("drill") || desc.includes("saw") || desc.includes("hammer")) {
    return "tools";
  }
  if (desc.includes("glove") || desc.includes("safety") || desc.includes("helmet") || desc.includes("goggle")) {
    return "safety";
  }
  if (desc.includes("steel") || desc.includes("rebar") || desc.includes("metal")) {
    return "steel";
  }

  return "other";
}

/**
 * Clean up description text
 */
function cleanDescription(desc: string): string {
  return desc
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}
