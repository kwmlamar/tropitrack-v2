// Supabase Edge Function: Send Estimate via Email
// Uses Resend API to send estimate emails with PDF attachment

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

interface SendEstimateRequest {
  estimate_id: string;
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

    const { estimate_id, to_email, subject, message, pdf_base64 }: SendEstimateRequest =
      await req.json();

    if (!estimate_id || !to_email) {
      throw new Error("estimate_id and to_email are required");
    }

    // Fetch estimate details
    const { data: estimate, error: fetchError } = await supabase
      .from("estimates")
      .select("*")
      .eq("id", estimate_id)
      .single();

    if (fetchError || !estimate) {
      throw new Error("Estimate not found");
    }

    // Build email content
    const emailSubject = subject || `Estimate ${estimate.estimate_number} from TropiTech Solutions`;
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
            .footer { text-align: center; padding: 20px; color: #718096; font-size: 12px; }
            .button { display: inline-block; background: #3182ce; color: white; padding: 12px 24px;
                      text-decoration: none; border-radius: 6px; margin-top: 16px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin:0;">TropiTech Solutions</h1>
              <p style="margin:5px 0 0;">Construction Management Services</p>
            </div>
            <div class="content">
              <h2>Estimate ${estimate.estimate_number}</h2>
              <p>Dear ${estimate.client_name},</p>
              ${message ? `<p>${message}</p>` : `<p>Please find attached your estimate for the following project:</p>`}

              <div style="background: white; padding: 16px; border-radius: 8px; margin: 16px 0;">
                <h3 style="margin-top: 0;">${estimate.title}</h3>
                ${estimate.description ? `<p style="color: #718096;">${estimate.description}</p>` : ""}
                <p class="amount">Total: BSD ${Number(estimate.total_amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
                <p style="color: #718096;">Valid until: ${new Date(estimate.valid_until).toLocaleDateString()}</p>
              </div>

              <p>The detailed estimate is attached as a PDF document.</p>

              <p style="color: #718096; font-size: 14px;">
                If you have any questions, please don't hesitate to contact us.
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
      from: "TropiTech Solutions <estimates@tropitech.bs>",
      to: [to_email],
      subject: emailSubject,
      html: emailHtml,
    };

    // Add PDF attachment if provided
    if (pdf_base64) {
      emailData.attachments = [
        {
          filename: `Estimate-${estimate.estimate_number}.pdf`,
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

    // Update estimate status to 'sent'
    const { error: updateError } = await supabase
      .from("estimates")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
      })
      .eq("id", estimate_id);

    if (updateError) {
      console.error("Failed to update estimate status:", updateError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Estimate sent to ${to_email}`,
        email_id: resendResult.id,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("Error sending estimate:", error);
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
