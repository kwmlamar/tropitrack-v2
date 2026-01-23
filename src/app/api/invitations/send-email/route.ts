import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const resendApiKey = process.env.RESEND_API_KEY;

interface SendInvitationEmailRequest {
  invitation_id: string;
  email: string;
  role: string;
  token: string;
  company_name: string;
  inviter_name: string;
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

    // Check if Resend API key is configured
    if (!resendApiKey) {
      return NextResponse.json(
        { error: "Email service not configured - RESEND_API_KEY is missing" },
        { status: 500 }
      );
    }

    const {
      invitation_id,
      email,
      role,
      token: inviteToken,
      company_name,
      inviter_name,
    }: SendInvitationEmailRequest = await request.json();

    // Validate required fields
    if (!email || !role || !inviteToken || !company_name) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Generate invitation URL
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://tropitrack-v2.vercel.app";
    const inviteUrl = `${appUrl}/signup?invite=${inviteToken}`;

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
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: "TropiTrack <onboarding@resend.dev>",
        to: [email],
        subject: `You've been invited to join ${company_name} on TropiTrack`,
        html: emailHtml,
        text: emailText,
      }),
    });

    if (!resendResponse.ok) {
      const errorData = await resendResponse.text();
      let errorMessage = `Failed to send email (${resendResponse.status})`;
      
      try {
        const errorJson = JSON.parse(errorData);
        errorMessage = errorJson.message || errorJson.error || errorMessage;
        console.error("Resend API error:", {
          status: resendResponse.status,
          statusText: resendResponse.statusText,
          error: errorJson,
        });
      } catch {
        console.error("Resend API error (raw):", errorData);
        errorMessage = errorData || errorMessage;
      }
      
      return NextResponse.json(
        { error: errorMessage },
        { status: 500 }
      );
    }

    const resendData = await resendResponse.json();

    // Update invitation record to track email sent
    if (invitation_id) {
      await supabase
        .from("invitations")
        .update({
          updated_at: new Date().toISOString()
        })
        .eq("id", invitation_id);
    }

    return NextResponse.json({
      success: true,
      message: "Invitation email sent successfully",
      email_id: resendData.id,
    });
  } catch (error: unknown) {
    console.error("Error sending invitation email:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
