import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cancelPendingWrite, loadPendingWrite } from "@/lib/ai-tools/pending-writes";
import { getTool } from "@/lib/ai-tools/registry";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const token = authHeader.replace("Bearer ", "");
    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: { user }, error: authError } = await adminSupabase.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const userSupabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { pending_write_id } = await request.json();
    if (!pending_write_id) {
      return NextResponse.json({ error: "pending_write_id required" }, { status: 400 });
    }

    const pending = await loadPendingWrite(userSupabase, pending_write_id);
    if (!pending) return NextResponse.json({ error: "pending write not found" }, { status: 404 });
    if (pending.user_id !== user.id) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const { data: profile } = await userSupabase
      .from("profiles")
      .select("company_id")
      .eq("id", user.id)
      .single();
    if (!profile?.company_id) {
      return NextResponse.json({ error: "User has no company" }, { status: 400 });
    }

    await cancelPendingWrite(userSupabase, pending, getTool(pending.tool_name), {
      companyId: profile.company_id,
      userId: user.id,
      threadId: pending.thread_id,
      source: "ai",
    });

    const assistantContent = `Cancelled: ${pending.summary}`;
    await adminSupabase.from("ai_thread_messages").insert({
      thread_id: pending.thread_id,
      role: "assistant",
      content: assistantContent,
    });

    return NextResponse.json({ success: true, message: assistantContent });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "cancel failed";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
