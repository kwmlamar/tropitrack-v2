import OpenAI from "openai";

// Lazy initialization of OpenAI client to avoid build-time errors
// Only initializes when actually called at runtime
let _openai: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!_openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("Missing credentials. Please pass an `apiKey`, or set the `OPENAI_API_KEY` environment variable.");
    }
    _openai = new OpenAI({
      apiKey,
    });
  }
  return _openai;
}

// Export getter function that returns the client
// This prevents initialization during build time
export function getOpenAI(): OpenAI {
  return getOpenAIClient();
}

// For backward compatibility, export a proxy object
// This allows existing code using `openai.chat.completions.create()` to continue working
export const openai = new Proxy({} as OpenAI, {
  get(_target, prop) {
    return getOpenAIClient()[prop as keyof OpenAI];
  },
});

export const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
export const OPENAI_MAX_TOKENS = parseInt(process.env.OPENAI_MAX_TOKENS || "500", 10);

// Rate limiting
export const MAX_DAILY_SEARCHES = 50;
export const MAX_DAILY_GENERATIONS = 100;
