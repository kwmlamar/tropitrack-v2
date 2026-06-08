import type { SupabaseClient } from "@supabase/supabase-js";
import type { ToolDescriptor, ToolContext, ToolStatus, ToolTarget } from "./types";

export interface AuditEntry {
  companyId: string;
  userId: string;
  source: "ui" | "ai" | "api" | "system";
  toolName: string;
  toolVersion: number;
  scope: "read" | "write";
  tier: "none" | "confirm" | "double-confirm";
  confirmationMode?: string;
  input: unknown;
  result?: unknown;
  status: ToolStatus;
  errorMessage?: string;
  target?: ToolTarget;
  threadId?: string;
  durationMs: number;
}

export async function logToolCall(supabase: SupabaseClient, e: AuditEntry): Promise<void> {
  const { error } = await supabase.from("audit_logs").insert({
    company_id: e.companyId,
    user_id: e.userId,
    source: e.source,
    tool_name: e.toolName,
    tool_version: e.toolVersion,
    scope: e.scope,
    tier: e.tier,
    confirmation_mode: e.confirmationMode ?? null,
    input: e.input ?? {},
    result: e.result ?? null,
    status: e.status,
    error_message: e.errorMessage ?? null,
    target_table: e.target?.table ?? null,
    target_row_id: e.target?.rowId ?? null,
    thread_id: e.threadId ?? null,
    duration_ms: e.durationMs,
  });
  if (error) {
    console.error("audit_logs insert failed", error.message);
  }
}

export async function runTool<TInput, TOutput>(
  tool: ToolDescriptor<TInput, TOutput>,
  input: TInput,
  ctx: ToolContext,
): Promise<{ status: ToolStatus; result: unknown; target?: ToolTarget; error?: string }> {
  const start = Date.now();
  let status: ToolStatus = "ok";
  let result: unknown = null;
  let target: ToolTarget | undefined;
  let errorMessage: string | undefined;

  try {
    const out = await tool.handler(input, ctx);
    if (out.ok) {
      result = out.data;
      target = out.target;
    } else {
      status = "error";
      errorMessage = out.error;
      result = { error: out.error };
    }
  } catch (e) {
    status = "error";
    errorMessage = e instanceof Error ? e.message : String(e);
    result = { error: errorMessage };
  }

  await logToolCall(ctx.supabase, {
    companyId: ctx.companyId,
    userId: ctx.userId,
    source: ctx.source,
    toolName: tool.name,
    toolVersion: tool.version ?? 1,
    scope: tool.scope,
    tier: tool.tier,
    confirmationMode: ctx.confirmationMode,
    input: input as unknown,
    result,
    status,
    errorMessage,
    target,
    threadId: ctx.threadId,
    durationMs: Date.now() - start,
  });

  return { status, result, target, error: errorMessage };
}
