import type { SupabaseClient } from "@supabase/supabase-js";
import { runTool, logToolCall } from "./audit";
import type { AnyToolDescriptor, ToolContext } from "./types";

export interface PendingWriteRow {
  id: string;
  company_id: string;
  user_id: string;
  thread_id: string;
  tool_name: string;
  tool_version: number;
  tier: "confirm" | "double-confirm";
  input: Record<string, unknown>;
  summary: string;
  double_confirm_answer: string | null;
  status: "pending" | "confirmed" | "cancelled" | "expired";
  result: unknown;
  error_message: string | null;
  created_at: string;
  resolved_at: string | null;
  expires_at: string;
}

export interface ProposedWritePayload {
  id: string;
  tool_name: string;
  tier: "confirm" | "double-confirm";
  summary: string;
  expires_at: string;
}

export async function createPendingWrite(
  supabase: SupabaseClient,
  params: {
    companyId: string;
    userId: string;
    threadId: string;
    tool: AnyToolDescriptor;
    input: Record<string, unknown>;
    summary: string;
    doubleConfirmAnswer?: string;
  },
): Promise<ProposedWritePayload> {
  if (params.tool.tier === "none") {
    throw new Error(`tool ${params.tool.name} is tier 'none' and should not be staged`);
  }
  const { data, error } = await supabase
    .from("ai_pending_writes")
    .insert({
      company_id: params.companyId,
      user_id: params.userId,
      thread_id: params.threadId,
      tool_name: params.tool.name,
      tool_version: params.tool.version ?? 1,
      tier: params.tool.tier,
      input: params.input,
      summary: params.summary,
      double_confirm_answer: params.doubleConfirmAnswer ?? null,
    })
    .select("id, tool_name, tier, summary, expires_at")
    .single();
  if (error || !data) throw new Error(`failed to stage pending write: ${error?.message}`);
  return {
    id: data.id,
    tool_name: data.tool_name,
    tier: data.tier as "confirm" | "double-confirm",
    summary: data.summary,
    expires_at: data.expires_at,
  };
}

export async function loadPendingWrite(
  supabase: SupabaseClient,
  pendingWriteId: string,
): Promise<PendingWriteRow | null> {
  const { data } = await supabase
    .from("ai_pending_writes")
    .select("*")
    .eq("id", pendingWriteId)
    .single();
  return (data as PendingWriteRow) ?? null;
}

export interface ResolveOptions {
  typedAnswer?: string;
}

export interface ResolveResult {
  status: "ok" | "error" | "expired" | "denied";
  result?: unknown;
  error?: string;
}

export async function confirmPendingWrite(
  supabase: SupabaseClient,
  pending: PendingWriteRow,
  tool: AnyToolDescriptor,
  ctx: Omit<ToolContext, "supabase" | "confirmationMode">,
  opts: ResolveOptions,
): Promise<ResolveResult> {
  if (pending.status !== "pending") {
    return { status: "error", error: `pending write is ${pending.status}` };
  }
  if (new Date(pending.expires_at).getTime() < Date.now()) {
    await supabase.from("ai_pending_writes").update({
      status: "expired", resolved_at: new Date().toISOString(),
    }).eq("id", pending.id);
    return { status: "expired", error: "this proposal has expired; ask again" };
  }
  if (pending.tier === "double-confirm") {
    if (!opts.typedAnswer || opts.typedAnswer.trim() !== (pending.double_confirm_answer ?? "")) {
      return { status: "error", error: "typed confirmation does not match" };
    }
  }

  const outcome = await runTool(tool, pending.input, {
    ...ctx,
    supabase,
    confirmationMode: pending.tier === "double-confirm" ? "double-confirm-typed" : "confirm-card",
  });

  await supabase.from("ai_pending_writes").update({
    status: outcome.status === "ok" ? "confirmed" : "cancelled",
    resolved_at: new Date().toISOString(),
    result: outcome.result ?? null,
    error_message: outcome.error ?? null,
  }).eq("id", pending.id);

  return outcome.status === "ok"
    ? { status: "ok", result: outcome.result }
    : { status: "error", error: outcome.error };
}

export async function cancelPendingWrite(
  supabase: SupabaseClient,
  pending: PendingWriteRow,
  tool: AnyToolDescriptor | undefined,
  ctx: Omit<ToolContext, "supabase" | "confirmationMode">,
): Promise<void> {
  if (pending.status !== "pending") return;
  await supabase.from("ai_pending_writes").update({
    status: "cancelled",
    resolved_at: new Date().toISOString(),
  }).eq("id", pending.id);

  // Audit the denial so the trail is complete.
  await logToolCall(supabase, {
    companyId: ctx.companyId,
    userId: ctx.userId,
    source: ctx.source,
    toolName: pending.tool_name,
    toolVersion: pending.tool_version,
    scope: tool?.scope ?? "write",
    tier: pending.tier,
    confirmationMode: "user-cancelled",
    input: pending.input,
    result: null,
    status: "denied",
    threadId: pending.thread_id,
    durationMs: 0,
  });
}
