import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface CreateProjectRequest {
  name: string;
  client_id: string;
  location: string;
  /** Required unless no_fixed_contract is true — see that field. */
  contract_value?: number;
  /** True for flat-fee/T&M jobs (property-management retainers) with no fixed contract_value. */
  no_fixed_contract?: boolean;
  description?: string;
  status?: "planning" | "active" | "on_hold" | "completed" | "cancelled";
  start_date?: string;
  estimated_end_date?: string;
  budget?: number;
  project_manager_id?: string;
}

/**
 * POST /api/projects
 *
 * Idempotent project creation for outside callers (a Claude skill, Caye) so a
 * job that starts life in a conversation or in Dropbox becomes exactly one
 * `projects` row here, never two. Matches on (company, client, name): a
 * second call for the same job returns the row already created instead of
 * inserting a duplicate. See docs/AGENT-BRIEF-payperiod-autocreate.md Part 2.
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

    const body: CreateProjectRequest = await request.json();
    const { name, client_id, location, contract_value, no_fixed_contract } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    if (!client_id) {
      return NextResponse.json({ error: "client_id is required" }, { status: 400 });
    }
    if (!location?.trim()) {
      return NextResponse.json({ error: "location is required" }, { status: 400 });
    }
    // A flat-fee/T&M job (property-management retainers like Sotheby's
    // Caretaking Properties) legitimately has no contract_value — the flag
    // makes that a deliberate choice rather than accepting a blank/zero silently.
    if (!no_fixed_contract && !(contract_value! > 0)) {
      return NextResponse.json(
        { error: "contract_value is required unless no_fixed_contract is true" },
        { status: 400 }
      );
    }

    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id")
      .eq("id", client_id)
      .eq("company_id", profile.company_id)
      .maybeSingle();
    if (clientError || !client) {
      return NextResponse.json(
        { error: "client_id does not match a client on this company" },
        { status: 400 }
      );
    }

    // Idempotency check: same company + client + name wins over inserting again.
    // Compared in JS (not .ilike) so a % or _ in the project name can't be
    // misread as a SQL wildcard.
    const { data: candidates, error: candidatesError } = await supabase
      .from("projects")
      .select("*")
      .eq("company_id", profile.company_id)
      .eq("client_id", client_id);
    if (candidatesError) throw candidatesError;

    const normalizedName = name.trim().toLowerCase();
    const existing = candidates?.find(
      (p) => p.name.trim().toLowerCase() === normalizedName
    );
    if (existing) {
      return NextResponse.json({ project: existing, created: false }, { status: 200 });
    }

    const { data: created, error: insertError } = await supabase
      .from("projects")
      .insert({
        company_id: profile.company_id,
        created_by: user.id,
        name: name.trim(),
        client_id,
        location: location.trim(),
        contract_value: contract_value ?? 0,
        no_fixed_contract: no_fixed_contract ?? false,
        description: body.description ?? null,
        status: body.status ?? "planning",
        start_date: body.start_date ?? new Date().toISOString().slice(0, 10),
        estimated_end_date: body.estimated_end_date ?? null,
        budget: body.budget ?? 0,
        project_manager_id: body.project_manager_id ?? null,
      })
      .select()
      .single();

    if (insertError) {
      // A concurrent call raced us past the check above — the unique index
      // (idx_projects_company_client_name_unique) caught it. Re-fetch and
      // return the winner's row instead of erroring.
      if (insertError.code === "23505") {
        const { data: winner } = await supabase
          .from("projects")
          .select("*")
          .eq("company_id", profile.company_id)
          .eq("client_id", client_id)
          .ilike("name", name.trim())
          .maybeSingle();
        if (winner) {
          return NextResponse.json({ project: winner, created: false }, { status: 200 });
        }
      }
      throw insertError;
    }

    return NextResponse.json({ project: created, created: true }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "An error occurred";
    console.error("POST /api/projects failed:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
