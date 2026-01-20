import OpenAI from "openai";

// OpenAI client - only use on server side (API routes)
export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
export const OPENAI_MAX_TOKENS = parseInt(process.env.OPENAI_MAX_TOKENS || "500", 10);

// Rate limiting
export const MAX_DAILY_SEARCHES = 50;
export const MAX_DAILY_GENERATIONS = 100;
