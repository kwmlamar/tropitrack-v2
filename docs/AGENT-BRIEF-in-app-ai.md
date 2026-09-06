# Agent Brief — Rebuild the in-app AI as TropiTrack's answer engine

**Repo:** `tropitrack-v2` · **DB:** Supabase `rrqpwtggiirexptnhyqy` · **Branch:** `feat/ai-answer-engine`
**Read first:** `docs/FINDINGS-in-app-ai.md`, then `docs/DESIGN-SYSTEM.md`

---

## The situation

TropiTrack (Bedrock) has three AI systems. One is well built and has been **dead since Aug 31** — the Anthropic key ran out of credits, the UI said nothing, and the one real user asked the same question into silence nine times over six days. The other two have never been used and one of them is a security hole.

All-time usage is 70 threads / 219 messages / 187 tool calls / **1 write**. 91% of it is Jay. Two-thirds of every question asked is one of exactly two questions:

- *"How much do we owe everyone"* (~20 of 45 sampled messages)
- *"Labor on [job]"* (~10)

**Neither of those has a screen in this app.** That is the actual finding. A language model is currently the only way to answer them, and it answers them by adding up columns in its head — on 2026-08-21 it gave two different totals for the same question on the same day.

## The principle this work is built on

> The AI must never do the arithmetic. It calls the same database function the screen calls.

Every number the assistant reports must come from a Postgres function that also backs a UI surface. Same input, same function, same number, whether it was asked for in chat or rendered on a page. If a question can be answered by SQL, the model's only job is picking the function and explaining the result.

Do not add "the model can compute it" as a fallback anywhere in this work.

---

## Part 1 — Two database functions (do this first, everything else depends on it)

Model these on the existing `public.dashboard_summary(p_company_id uuid)` in `supabase/migrations/20260904_dashboard_summary.sql`: `SECURITY INVOKER`, `STABLE`, `SET search_path = public`, dates anchored to `America/Nassau` (the DB runs UTC — using `current_date` after ~20:00 local reports the wrong day; that bug has already been hit once here), and each sub-query wrapped so one failure degrades a section instead of blanking the payload.

### 1a. `public.crew_balances(p_company_id uuid) RETURNS jsonb`

Answers *"how much do we owe everyone"* in one call. Port the logic that currently lives in TypeScript in `src/lib/ai-tools/list-unpaid-workers.ts` and `src/lib/ai-tools/worker-unpaid.ts` — read both before writing SQL; they are the spec.

Per worker, plus a company total:

- **Outstanding payroll** — non-voided `payroll_entries` with `payment_status in ('unpaid','partial')`, balance = `gross_pay - total_paid`, entry count, oldest unpaid `pay_periods.start_date`.
- **Uncovered time** — `time_entries` whose `date` falls in no non-voided `pay_periods` row, valued at the worker's current `hourly_rate` (OT at `overtime_rate_multiplier`). This is the hole that hid $53,026.48 of labour; the assistant found it in August and no screen shows it. Return `since` (earliest uncovered date), hours and value.
- **Total owed** = outstanding payroll + uncovered time.

Three things to get right:

1. **Flag the balance basis, don't silently change it.** The current TS uses `gross_pay - total_paid`. `payroll_entries.net_pay` also exists, and only 2 of ~20 workers have `nib_enabled`, so for those two, gross overstates what is actually handed over. Return **both** `balance_gross` and `balance_net` per worker and a top-level `basis_note`. Surface the discrepancy in the summary; **do not pick one for them** — that is Wallace and Jay's call.
2. The existing TS filters `pay_periods.status <> 'paid'`, which drops a partially-paid entry sitting inside a period someone marked paid. Include those; a balance is a balance.
3. Exclude `status = 'terminated'` workers from the roster but report them separately if they carry a balance — a terminated worker still owed money is exactly the thing that must not disappear.

Sanity check while building: as of 2026-09-06 outstanding unpaid payroll is **$14,186.71 across 15 periods from 2026-04-18 forward**, and nothing before April is unpaid (the backfill tagged `BACKFILL-20260906` in `pay_periods.notes` settled that). If your function returns a wildly different number, the function is wrong — stop and report, do not adjust data.

### 1b. `public.project_labor_cost(p_project_id uuid) RETURNS jsonb`

