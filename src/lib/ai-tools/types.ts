import type { SupabaseClient } from "@supabase/supabase-js";

export type ToolTier = "none" | "confirm" | "double-confirm";
export type ToolScope = "read" | "write";
export type ToolSource = "ui" | "ai" | "api" | "system";
export type ToolStatus = "ok" | "error" | "denied";

export interface ToolContext {
  supabase: SupabaseClient;
  companyId: string;
  userId: string;
  threadId?: string;
  source: ToolSource;
  confirmationMode?: string;
}

export interface ToolTarget {
  table: string;
  rowId?: string;
}

export interface ToolResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  target?: ToolTarget;
}

export interface ToolPreview {
  summary: string;
  // Required for double-confirm: the exact string the user must type to enable Confirm.
  doubleConfirmAnswer?: string;
}

export interface ToolDescriptor<TInput = Record<string, unknown>, TOutput = unknown> {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  version?: number;
  tier: ToolTier;
  scope: ToolScope;
  skills: string[];
  handler: (input: TInput, ctx: ToolContext) => Promise<ToolResult<TOutput>>;
  // Required when tier !== 'none'. Produces a human-readable summary shown to
  // the user before the write commits. May fetch from the DB to resolve names.
  preview?: (input: TInput, ctx: ToolContext) => Promise<ToolPreview>;
}

// Registry-friendly variant: handler accepts unknown input. Individual tools
// keep their typed shapes; the runtime narrows at the call site.
export interface AnyToolDescriptor {
  name: string;
  description: string;
  input_schema: ToolDescriptor["input_schema"];
  version?: number;
  tier: ToolTier;
  scope: ToolScope;
  skills: string[];
  handler: (input: unknown, ctx: ToolContext) => Promise<ToolResult>;
  preview?: (input: unknown, ctx: ToolContext) => Promise<ToolPreview>;
}
