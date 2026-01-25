import { SupabaseClient } from "@supabase/supabase-js";

export class EstimateTools {
  constructor(private supabase: SupabaseClient, private companyId: string, private userId: string) {}

  async listEstimates(params: any) {
    let query = this.supabase.from("estimates").select("*").eq("company_id", this.companyId);
    if (params.status && params.status !== "all") query = query.eq("status", params.status);
    if (params.client_id) query = query.eq("client_id", params.client_id);
    const { data, error} = await query.order("created_at", { ascending: false });
    if (error) return { success: false, error: error.message };
    return { success: true, estimates: data, count: data?.length || 0 };
  }

  async createEstimate(params: any) {
    const subtotal = params.line_items.reduce((sum: number, item: any) => sum + (item.quantity * item.unit_rate), 0);
    const overheadAmount = subtotal * ((params.overhead_markup_percent || 15) / 100);
    const subtotalWithOverhead = subtotal + overheadAmount;
    const profitAmount = subtotalWithOverhead * ((params.profit_margin_percent || 10) / 100);
    const taxAmount = (subtotalWithOverhead + profitAmount) * (params.tax_rate || 0.10);
    const totalAmount = subtotalWithOverhead + profitAmount + taxAmount;

    const { data, error } = await this.supabase.from("estimates").insert({
      company_id: this.companyId,
      created_by: this.userId,
      estimate_number: `EST-${Date.now()}`,
      ...params,
      subtotal,
      overhead_amount: overheadAmount,
      profit_amount: profitAmount,
      tax_amount: taxAmount,
      total_amount: totalAmount,
      status: "draft",
    }).select().single();

    if (error) return { success: false, error: error.message };
    return { success: true, estimate: data, message: `Estimate created for BSD $${totalAmount.toFixed(2)}` };
  }

  async convertEstimateToProject(params: any) {
    const { data: estimate } = await this.supabase.from("estimates").select("*").eq("id", params.estimate_id).single();
    if (!estimate) return { success: false, error: "Estimate not found" };

    const { data: project, error } = await this.supabase.from("projects").insert({
      company_id: this.companyId,
      created_by: this.userId,
      name: estimate.title,
      description: estimate.description,
      client_id: estimate.client_id,
      client_name: estimate.client_name,
      location: estimate.client_address || "Bahamas",
      status: "planning",
      start_date: params.project_start_date,
      budget: estimate.total_amount,
      contract_value: estimate.total_amount,
      project_manager_id: params.project_manager_id,
    }).select().single();

    if (error) return { success: false, error: error.message };

    await this.supabase.from("estimates").update({ status: "converted", converted_at: new Date().toISOString() }).eq("id", params.estimate_id);

    return { success: true, project, message: `Estimate converted to project "${project.name}"` };
  }

  async sendEstimate(params: any) {
    const { error } = await this.supabase.from("estimates").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", params.estimate_id);
    if (error) return { success: false, error: error.message };
    return { success: true, message: "Estimate marked as sent" };
  }
}
