/**
 * One place that knows which provider and model the app's AI runs on.
 *
 * The assistant used to run on Anthropic with the model as a string literal
 * inside the chat route. When that key ran out of credit on 2026-08-31, nothing
 * anywhere named the provider, the model or the key — the UI simply stopped
 * replying, and the same question was asked into silence nine times over six
 * days before anyone noticed. The health check reads these constants, so what
 * it reports is necessarily what the routes actually call.
 *
 * 2026-09-06: moved from Anthropic to OpenAI, so the whole app runs on one
 * provider and one key. This is a real port, not a key swap — the two APIs
 * differ in endpoint, auth header, message shape and, most of all, in how tool
 * calling works. See the chat route for that part.
 */

export const AI_PROVIDER = "openai" as const;

export const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

/**
 * The assistant and estimate generation. These were on Sonnet, so the default
 * is the full model rather than the mini one.
 */
export const OPENAI_CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4o";

/**
 * Receipt vision parsing. This was on Haiku — a deliberately cheap, fast model
 * for a high-volume path — so it maps to the mini model, and reuses the
 * OPENAI_MODEL var this repo already had rather than inventing another.
 */
export const OPENAI_VISION_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

export const OPENAI_MAX_TOKENS = Number(process.env.OPENAI_CHAT_MAX_TOKENS || 2048);

/** Why the assistant is unreachable. Drives what the UI banner tells the user. */
export type AiFailureReason = "billing" | "auth" | "config" | "rate_limit" | "network" | "unknown";

export interface AiFailure {
  reason: AiFailureReason;
  /** Short sentence safe to show a user. Never leaks the key or raw provider JSON. */
  message: string;
  status?: number;
}

/**
 * Turns an OpenAI error response into a reason a human can act on.
 *
 * The important case is the one that killed this feature: running out of money.
 * OpenAI returns **429 for both a rate limit and an exhausted quota**, and the
 * only thing separating them is `code`/`type` being `insufficient_quota`. Get
 * that discrimination wrong and "the account is empty" reads as "try again in a
 * minute" — which is exactly the misdiagnosis that let this sit dead for a week.
 */
export function classifyOpenAIError(status: number, body: string): AiFailure {
  const text = (body || "").toLowerCase();

  const isQuota =
    text.includes("insufficient_quota") ||
    text.includes("exceeded your current quota") ||
    text.includes("billing") ||
    text.includes("payment");

  if (isQuota) {
    return {
      reason: "billing",
      message: "Claude is offline — the OpenAI account is out of credit.",
      status,
    };
  }

  if (
    status === 401 ||
    status === 403 ||
    text.includes("invalid_api_key") ||
    text.includes("incorrect api key") ||
    text.includes("authentication")
  ) {
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
  message: "Claude is offline — OPENAI_API_KEY is not configured.",
};

/** Standard auth header for every OpenAI REST call in this app. */
export function openAiHeaders(apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
}
