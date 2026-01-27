import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { EnhancedParsedReceipt, EnhancedParsedLineItem } from "@/types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface CreatePOFromReceiptRequest {
  receipt: EnhancedParsedReceipt;
  vendor_id: string;
  project_id?: string;
  receipt_image_path?: string;
  discount_amount?: number;
  discount_label?: string;
  line_items: Array<{
    product_code?: string;
    description: string;
    quantity: number;
    unit_price: number;
    total: number;
    material_id?: string;
    create_material?: boolean;
    material_category?: string;
    material_unit?: string;
  }>;
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

    // Get user's profile
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

    const body: CreatePOFromReceiptRequest = await request.json();
    const { receipt, vendor_id, project_id, receipt_image_path, discount_amount, discount_label, line_items } = body;

    if (!vendor_id) {
      return NextResponse.json(
        { error: "Vendor ID is required" },
        { status: 400 }
      );
    }

    // Generate PO number
    const poNumber = `PO-${Date.now().toString().slice(-8)}`;

    // Calculate subtotal after discount
    const subtotalBeforeDiscount = receipt.totals.subtotal;
    const discountAmt = discount_amount || receipt.totals.discount || 0;
    const subtotalAfterDiscount = subtotalBeforeDiscount - discountAmt;

    // Create purchase order
    const { data: purchaseOrder, error: poError } = await supabase
      .from("purchase_orders")
      .insert({
        po_number: poNumber,
        vendor_id,
        project_id: project_id || null,
        status: "received", // Already purchased from receipt
        order_date: receipt.invoice.date,
        actual_delivery_date: receipt.invoice.date,
        subtotal: subtotalAfterDiscount, // Use subtotal after discount for the main subtotal field
        tax_amount: receipt.totals.vat_amount,
        total_amount: receipt.totals.total,
        // Discount fields
        discount_amount: discountAmt,
        discount_label: discount_label || receipt.totals.discount_label || null,
        subtotal_before_discount: subtotalBeforeDiscount,
        subtotal_after_discount: subtotalAfterDiscount,
        notes: generatePONotes(receipt, discountAmt, discount_label),
        receipt_image_path: receipt_image_path || null,
        ocr_raw_text: receipt.raw_text,
        vendor_invoice_number: receipt.invoice.number || null,
        company_id: profile.company_id,
        created_by: profile.id,
      })
      .select()
      .single();

    if (poError) {
      console.error("Error creating purchase order:", poError);
      return NextResponse.json(
        { error: `Failed to create purchase order: ${poError.message}` },
        { status: 500 }
      );
    }

    // Process line items
    const createdItems = [];
    const priceHistoryRecords = [];

    for (const item of line_items) {
      let materialId = item.material_id;

      // Create new material if requested
      if (item.create_material && !materialId) {
        const { data: newMaterial, error: materialError } = await supabase
          .from("materials")
          .insert({
            name: item.description,
            category: item.material_category || "other",
            unit: item.material_unit || "each",
            unit_cost: item.unit_price,
            quantity_in_stock: 0,
            minimum_stock_level: 0,
            supplier_id: vendor_id,
            vendor_product_code: item.product_code || null,
            last_purchase_price: item.unit_price,
            last_purchase_date: receipt.invoice.date,
            average_price: item.unit_price,
            company_id: profile.company_id,
          })
          .select()
          .single();

        if (!materialError && newMaterial) {
          materialId = newMaterial.id;
        }
      }

      // Create purchase order item
      const { data: poItem, error: poItemError } = await supabase
        .from("purchase_order_items")
        .insert({
          purchase_order_id: purchaseOrder.id,
          material_id: materialId || null,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.total,
          quantity_received: item.quantity, // Already received
          product_code: item.product_code || null,
          unit: item.material_unit || "each",
        })
        .select()
        .single();

      if (!poItemError && poItem) {
        createdItems.push(poItem);

        // Add price history record if material exists
        if (materialId) {
          priceHistoryRecords.push({
            material_id: materialId,
            vendor_id,
            product_code: item.product_code || null,
            purchase_date: receipt.invoice.date,
            quantity: item.quantity,
            unit_price: item.unit_price,
            purchase_order_id: purchaseOrder.id,
            company_id: profile.company_id,
          });
        }
      }
    }

    // Insert price history records
    if (priceHistoryRecords.length > 0) {
      await supabase.from("material_price_history").insert(priceHistoryRecords);
    }

    return NextResponse.json({
      success: true,
      purchase_order: purchaseOrder,
      items: createdItems,
      price_history_count: priceHistoryRecords.length,
    });
  } catch (error) {
    console.error("Create PO from receipt error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create purchase order" },
      { status: 500 }
    );
  }
}

/**
 * Generate notes from parsed receipt data
 */
function generatePONotes(
  receipt: EnhancedParsedReceipt,
  discountAmount?: number,
  discountLabel?: string
): string {
  const parts: string[] = [];

  if (receipt.invoice.number) {
    parts.push(`Vendor Invoice: ${receipt.invoice.number}`);
  }

  if (receipt.invoice.cashier) {
    parts.push(`Cashier: ${receipt.invoice.cashier}`);
  }

  if (receipt.invoice.time) {
    parts.push(`Time: ${receipt.invoice.time}`);
  }

  if (receipt.customer?.name) {
    parts.push(`Customer: ${receipt.customer.name}`);
  }

  if (receipt.customer?.account_number) {
    parts.push(`Account: ${receipt.customer.account_number}`);
  }

  if (receipt.account_balance?.new_outstanding) {
    parts.push(`Outstanding Balance: $${receipt.account_balance.new_outstanding.toFixed(2)}`);
  }

  parts.push(`\nItems:`);
  for (const item of receipt.line_items) {
    const itemLine = item.product_code
      ? `- [${item.product_code}] ${item.description}: ${item.quantity} @ $${item.unit_price.toFixed(2)} = $${item.total.toFixed(2)}`
      : `- ${item.description}: ${item.quantity} @ $${item.unit_price.toFixed(2)} = $${item.total.toFixed(2)}`;
    parts.push(itemLine);
  }

  // Add discount info
  const discount = discountAmount || receipt.totals.discount || 0;
  if (discount > 0) {
    const label = discountLabel || receipt.totals.discount_label || "Discount";
    parts.push(`\n${label}: -$${discount.toFixed(2)}`);
  }

  parts.push(`\nParsed with ${receipt.parsing_method} method (${Math.round(receipt.confidence * 100)}% confidence)`);

  return parts.join("\n");
}
