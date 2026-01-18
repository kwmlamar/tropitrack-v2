// Supabase Edge Function: Send Invoice via Email
// Uses Resend API to send invoice emails with PDF attachment

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

interface SendInvoiceRequest {
  invoice_id: string;
  to_email: string;
  subject?: string;
  message?: string;
  pdf_base64?: string;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase environment variables not configured");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { invoice_id, to_email, subject, message, pdf_base64 }: SendInvoiceRequest =
      await req.json();

    if (!invoice_id || !to_email) {
      throw new Error("invoice_id and to_email are required");
    }

    // Fetch invoice details
    const { data: invoice, error: fetchError } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", invoice_id)
      .single();

    if (fetchError || !invoice) {
      throw new Error("Invoice not found");
    }

    // Build email content
    const emailSubject = subject || `Invoice ${invoice.invoice_number} from TropiTech Solutions`;
    const dueDate = new Date(invoice.due_date);
    const isOverdue = dueDate < new Date() && invoice.balance_due > 0;

    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #1a365d; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
            .content { background: #f7fafc; padding: 20px; border-radius: 0 0 8px 8px; }
            .amount { font-size: 24px; font-weight: bold; color: #1a365d; }
            .balance { font-size: 20px; font-weight: bold; color: ${isOverdue ? "#e53e3e" : "#dd6b20"}; }
            .footer { text-align: center; padding: 20px; color: #718096; font-size: 12px; }
            .overdue { background: #fed7d7; color: #c53030; padding: 12px; border-radius: 6px; margin-bottom: 16px; }
            .payment-box { background: #ebf8ff; padding: 16px; border-radius: 8px; margin: 16px 0;
                          border-left: 4px solid #3182ce; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin:0;">TropiTech Solutions</h1>
              <p style="margin:5px 0 0;">Construction Management Services</p>
            </div>
            <div class="content">
              <h2>Invoice ${invoice.invoice_number}</h2>

              ${isOverdue ? `<div class="overdue"><strong>OVERDUE:</strong> This invoice was due on ${dueDate.toLocaleDateString()}</div>` : ""}

              <p>Dear ${invoice.client_name},</p>
              ${message ? `<p>${message}</p>` : `<p>Please find attached your invoice for services rendered:</p>`}

              <div style="background: white; padding: 16px; border-radius: 8px; margin: 16px 0;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                  <span>Invoice Date:</span>
                  <span>${new Date(invoice.issue_date).toLocaleDateString()}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                  <span>Due Date:</span>
                  <span style="${isOverdue ? "color: #e53e3e; font-weight: bold;" : ""}">${dueDate.toLocaleDateString()}</span>
                </div>
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 12px 0;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                  <span>Total Amount:</span>
                  <span class="amount">BSD ${Number(invoice.total_amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                </div>
                ${invoice.amount_paid > 0 ? `
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px; color: #38a169;">
                  <span>Amount Paid:</span>
                  <span>-BSD ${Number(invoice.amount_paid).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                </div>
                ` : ""}
                <div style="display: flex; justify-content: space-between;">
                  <span><strong>Balance Due:</strong></span>
                  <span class="balance">BSD ${Number(invoice.balance_due).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                </div>
              </div>

              ${invoice.balance_due > 0 ? `
              <div class="payment-box">
                <h4 style="margin-top: 0;">Payment Instructions</h4>
                <p style="margin: 0; font-size: 14px;">
                  Please make payment to:<br>
                  <strong>Bank:</strong> First Caribbean International Bank<br>
                  <strong>Account Name:</strong> TropiTech Solutions<br>
                  <strong>Account Number:</strong> XXXX-XXXX-XXXX<br>
                  <strong>Reference:</strong> ${invoice.invoice_number}
                </p>
              </div>
              ` : `
              <div style="background: #f0fff4; padding: 16px; border-radius: 8px; color: #276749; text-align: center;">
                <strong>PAID IN FULL</strong> - Thank you for your payment!
              </div>
              `}

              <p>The detailed invoice is attached as a PDF document.</p>

              <p style="color: #718096; font-size: 14px;">
                If you have any questions about this invoice, please don't hesitate to contact us.
              </p>
            </div>
            <div class="footer">
              <p>TropiTech Solutions | Nassau, Bahamas</p>
              <p>info@tropitech.bs | (242) 555-1234</p>
            </div>
          </div>
        </body>
      </html>
    `;

    // Prepare email data
    const emailData: {
      from: string;
      to: string[];
      subject: string;
      html: string;
      attachments?: { filename: string; content: string }[];
    } = {
      from: "TropiTech Solutions <invoices@tropitech.bs>",
      to: [to_email],
      subject: emailSubject,
      html: emailHtml,
    };

    // Add PDF attachment if provided
    if (pdf_base64) {
      emailData.attachments = [
        {
          filename: `Invoice-${invoice.invoice_number}.pdf`,
          content: pdf_base64,
        },
      ];
    }

    // Send email via Resend
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify(emailData),
    });

    const resendResult = await resendResponse.json();

    if (!resendResponse.ok) {
      throw new Error(resendResult.message || "Failed to send email");
    }

    // Update invoice status to 'sent' if it was draft
    if (invoice.status === "draft") {
      const { error: updateError } = await supabase
        .from("invoices")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
        })
        .eq("id", invoice_id);

      if (updateError) {
        console.error("Failed to update invoice status:", updateError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Invoice sent to ${to_email}`,
        email_id: resendResult.id,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("Error sending invoice:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
