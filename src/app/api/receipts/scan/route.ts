import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { parseReceiptEnhanced, getKnownVendors } from "@/lib/ocr/enhanced-receipt-parser";
import Tesseract from "tesseract.js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface VendorMatch {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  tin?: string;
  isNew: boolean;
  confidence: number;
}

interface MaterialMatch {
  id?: string;
  name: string;
  product_code?: string;
  isNew: boolean;
  possibleMatches?: Array<{
    id: string;
    name: string;
    similarity: number;
  }>;
}

interface VendorRow {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  tin: string | null;
}

interface MaterialRow {
  id: string;
  name: string;
  description: string | null;
  vendor_product_code: string | null;
}

export async function POST(request: NextRequest) {
  try {
    // Get auth token from request
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");

    // Create authenticated Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify the user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Get user's company_id
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", user.id)
      .single();

    if (!profile?.company_id) {
      return NextResponse.json(
        { error: "User not associated with a company" },
        { status: 400 }
      );
    }

    // Get form data
    const formData = await request.formData();
    const image = formData.get("image") as File | null;
    const ocrText = formData.get("ocr_text") as string | null;

    if (!image && !ocrText) {
      return NextResponse.json(
        { error: "No image or OCR text provided" },
        { status: 400 }
      );
    }

    let extractedText = ocrText;

    // If image provided and no OCR text, run OCR
    if (image && !extractedText) {
      const arrayBuffer = await image.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64Image = `data:${image.type};base64,${buffer.toString("base64")}`;

      // Run Tesseract OCR
      const { data: { text } } = await Tesseract.recognize(base64Image, "eng", {
        logger: () => {}, // Silence logger
      });

      extractedText = text;
    }

    if (!extractedText || !extractedText.trim()) {
      return NextResponse.json(
        { error: "Could not extract text from image" },
        { status: 400 }
      );
    }

    // Parse the receipt using AI-enhanced parser
    const parsedReceipt = await parseReceiptEnhanced(extractedText, true);

    // Match vendor against existing vendors in the company
    const vendorMatch = await matchVendor(
      supabase,
      parsedReceipt.vendor,
      profile.company_id
    );

    // Match line items against existing materials
    const materialMatches = await matchMaterials(
      supabase,
      parsedReceipt.line_items,
      vendorMatch.id,
      profile.company_id
    );

    return NextResponse.json({
      success: true,
      receipt: parsedReceipt,
      vendor: vendorMatch,
      materials: materialMatches,
      raw_text: extractedText,
    });
  } catch (error) {
    console.error("Receipt scan error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process receipt" },
      { status: 500 }
    );
  }
}

/**
 * Match parsed vendor against existing vendors or suggest creating new one
 */
