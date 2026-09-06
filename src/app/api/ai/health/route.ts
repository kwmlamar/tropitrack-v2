import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  AI_PROVIDER,
  classifyOpenAIError,
  MISSING_KEY_FAILURE,
  openAiHeaders,
  OPENAI_API_URL,
  OPENAI_CHAT_MODEL,
} from "@/lib/ai-config";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * GET /api/ai/health — is the assistant actually alive?
 *
 * The feature died on 2026-08-31 because the Anthropic key ran out of credits,
 * and nothing in the system could tell the difference between "nobody asked
 * anything today" and "every answer has failed for six days". This endpoint
 * makes the smallest possible real call to the provider and reports what came
 * back, including WHY it failed — billing, auth, config, rate limit or network.
 *
 * Every run writes an audit_logs row (tool_name 'ai_health_check'). That is what
 * dashboard_extra_checks() reads to raise "Claude is offline" on the dashboard
 * once the failure is more than 24 hours old.
 *
 * Authenticated: this reports operational state and consumes a token of quota,
 * so it is not open to the world.
 */
export async function GET(request: NextRequest) {
  const startedAt = Date.now();

  const authHeader = request.headers.get("authorization");
  if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const token = authHeader.replace("Bearer ", "");
  const admin = createClient(supabaseUrl, supabaseServiceKey);
  const {
    data: { user },
    error: authError,
  } = await admin.auth.getUser(token);
  if (authError || !user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { data: profile } = await admin
    .from("profiles")
    .select("company_id")
    .eq("id", user.id)
    .single();

  // The audit row is written on the caller's own client, so RLS applies.
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const userSupabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const apiKey = process.env.OPENAI_API_KEY;
  const base = {
    provider: AI_PROVIDER,
    model: OPENAI_CHAT_MODEL,
    key_present: Boolean(apiKey),
    checked_at: new Date().toISOString(),
  };

  async function record(ok: boolean, detail: Record<string, unknown>, errorMessage?: string) {
    if (!profile?.company_id) return;
    await userSupabase.from("audit_logs").insert({
      company_id: profile.company_id,
      user_id: user!.id,
      source: "system",
      tool_name: "ai_health_check",
      tool_version: 1,
      scope: "read",
      tier: "none",
      input: { provider: AI_PROVIDER, model: OPENAI_CHAT_MODEL },
      result: detail,
      status: ok ? "ok" : "error",
      error_message: errorMessage ?? null,
      duration_ms: Date.now() - startedAt,
    });
  }

  if (!apiKey) {
    await record(false, { ...base, failure: MISSING_KEY_FAILURE }, MISSING_KEY_FAILURE.message);
    return NextResponse.json(
      { ...base, ok: false, failure: MISSING_KEY_FAILURE, latency_ms: Date.now() - startedAt },
      { status: 200 }
    );
  }

  try {
    // The smallest call that still proves the whole path: key accepted, model
    // name valid, credit available, network reachable.
    const res = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: openAiHeaders(apiKey),
      body: JSON.stringify({
        model: OPENAI_CHAT_MODEL,
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      const failure = classifyOpenAIError(res.status, body);
      await record(false, { ...base, failure }, failure.message);
      return NextResponse.json(
        { ...base, ok: false, failure, latency_ms: Date.now() - startedAt },
        { status: 200 }
      );
    }

    const data = await res.json();
    const usage = {
      input_tokens: data?.usage?.prompt_tokens ?? null,
      output_tokens: data?.usage?.completion_tokens ?? null,
    };
    await record(true, { ...base, usage });

    return NextResponse.json({
      ...base,
      ok: true,
      usage,
      latency_ms: Date.now() - startedAt,
    });
  } catch (err) {
    const failure = {
      reason: "network" as const,
      message: "Claude is unreachable — the request to the provider failed.",
    };
    await record(false, { ...base, failure }, err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      { ...base, ok: false, failure, latency_ms: Date.now() - startedAt },
      { status: 200 }
    );
  }
}
