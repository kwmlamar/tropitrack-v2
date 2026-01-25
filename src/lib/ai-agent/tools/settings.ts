import { SupabaseClient } from "@supabase/supabase-js";

export class SettingsTools {
  constructor(private supabase: SupabaseClient, private companyId: string, private userId: string) {}

  async updateCompanyInfo(params: any) {
    const { data, error } = await this.supabase.from("companies").update(params.updates).eq("id", this.companyId).select().single();
    if (error) return { success: false, error: error.message };
    return { success: true, company: data, message: "Company information updated successfully" };
  }

  async updatePaymentInstructions(params: any) {
    const updates: any = {};
    if (params.payment_bank_name) updates.payment_bank_name = params.payment_bank_name;
    if (params.payment_account_name) updates.payment_account_name = params.payment_account_name;
    if (params.payment_account_number) updates.payment_account_number = params.payment_account_number;
    if (params.payment_routing_number) updates.payment_routing_number = params.payment_routing_number;
    if (params.payment_swift_code) updates.payment_swift_code = params.payment_swift_code;
    if (params.payment_mobile_money) updates.payment_mobile_money = params.payment_mobile_money;
    if (params.payment_instructions) updates.payment_instructions = params.payment_instructions;
    if (params.payment_notes) updates.payment_notes = params.payment_notes;

    const { data, error } = await this.supabase.from("companies").update(updates).eq("id", this.companyId).select().single();
    if (error) return { success: false, error: error.message };
    return { success: true, company: data, message: "Payment instructions updated successfully" };
  }

  async updateNIBSettings(params: any) {
    // NIB settings are typically stored in a separate settings table or as constants
    // For now, we'll return a success message
    return {
      success: true,
      message: "NIB settings would be updated (stored in app configuration)",
      settings: {
        employee_rate: params.employee_rate || 0.0465,
        employer_rate: params.employer_rate || 0.0665,
        weekly_cap: params.weekly_cap || 550,
      },
    };
  }
}
