import { SupabaseClient } from "@supabase/supabase-js";

export class InvoiceTools {
  constructor(private supabase: SupabaseClient, private companyId: string, private userId: string) {}

  async listInvoices(params: any) {
    let query = this.supabase.from("invoices").select("*").eq("company_id", this.companyId);
    if (params.status && params.status !== "all") query = query.eq("status", params.status);
    if (params.client_id) query = query.eq("client_id", params.client_id);
    if (params.project_id) query = query.eq("project_id", params.project_id);
    if (params.start_date) query = query.gte("issue_date", params.start_date);
    if (params.end_date) query = query.lte("issue_date", params.end_date);

    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) return { success: false, error: error.message };

    const total = data?.reduce((sum, inv) => sum + (inv.total_amount || 0), 0) || 0;
    return { success: true, invoices: data, count: data?.length || 0, total_amount: `BSD $${total.toFixed(2)}` };
  }

  async getInvoiceDetails(params: any) {
    const { data, error } = await this.supabase
      .from("invoices")
      .select("*, invoice_line_items(*), payments(*)")
      .eq("id", params.invoice_id)
      .eq("company_id", this.companyId)
      .single();

    if (error) return { success: false, error: "Invoice not found" };
    return { success: true, invoice: data };
  }

  async createInvoice(params: any) {
    // Calculate totals
    const subtotal = params.line_items.reduce((sum: number, item: any) => sum + (item.quantity * item.unit_rate), 0);
    const taxAmount = subtotal * (params.tax_rate || 0.10);
    const totalAmount = subtotal + taxAmount;

    const { data: invoice, error: invoiceError } = await this.supabase
      .from("invoices")
      .insert({
        company_id: this.companyId,
        created_by: this.userId,
        invoice_number: `INV-${Date.now()}`, // Generate invoice number
        client_id: params.client_id,
        project_id: params.project_id,
        client_name: params.client_name,
        client_email: params.client_email,
        client_phone: params.client_phone,
        client_address: params.client_address,
        invoice_type: params.invoice_type,
        status: "draft",
        issue_date: params.issue_date,
        due_date: params.due_date,
        subtotal,
        tax_rate: params.tax_rate || 0.10,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        amount_paid: 0,
        balance_due: totalAmount,
        notes: params.notes,
        terms: params.terms,
      })
      .select()
      .single();

    if (invoiceError) return { success: false, error: invoiceError.message };

    // Create line items
    const lineItems = params.line_items.map((item: any, index: number) => ({
      invoice_id: invoice.id,
      category: item.category || "other",
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unit_rate: item.unit_rate,
      amount: item.quantity * item.unit_rate,
      order_index: index,
    }));

    const { error: lineItemsError } = await this.supabase.from("invoice_line_items").insert(lineItems);

    if (lineItemsError) return { success: false, error: lineItemsError.message };

    return {
      success: true,
      invoice,
      message: `Invoice ${invoice.invoice_number} created for BSD $${totalAmount.toFixed(2)}`,
    };
  }

  async updateInvoice(params: any) {
    const { data, error } = await this.supabase
      .from("invoices")
      .update(params.updates)
      .eq("id", params.invoice_id)
      .eq("company_id", this.companyId)
      .select()
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, invoice: data, message: "Invoice updated successfully" };
  }

  async markInvoicePaid(params: any) {
    const { data: invoice } = await this.supabase
      .from("invoices")
      .select("balance_due")
      .eq("id", params.invoice_id)
      .single();

    if (!invoice) return { success: false, error: "Invoice not found" };

    const { error: paymentError } = await this.supabase.from("payments").insert({
      invoice_id: params.invoice_id,
      payment_date: params.payment_date,
      amount: invoice.balance_due,
      payment_method: params.payment_method,
      reference_number: params.reference_number,
      notes: params.notes,
      received_by: this.userId,
    });

    if (paymentError) return { success: false, error: paymentError.message };

    const { error: updateError } = await this.supabase
      .from("invoices")
      .update({
        amount_paid: invoice.balance_due,
        balance_due: 0,
        status: "paid",
        paid_at: params.payment_date,
      })
      .eq("id", params.invoice_id);

    if (updateError) return { success: false, error: updateError.message };

    return { success: true, message: `Invoice marked as paid: BSD $${invoice.balance_due.toFixed(2)}` };
  }

  async sendInvoice(params: any) {
    const { error } = await this.supabase
      .from("invoices")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", params.invoice_id)
      .eq("company_id", this.companyId);

    if (error) return { success: false, error: error.message };
    return { success: true, message: "Invoice marked as sent (email integration pending)" };
  }

  async generateInvoicePDF(params: any) {
    return {
      success: true,
      pdf_url: `/invoices/${params.invoice_id}/preview`,
      message: "Invoice PDF URL generated",
    };
  }
}