async function matchVendor(
  supabase: SupabaseClient,
  parsedVendor: { name: string; address?: string; phone?: string; tin?: string },
  companyId: string
): Promise<VendorMatch> {
  // First try exact TIN match
  if (parsedVendor.tin) {
    const { data: tinMatch } = await supabase
      .from("vendors")
      .select("id, name, address, phone, tin")
      .eq("company_id", companyId)
      .eq("tin", parsedVendor.tin)
      .single();

    if (tinMatch) {
      const vendor = tinMatch as VendorRow;
      return {
        id: vendor.id,
        name: vendor.name,
        address: vendor.address || undefined,
        phone: vendor.phone || undefined,
        tin: vendor.tin || undefined,
        isNew: false,
        confidence: 1.0,
      };
    }
  }

  // Try exact name match
  const { data: nameMatch } = await supabase
    .from("vendors")
    .select("id, name, address, phone, tin")
    .eq("company_id", companyId)
    .ilike("name", parsedVendor.name)
    .single();

  if (nameMatch) {
    const vendor = nameMatch as VendorRow;
    return {
      id: vendor.id,
      name: vendor.name,
      address: vendor.address || undefined,
      phone: vendor.phone || undefined,
      tin: vendor.tin || undefined,
      isNew: false,
      confidence: 0.95,
    };
  }

  // Try fuzzy name match
  const { data: allVendors } = await supabase
    .from("vendors")
    .select("id, name, address, phone, tin")
    .eq("company_id", companyId)
    .eq("status", "active");

  if (allVendors && allVendors.length > 0) {
    const vendorNameLower = parsedVendor.name.toLowerCase();

    for (const row of allVendors) {
      const vendor = row as VendorRow;
      const existingNameLower = vendor.name.toLowerCase();

      // Check if names contain each other
      if (
        existingNameLower.includes(vendorNameLower) ||
        vendorNameLower.includes(existingNameLower)
      ) {
        return {
          id: vendor.id,
          name: vendor.name,
          address: vendor.address || undefined,
          phone: vendor.phone || undefined,
          tin: vendor.tin || undefined,
          isNew: false,
          confidence: 0.8,
        };
      }

      // Check for word overlap
      const parsedWords = vendorNameLower.split(/\s+/);
      const existingWords = existingNameLower.split(/\s+/);
      const overlap = parsedWords.filter((w: string) =>
        existingWords.some((ew: string) => ew.includes(w) || w.includes(ew))
      );

      if (overlap.length >= 2 || (overlap.length >= 1 && parsedWords.length <= 2)) {
        return {
          id: vendor.id,
          name: vendor.name,
          address: vendor.address || undefined,
          phone: vendor.phone || undefined,
          tin: vendor.tin || undefined,
          isNew: false,
          confidence: 0.7,
        };
      }
    }
  }

  // Check vendor directory for known vendors
  const knownVendors = getKnownVendors();
  const vendorNameLower = parsedVendor.name.toLowerCase();

  for (const known of knownVendors) {
    if (
      known.name.toLowerCase() === vendorNameLower ||
      known.patterns.some((p) => vendorNameLower.includes(p))
    ) {
      // Return known vendor info but mark as new (needs to be created for this company)
      return {
        id: "",
        name: known.name,
        address: known.address,
        phone: known.phone,
        tin: known.tin,
        isNew: true,
        confidence: 0.9,
      };
    }
  }

  // No match found - return parsed vendor as new
  return {
    id: "",
    name: parsedVendor.name,
    address: parsedVendor.address,
    phone: parsedVendor.phone,
    tin: parsedVendor.tin,
    isNew: true,
    confidence: 0.5,
  };
}

/**
 * Match line items against existing materials
 */
async function matchMaterials(
  supabase: SupabaseClient,
  lineItems: Array<{ product_code?: string; description: string; quantity: number; unit_price: number; total: number }>,
  vendorId: string | undefined,
  companyId: string
): Promise<MaterialMatch[]> {
  const matches: MaterialMatch[] = [];

  for (const item of lineItems) {
    // Try to match by product code + vendor
    if (item.product_code && vendorId) {
      const { data: codeMatch } = await supabase
        .from("materials")
        .select("id, name, vendor_product_code")
        .eq("company_id", companyId)
        .eq("supplier_id", vendorId)
        .eq("vendor_product_code", item.product_code)
        .single();

      if (codeMatch) {
        const material = codeMatch as MaterialRow;
        matches.push({
          id: material.id,
          name: material.name,
          product_code: item.product_code,
          isNew: false,
        });
        continue;
      }
    }

    // Try fuzzy description match
    const { data: allMaterials } = await supabase
      .from("materials")
      .select("id, name, description")
      .eq("company_id", companyId);

    const possibleMatches: Array<{ id: string; name: string; similarity: number }> = [];

    if (allMaterials && allMaterials.length > 0) {
      const itemDescLower = item.description.toLowerCase();
      const itemWords = itemDescLower.split(/\s+/);

      for (const row of allMaterials) {
        const material = row as MaterialRow;
        const materialNameLower = material.name.toLowerCase();
        const materialWords = materialNameLower.split(/\s+/);

        // Calculate word overlap similarity
        const overlap = itemWords.filter((w: string) =>
          materialWords.some((mw: string) => mw.includes(w) || w.includes(mw))
        );

        const similarity = overlap.length / Math.max(itemWords.length, materialWords.length);

        if (similarity > 0.3) {
          possibleMatches.push({
            id: material.id,
            name: material.name,
            similarity,
          });
        }
      }

      // Sort by similarity
      possibleMatches.sort((a, b) => b.similarity - a.similarity);
    }

    if (possibleMatches.length > 0 && possibleMatches[0].similarity > 0.7) {
      // High confidence match
      matches.push({
        id: possibleMatches[0].id,
        name: possibleMatches[0].name,
        product_code: item.product_code,
        isNew: false,
      });
    } else {
      // No good match - suggest creating new or show possible matches
      matches.push({
        name: item.description,
        product_code: item.product_code,
        isNew: true,
        possibleMatches: possibleMatches.slice(0, 3),
      });
    }
  }

  return matches;
}