Answers *"labor on [job]"*. Per worker on that project: days, regular hours, OT hours, rate, cost; plus project totals and cost against `budget` / `contract_value`. Zero-hour entries excluded from cost but counted, and say so in the payload.

**Rates:** use `workers.hourly_rate` — these are crew wage rates and this is a cost figure, not a client price. Do **not** apply the ODS client-facing rate card here and do not add markup or O&P; that belongs in estimates, which are authored outside this app.

There is no historical rate table, so a rate changed since the work was done makes older figures approximate. Put that in the payload as a note and render it.

### 1c. Surface them in the UI before touching the AI

- **Dashboard (`/dashboard`)**: an "Owed to crew" tile beside the existing "Owed to us" tile — total, worker count, oldest unpaid period. Reuse the existing `Tile` component and `MoneyBand` tone thresholds in `src/app/(dashboard)/dashboard/page.tsx`; no new colours, no new dependencies.
- **`/payroll`**: a per-worker owed panel driven by the same function.
- **Job page**: a Labor panel from `project_labor_cost`.

**When this part is done, the two questions that are two-thirds of all AI usage are answerable without any AI at all.** That is the point. Verify the tile and the chat return the identical figure before moving on.

---

## Part 2 — Retire the legacy AI

- **Delete** `src/lib/ai-agent/**` and `src/app/api/ai/agent/route.ts`. It has 0 rows in `ai_actions` / `ai_messages` / `ai_conversations`, no caller in `src/`, and it runs 50+ tools — including `delete_project` and `update_payment_instructions` (the bank details on client invoices) — on the **service-role client with no confirmation gate**. Also delete `AI-AGENT-README.md`, which documents it as if it were the product.
- **`/api/ai/search`** (⌘K Smart Search, 2 uses lifetime): it executes a model-chosen table name against the service-role client, and only 7 tables are company-scoped, so a model-chosen `payroll_entries` / `receipts` / `profiles` / `companies` runs unscoped. Either delete it and the `search-modal` AI path, or rewrite it to run on the **user-scoped client** (anon key + caller JWT, the pattern in `/api/ai/chat`) with a strict table allowlist that rejects rather than silently un-scopes. Deleting is the recommendation — nobody uses it and the registry can answer the same questions.
- `/api/ai/generate-description` may stay for now. If it is the last OpenAI consumer, port it to Anthropic and drop the `openai` dependency and its env vars so this codebase has **one AI provider**.

Do not delete `ai_actions` / `ai_messages` / `ai_conversations` tables in this pass — leave the empty tables, note them in the summary as droppable later.

---

## Part 3 — Make the failure impossible to miss

This is the part that actually killed the feature. Treat it as load-bearing, not polish.

- Move the model out of the hardcoded string in `/api/ai/chat/route.ts` (`"claude-sonnet-4-6"`) into `ANTHROPIC_MODEL`, with a sane default and the value echoed by the health check. Add every AI env var to `.env.example` — `ANTHROPIC_API_KEY` is not in there today, which is part of why this was invisible.
- **`GET /api/ai/health`** — authenticated, returns provider, model, key-present, and the result of a minimal live call, with a clear failure reason (`billing`, `auth`, `network`).
- **In the chat UI, distinguish "offline" from "thinking".** When the API returns a credit/auth failure, render a persistent banner — *"Claude is offline — the API key needs attention"* — and **do not persist the user's message into a thread that will never get a reply.** Today the message is saved first, the call fails, and the thread is left looking like the assistant ignored them. Fix that ordering.
- **Spend visibility**: `audit_logs` already records every call with duration. Add token counts from the Anthropic response, and a small "AI this month" line on the settings page (calls, tokens, estimated spend). A dashboard Needs Attention check when the health check has been failing for more than 24h.

---

## Part 4 — Put it where the work happens

- The assistant is **not in the mobile navigation and not on `/more`**. Add it. Mobile nav is currently Home / Projects / Quick Add / Invoices / More.
- Add an **"Ask about this"** affordance on the payroll period screen and the job page that opens a new thread pre-seeded with that period's or job's context (ids in the first message, the relevant skill pill pre-selected). A seeded thread beats a blank box — 52 of 70 existing threads died at one exchange.

---

## Part 5 — Tools, prompt, and the writes

### Tools

Keep `src/lib/ai-tools/` — the registry, tiers, skill scoping, `ai_pending_writes` staging, `preview()` summaries and `audit_logs` trail are the right design and stay untouched in shape.

