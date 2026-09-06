/**
 * One place that knows which model the assistant runs on.
 *
 * The model used to be a string literal inside the chat route. When the
 * Anthropic key ran out of credits on 2026-08-31, nothing anywhere named the
 * provider, the model or the key — the UI simply stopped replying, and the same
 * question was asked into silence nine times over six days before anyone
 * noticed. The health check reads these constants, so what it reports is
 * necessarily what the chat route actually calls.
 */

export const AI_PROVIDER = "anthropic" as const;

/** Overridable per environment; the default is what shipped. */
export const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

export const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_VERSION = "2023-06-01";

export const ANTHROPIC_MAX_TOKENS = Number(process.env.ANTHROPIC_MAX_TOKENS || 2048);

/** Why the assistant is unreachable. Drives what the UI banner tells the user. */
export type AiFailureReason = "billing" | "auth" | "config" | "rate_limit" | "network" | "unknown";

export interface AiFailure {
  reason: AiFailureReason;
  /** Short sentence safe to show a user. Never leaks the key or raw provider JSON. */
  message: string;
  status?: number;
}

/**
 * Turns an Anthropic error response into a reason a human can act on.
 *
 * "credit balance is too low" and "invalid x-api-key" need completely different
 * responses from the person reading the banner, and neither is served by
 * "Something went wrong. Try again."
 */
export function classifyAnthropicError(status: number, body: string): AiFailure {
  const text = (body || "").toLowerCase();

  if (
    text.includes("credit balance") ||
    text.includes("insufficient") ||
    text.includes("billing") ||
    text.includes("quota")
  ) {
    return {
      reason: "billing",
      message: "Claude is offline — the Anthropic account is out of credit.",
      status,
    };
  }

  if (status === 401 || status === 403 || text.includes("authentication") || text.includes("api key")) {
    return {
      reason: "auth",
      message: "Claude is offline — the API key was rejected.",
      status,
    };
  }

  if (status === 429) {
    return {
      reason: "rate_limit",
      message: "Claude is rate limited right now. Try again shortly.",
      status,
    };
  }

  if (status >= 500) {
    return {
      reason: "network",
      message: "Claude is unreachable — the provider returned an error.",
      status,
    };
  }

  return {
    reason: "unknown",
    message: `Claude returned an unexpected error (${status}).`,
    status,
  };
}

export const MISSING_KEY_FAILURE: AiFailure = {
  reason: "config",
  message: "Claude is offline — ANTHROPIC_API_KEY is not configured.",
};
