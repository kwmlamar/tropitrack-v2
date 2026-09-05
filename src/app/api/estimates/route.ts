import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type EstimateStatus = "draft" | "sent" | "approved" | "rejected" | "converted";
const VALID_STATUSES: EstimateStatus[] = ["draft", "sent", "approved", "rejected", "converted"];

interface UpsertEstimateRequest {
  estimate_number?: string;
  client_id: string;
  project_id?: string | null;
  title: string;
  total_amount?: number;
  issue_date?: string;
  status?: EstimateStatus;
  document_url?: string | null;
}

/** EST-<year>-### — the company's numbering convention going forward. The 4
 *  pre-existing rows use EST-000## from the old builder trigger; those are
 *  left as-is (see docs on the estimates register migration), this only
 *  governs numbers assigned to new rows. */
function nextEstimateNumber(existingNumbers: (string | null)[], year: number): string {
  const prefix = `EST-${year}-`;
  let maxSeq = 0;
  for (const number of existingNumbers) {
    const match = /^EST-\d{4}-(\d+)$/.exec(number ?? "");
    if (match) maxSeq = Math.max(maxSeq, parseInt(match[1], 10));
  }
  return `${prefix}${String(maxSeq + 1).padStart(3, "0")}`;
}

/**
 * POST /api/estimates
 *
 * Idempotent HEADER-only create-or-update for estimates, called by outside
 * Claude estimating skills (Wallace's, Omar's) once a quote is finalized.
 * TropiTrack is the register, not the builder: this endpoint only ever
 * touches estimate_number, client_id, project_id, title, total_amount,
 * issue_date, status, and document_url — it never creates estimate_sections
 * or estimate_line_items. Matches POST /api/projects's idempotency shape:
 * a second call for the same estimate_number updates the existing row
 * instead of inserting a duplicate.
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

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

    const body: UpsertEstimateRequest = await request.json();
    const { client_id, title } = body;

    if (!title?.trim()) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }
    if (!client_id) {
      return NextResponse.json({ error: "client_id is required" }, { status: 400 });
    }
    if (body.status && !VALID_STATUSES.includes(body.status)) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }
    if (body.status === "converted" && !body.project_id) {
      return NextResponse.json(
        { error: "project_id is required when status is 'converted'" },
        { status: 400 }
      );
    }

    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id, name")
      .eq("id", client_id)
      .eq("company_id", profile.company_id)
      .maybeSingle();
    if (clientError || !client) {
      return NextResponse.json(
        { error: "client_id does not match a client on this company" },
        { status: 400 }
      );
    }

    if (body.project_id) {
      const { data: project, error: projectError } = await supabase
        .from("projects")
        .select("id")
        .eq("id", body.project_id)
        .eq("company_id", profile.company_id)
        .maybeSingle();
      if (projectError || !project) {
        return NextResponse.json(
          { error: "project_id does not match a project on this company" },
          { status: 400 }
        );
      }
    }

    // Idempotency check: same company + estimate_number wins over inserting again.
    if (body.estimate_number?.trim()) {
      const { data: existing, error: existingError } = await supabase
        .from("estimates")
        .select("*")
        .eq("company_id", profile.company_id)
        .eq("estimate_number", body.estimate_number.trim())
        .maybeSingle();
      if (existingError) throw existingError;

      if (existing) {
        const updatePayload: Record<string, unknown> = {
          client_id,
          client_name: client.name,
          title: title.trim(),
          name: title.trim(),
        };
        if (body.project_id !== undefined) updatePayload.project_id = body.project_id;
        if (body.total_amount !== undefined) updatePayload.total_amount = body.total_amount;
        if (body.issue_date !== undefined) updatePayload.issue_date = body.issue_date;
        if (body.document_url !== undefined) updatePayload.document_url = body.document_url;
        if (body.status !== undefined) {
          updatePayload.status = body.status;
          if (body.status === "sent" && !existing.sent_at) updatePayload.sent_at = new Date().toISOString();
          if (body.status === "approved" && !existing.approved_at) updatePayload.approved_at = new Date().toISOString();
          if (body.status === "rejected" && !existing.rejected_at) updatePayload.rejected_at = new Date().toISOString();
          if (body.status === "converted" && !existing.converted_at) updatePayload.converted_at = new Date().toISOString();
        }

        const { data: updated, error: updateError } = await supabase
          .from("estimates")
          .update(updatePayload)
          .eq("id", existing.id)
          .select()
          .single();
        if (updateError) throw updateError;

        return NextResponse.json({ estimate: updated, created: false }, { status: 200 });
      }
    }

    const issueDate = body.issue_date ?? new Date().toISOString().slice(0, 10);
    let estimateNumber = body.estimate_number?.trim();
    if (!estimateNumber) {
      const year = new Date(issueDate).getFullYear();
      const { data: yearRows, error: yearError } = await supabase
        .from("estimates")
        .select("estimate_number")
        .eq("company_id", profile.company_id)
        .like("estimate_number", `EST-${year}-%`);
      if (yearError) throw yearError;
      estimateNumber = nextEstimateNumber(
        (yearRows ?? []).map((r) => (r as { estimate_number: string | null }).estimate_number),
        year
      );
    }
    const status = body.status ?? "draft";
    const now = new Date().toISOString();

    const { data: created, error: insertError } = await supabase
      .from("estimates")
      .insert({
        company_id: profile.company_id,
        created_by: user.id,
        estimate_number: estimateNumber,
        client_id,
        client_name: client.name,
        project_id: body.project_id ?? null,
        title: title.trim(),
        name: title.trim(),
        total_amount: body.total_amount ?? 0,
        issue_date: issueDate,
        status,
        document_url: body.document_url ?? null,
        sent_at: status === "sent" ? now : null,
        approved_at: status === "approved" ? now : null,
        rejected_at: status === "rejected" ? now : null,
        converted_at: status === "converted" ? now : null,
      })
      .select()
      .single();

    if (insertError) {
      // A concurrent call raced us past the idempotency check above.
      if (insertError.code === "23505") {
        const { data: winner } = await supabase
          .from("estimates")
          .select("*")
          .eq("company_id", profile.company_id)
          .eq("estimate_number", estimateNumber)
          .maybeSingle();
        if (winner) {
          return NextResponse.json({ estimate: winner, created: false }, { status: 200 });
        }
      }
      throw insertError;
    }

    return NextResponse.json({ estimate: created, created: true }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "An error occurred";
    console.error("POST /api/estimates failed:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