Add read tools that are thin wrappers over the Part 1 functions — `crew_balances`, `project_labor_cost` — `tier: "none"`, `scope: "read"`, `skills: ["core","payroll"]` / `["core","job_status"]`. They call the RPC and return its JSON. **No arithmetic in the tool handler.** Once they exist, `list_unpaid_workers` and `get_worker_unpaid` should delegate to `crew_balances` rather than keep their own duplicate maths.

### Prompt

In `/api/ai/chat/route.ts`:

- **Retire the `estimate` and `client_update` skills entirely** — pills, prompts and all. The governing rule is that TropiTrack holds facts, so its in-app skills are ledger skills; anything that produces a document is authored in Claude/Cowork where the ODS skills and the house formats already live. `estimate`'s embedded rates ("$15-18/hr general, $20-28 skilled", flat 15% overhead) contradict the ODS rate card (Wallace $75 / Omar $70 / Jay $60 / other $45, **30% O&P already baked into those rates - never added on top**) and it carries no Bahamian landed cost at all: no 25-45% duty, no 10% VAT, no 1% CPF, no freight to Eleuthera. `client_update` is pure authoring with a second copy of the house voice. Two threads have ever used `estimate`; `client_update` has none.
- **Four skills remain: `payroll`, `timesheet`, `receipts` (new, see below) and `job_status`.** Update the `SKILLS` array in `src/app/(dashboard)/assistant/page.tsx` and `SKILL_PROMPTS` in the chat route together, and confirm the skill-scoped tool filter still resolves correctly with the smaller set. Existing threads carrying a retired `skill_id` must still open and read - do not orphan them; fall back to the default read-only prompt.
- **`job_status` needs a fact source or it is guessing.** Wire it to `project_labor_cost` and the schedule. Its current prompt asks the user what has been completed because nothing feeds it. There is no "% complete" field in the schema - either derive it from schedule data or remove the percentage from the prompt and report labour, schedule and blockers only. Do not let the model invent one.
- Add a hard instruction: **never compute a total from raw rows — call the function.** If no tool covers the question, say so plainly and name the screen that does.
- Add: **always state the as-of date and the basis** for any money figure (gross vs net), and surface uncovered time as its own line rather than folding it into a single number.
- Keep the existing tone rules and the "never name internal team members" rule. Fix the factual drift in `BASE_SYSTEM` while you are in there: it describes ODS as running "SB Construction" and a "Maple House property" and places the company in "central Eleuthera" — the company is ODS Construction, based at Palmetto Point, working the length of Eleuthera. Tagline is **"Built Right, Built to Last."**

### The writes

Three write scopes ship in this work. **Every one is `tier: "confirm"` with a `preview()` that renders exactly what will change — no exceptions, and do not touch `mode: "bypass"`.** Company id and user id always come from `ToolContext`, never from model input.

**1. `record_payment`** (exists, `skills: ["payroll"]`) — reachable from the payroll screen and a payroll thread. Its `preview()` must name the worker, the amount, the period, and the balance before and after. This is Jay's real question: *"we have 9000 now, what's the best way to divide this, we paid Felix $1000 yesterday and I already logged it."*

**2. `create_time_entry` + `bulk_create_time_entries`** — new, `skills: ["timesheet"]`, `tier: "confirm"`.

Columns are `worker_id, project_id, company_id, date, start_time, end_time, break_duration_minutes, regular_hours, overtime_hours, notes, created_by`. Mirror the insert in `src/components/time-tracking/quick-time-entry.tsx` — that is the reference implementation, read it before writing anything.

- **Defaults come from the data, not from the prompt.** The house standard day is `start_time 07:00`, `end_time 16:00`, `break_duration_minutes 60`, `regular_hours 8.00` — 3,716 of 3,918 entries. **The current `timesheet` skill prompt says "7am–4pm with 1hr lunch = 7 net hrs" and that is wrong; it is 8.** Fix the prompt string in the same change.
- Overtime: hours beyond 8 in a day go to `overtime_hours`, `regular_hours` caps at 8, and `end_time` extends accordingly — same as `quick-time-entry.tsx`.
- **Refuse to write into a settled period.** If the date falls inside a non-voided `pay_periods` row whose `status` is processed or paid, `payroll_entries` have already been generated from it and a new time entry silently desyncs payroll. Return a clear refusal naming the period and the reopen flow (`pay_periods.reopened_at` / `reopen_reason` exist). Do not offer to force it.
- **Duplicate guard.** Same `worker_id` + `project_id` + `date` already present → refuse, and return the existing row so the user can see it. A deliberate second entry for that day has to be asked for explicitly, and the preview must then show both.
- `approved_by` / `approved_at` stay null. AI-entered time is not pre-approved.
- Bulk: cap at 20 workers per call, one preview listing every row (worker, project, date, hours), one confirm for the batch, all-or-nothing insert.

