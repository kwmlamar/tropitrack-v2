import { SupabaseClient } from "@supabase/supabase-js";

export class MaterialTools {
  constructor(private supabase: SupabaseClient, private companyId: string, private userId: string) {}

  async listMaterials(params: any) {
    let query = this.supabase.from("materials").select("*").eq("company_id", this.companyId);
    if (params.category) query = query.eq("category", params.category);
    if (params.low_stock_only) query = query.filter("quantity_in_stock", "lte", "minimum_stock_level");
    if (params.vendor_id) query = query.eq("supplier_id", params.vendor_id);
    const { data, error } = await query.order("name");
    if (error) return { success: false, error: error.message };
    return { success: true, materials: data, count: data?.length || 0 };
  }

  async createPurchaseOrder(params: any) {
    const subtotal = params.items.reduce((sum: number, item: any) => sum + (item.quantity * item.unit_price), 0);
    const { data: po, error } = await this.supabase.from("purchase_orders").insert({
      company_id: this.companyId,
      created_by: this.userId,
      po_number: `PO-${Date.now()}`,
      vendor_id: params.vendor_id,
      project_id: params.project_id,
      status: "draft",
      order_date: params.order_date || new Date().toISOString().split("T")[0],
      expected_delivery_date: params.expected_delivery_date,
      subtotal,
      tax_amount: 0,
      shipping_cost: 0,
      total_amount: subtotal,
      notes: params.notes,
    }).select().single();

    if (error) return { success: false, error: error.message };

    const items = params.items.map((item: any) => ({
      purchase_order_id: po.id,
      material_id: item.material_id,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total_price: item.quantity * item.unit_price,
      quantity_received: 0,
    }));

    await this.supabase.from("purchase_order_items").insert(items);
    return { success: true, purchase_order: po, message: `PO ${po.po_number} created for BSD $${subtotal.toFixed(2)}` };
  }

  async allocateMaterialsToProject(params: any) {
    const allocations = params.allocations.map((alloc: any) => ({
      company_id: this.companyId,
      project_id: params.project_id,
      material_id: alloc.material_id,
      quantity: alloc.quantity,
      allocated_date: params.allocation_date || new Date().toISOString().split("T")[0],
      allocated_by: this.userId,
      notes: alloc.notes,
    }));

    const { error } = await this.supabase.from("material_allocations").insert(allocations);
    if (error) return { success: false, error: error.message };
    return { success: true, message: `Allocated ${allocations.length} materials to project` };
  }
}
