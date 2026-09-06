Follows #29. One provider, one key: `ANTHROPIC_API_KEY` is gone and `OPENAI_API_KEY` now powers the assistant, receipt vision parsing, estimate generation, ⌘K search and the description generator.

**This is a port, not a key swap.** The two APIs differ in endpoint, auth header and message shape — and most of all in how tool calling works.

## `/api/ai/chat` — rewritten

The tool-calling loop is the substance of this PR. What changed:

| | Anthropic | OpenAI |
|---|---|---|
| System prompt | top-level `system` field | `messages[0]` |
| Tool schema | `{name, description, input_schema}` | `{type:"function", function:{…}}` |
| Tool request | `tool_use` content block, `input` as an object | `message.tool_calls[]`, `arguments` as a **JSON string** |
| Tool result | `tool_result` blocks inside a user turn | one `role:"tool"` message per call, keyed by `tool_call_id` |
| Stop signal | `stop_reason === "tool_use"` | `finish_reason === "tool_calls"` |
| Usage | `input_tokens` / `output_tokens` | `prompt_tokens` / `completion_tokens` |

**The tool registry, skill scoping and the propose → confirm → write staging are untouched.** Same tools, same tiers, same `ai_pending_writes` flow, same `audit_logs` trail — only the envelope changed.

Two details worth reviewing:

- **Malformed tool arguments no longer take the turn down.** `arguments` arrives as a string; if a model emits invalid JSON, that failure is fed back as a tool result so it can correct itself, rather than throwing.
- **Every tool call must be answered.** OpenAI rejects a follow-up request if any `tool_call_id` from the preceding assistant turn is missing a `role:"tool"` reply, so results are pushed one per call.

## The error classifier is the part that matters

**OpenAI returns 429 for *both* a rate limit and an exhausted quota.** The only thing separating them is `code`/`type` being `insufficient_quota`.

Get that discrimination backwards and "the account is empty" reads to the user as "try again in a minute" — which is exactly the misdiagnosis that let this feature sit dead for six days in August. `classifyOpenAIError()` checks quota **first**, before the generic 429 branch.

## Also ported

- **`/api/ai/health`** — same contract, OpenAI usage fields. Still the first thing to run after deploy.
- **`/api/receipts/parse`** — image now goes as a `data:` URI in an `image_url` part rather than a base64 `source` block with a separate `media_type`. Maps Haiku → `gpt-4o-mini`, preserving the cheap/fast intent of that high-volume path.
- **`/api/estimates/generate`** — system prompt as `messages[0]`. Maps Sonnet → `gpt-4o`.
- **Settings spend estimate** re-based on gpt-4o list pricing ($2.50/M in, $10/M out).

## One judgement call flagged

**`BASE_SYSTEM` no longer says "You are Claude."** The model answering is OpenAI's, and instructing it to introduce itself as Claude would have it assert a false identity to the crew every time someone asked what it was. That single line I changed rather than shipped.

**The rest of the branding is left alone and is the owner's call**: the nav item, the Anthropic icon mark, "Ask Claude", "Claude is offline", the `/assistant` header. If "Claude" is simply the feature's name that is a legitimate choice — but it is now a GPT-powered feature wearing Anthropic's logo, and that should be a decision rather than a discovery.

## Env vars

`ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` and `ANTHROPIC_MAX_TOKENS` can be removed from the deployment. Required: `OPENAI_API_KEY`. Optional: `OPENAI_CHAT_MODEL` (default `gpt-4o`), `OPENAI_CHAT_MAX_TOKENS` (2048), `OPENAI_MODEL` (default `gpt-4o-mini`), `OPENAI_MAX_TOKENS` (500). `.env.example` documents all of it.

## ⚠️ Not build-tested

**`npm run build` and `npm run lint` have not been run — Node is not installed on the machine this was written on** (no node/npm/pnpm/nvm/brew). Verified statically instead: all imports resolve, every symbol imported from `ai-config` exists as an export, no Anthropic-shaped types survive anywhere in the chat route, and brace balance is clean across every ported file.

**A rewritten tool-calling loop is exactly the kind of thing that fails on its first real call.** Before merging: run the build, then hit `GET /api/ai/health`, then send one message through `/assistant` that triggers a tool (e.g. *"how much do we owe everyone"* → `crew_balances`) and one that triggers a staged write (a payroll thread → `record_payment`) to confirm the confirm-card path still works end to end.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