**3. `attribute_receipt` + `list_unattributed_receipts`** — new skill `receipts`, new pill. `list_unattributed_receipts` is `tier: "none"`, `scope: "read"`, `skills: ["core","receipts"]`; `attribute_receipt` is `tier: "confirm"`, `skills: ["receipts"]`.

Receipts arriving from WhatsApp land a `receipts` row with `project_id` null, so job cost is understated. Caye owns intake; this owns the fix-up.

- `attribute_receipt` sets **`receipts.project_id` and nothing else.** Never touch `vendor`, `receipt_date`, `total_amount`, `image_url`, `status`, `submitted_by`, and never touch `receipt_line_items` or the materials pipeline — that is the scanner's job.
- Preview renders vendor, receipt date, amount, current project (or "unassigned") → new project.
- Re-attributing an already-attributed receipt is allowed but the preview must show old → new explicitly.

**Do not add any other write tool.** `create_payroll_entry`, `void_payroll_entry`, `delete_payroll_entry` and `delete_pay_period` already exist in the registry — leave them exactly as they are.

### Skills after this work

Four pills, each gating real writes: **`payroll`**, **`timesheet`**, **`receipts`**, and **`job_status`** (read-only). Note in the summary whether `job_status` should keep a pill at all — with no write tools it is the default read mode with extra steps.

---

## Constraints

- **No edits or deletes to any existing row in `time_entries`, `payroll_entries`, `payment_transactions` or `pay_periods`, and no historical data changes anywhere.** The only writes this work adds are: new `time_entries` rows, `receipts.project_id`, and `record_payment` — each through a confirm card. Nothing updates or removes an existing time or payroll row.
- Do not modify `public.dashboard_summary` — the owner has ruled its existing checks stay as they are, miscalibrations included. Add new checks alongside.
- Migrations additive only, `SECURITY INVOKER`, RLS respected. Never widen a policy to make a query work.
- Nothing runs on the service-role client except auth and thread persistence. Every tool call uses the user-scoped client.
- Existing design tokens only (`docs/DESIGN-SYSTEM.md`, `tailwind.config.ts`). No new colours, no new dependencies.
- `npm run build` and `npm run lint` clean.
- **Dropbox is off limits.** No API calls, no credentials, no folder work.

## Done when

- `crew_balances()` and `project_labor_cost()` exist, and the dashboard tile, the payroll panel, the job panel and the chat all return **the identical number** from them.
- `crew_balances()` reconciles to $14,186.71 outstanding across 15 periods as of 2026-09-06, and reports both gross and net bases with the discrepancy flagged rather than resolved.
- `src/lib/ai-agent/**`, `/api/ai/agent` and `AI-AGENT-README.md` are gone; `/api/ai/search` is gone or user-scoped with a hard table allowlist.
- `GET /api/ai/health` reports provider, model and a real failure reason; a dead key shows a banner in the UI and does not orphan the user's message into a replyless thread.
- The assistant is reachable from mobile, and "Ask about this" opens a seeded thread from a payroll period and from a job.
- The `estimate` and `client_update` skills are retired, threads on retired skills still open, and `BASE_SYSTEM` states the company correctly.
- `record_payment` works end to end from the payroll screen with a confirm card, and lands a row in `audit_logs` with the target table and row id.
- `create_time_entry` / `bulk_create_time_entries` work from a `timesheet` thread, default to 07:00–16:00 / 60 min / 8.00 hrs, **refuse a date inside a processed or paid period**, refuse a duplicate worker+project+date, and the corrected "8 net hrs" is in the skill prompt.
- `attribute_receipt` sets `project_id` and only `project_id`; `list_unattributed_receipts` returns the currently-null ones.
- A short written summary of what changed, plus two things escalated rather than decided: **the gross-vs-net balance basis** (Wallace / Jay) and **whether terminated workers carrying balances are owed or written off** (Wallace).
