import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface InvitationEmailRequest {
  invitation_id: string;
  email: string;
  role: string;
  token: string;
  company_name: string;
  inviter_name: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("Invitation email function called");
    
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      }
    );

    // Get request body
    const requestBody = await req.json();
    console.log("Request body received:", { 
      hasInvitationId: !!requestBody.invitation_id,
      email: requestBody.email,
      role: requestBody.role,
      hasToken: !!requestBody.token,
      company_name: requestBody.company_name 
    });
    
    const {
      invitation_id,
      email,
      role,
      token,
      company_name,
      inviter_name,
    }: InvitationEmailRequest = requestBody;

    // Validate required fields
    if (!email || !role || !token || !company_name) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Generate invitation URL
    const appUrl = Deno.env.get("APP_URL") || "https://tropitrack-v2.vercel.app";
    const inviteUrl = `${appUrl}/signup?invite=${token}`;

    // Email configuration (using Resend)
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    console.log("Resend API key check:", { hasKey: !!resendApiKey, keyLength: resendApiKey?.length || 0 });

    if (!resendApiKey) {
      console.error("RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Email service not configured - RESEND_API_KEY is missing" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Email HTML template
    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Invitation to join ${company_name}</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              padding: 30px;
              border-radius: 10px 10px 0 0;
              text-align: center;
            }
            .header h1 {
              margin: 0;
              font-size: 28px;
            }
            .content {
              background: #f9fafb;
              padding: 40px 30px;
              border-radius: 0 0 10px 10px;
            }
            .content p {
              margin: 0 0 20px 0;
              font-size: 16px;
            }
            .button {
              display: inline-block;
              background: #667eea;
              color: white;
              padding: 14px 32px;
              text-decoration: none;
              border-radius: 8px;
              font-weight: 600;
              margin: 20px 0;
              font-size: 16px;
            }
            .button:hover {
              background: #5568d3;
            }
            .role-badge {
              display: inline-block;
              background: #e0e7ff;
              color: #4338ca;
              padding: 6px 12px;
              border-radius: 6px;
              font-weight: 600;
              font-size: 14px;
              text-transform: capitalize;
            }
            .info-box {
              background: white;
              border-left: 4px solid #667eea;
              padding: 16px;
              margin: 20px 0;
              border-radius: 4px;
            }
            .footer {
              text-align: center;
              color: #6b7280;
              font-size: 14px;
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #e5e7eb;
            }
            .footer a {
              color: #667eea;
              text-decoration: none;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>🎉 You're Invited!</h1>
          </div>
          <div class="content">
            <p>Hi there,</p>
            <p>
              <strong>${inviter_name}</strong> has invited you to join
              <strong>${company_name}</strong> on TropiTrack as an
              <span class="role-badge">${role}</span>
            </p>

            <div class="info-box">
              <strong>📋 What is TropiTrack?</strong><br>
              TropiTrack helps construction companies manage projects, track time, handle payroll,
              and generate invoices efficiently. Everything you need to run your construction business
              in one place.
            </div>

            <p>Click the button below to accept your invitation and create your account:</p>

            <div style="text-align: center;">
              <a href="${inviteUrl}" class="button">Accept Invitation</a>
            </div>

            <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
              <strong>⏰ This invitation will expire in 7 days.</strong><br>
              If you didn't expect this invitation, you can safely ignore this email.
            </p>

            <p style="font-size: 14px; color: #6b7280;">
              If the button doesn't work, copy and paste this link into your browser:<br>
              <a href="${inviteUrl}" style="color: #667eea; word-break: break-all;">${inviteUrl}</a>
            </p>
          </div>
          <div class="footer">
            <p>
              © ${new Date().getFullYear()} TropiTrack. All rights reserved.<br>
              <a href="${appUrl}">Visit TropiTrack</a>
            </p>
          </div>
        </body>
      </html>
    `;

    // Plain text version
    const emailText = `
You've been invited to join ${company_name} on TropiTrack

Hi there,

${inviter_name} has invited you to join ${company_name} on TropiTrack as an ${role}.

TropiTrack helps construction companies manage projects, track time, and handle payroll efficiently.

Accept your invitation:
${inviteUrl}

This invitation will expire in 7 days.

If you didn't expect this invitation, you can safely ignore this email.

---
© ${new Date().getFullYear()} TropiTrack
    `.trim();

    // Send email via Resend
    const resendPayload = {
      from: "TropiTrack <invitations@tropitrack.com>",
      to: [email],
      subject: `You've been invited to join ${company_name} on TropiTrack`,
      html: emailHtml,
      text: emailText,
    };
    
    console.log("Sending email via Resend:", { 
      to: email, 
      from: resendPayload.from,
      subject: resendPayload.subject,
      hasHtml: !!emailHtml,
      hasText: !!emailText 
    });
    
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify(resendPayload),
    });

    console.log("Resend API response:", { 
      status: resendResponse.status, 
      ok: resendResponse.ok,
      statusText: resendResponse.statusText 
    });

    if (!resendResponse.ok) {
      const errorData = await resendResponse.text();
      console.error("Resend API error:", errorData);
      throw new Error(`Failed to send email: ${errorData}`);
    }

    const resendData = await resendResponse.json();
    console.log("Resend success:", { emailId: resendData.id, email: resendData });

    // Update invitation record to track email sent
    if (invitation_id) {
      await supabaseClient
        .from("invitations")
        .update({
          updated_at: new Date().toISOString()
        })
        .eq("id", invitation_id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Invitation email sent successfully",
        email_id: resendData.id,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error sending invitation email:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
