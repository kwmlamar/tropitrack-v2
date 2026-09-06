# Summary — the in-app AI, rebuilt as an answer engine

**Branch:** `feat/ai-answer-engine` · **DB:** Supabase `rrqpwtggiirexptnhyqy` · **Date:** 2026-09-06
**Reads on from:** `docs/FINDINGS-in-app-ai.md`, `docs/AGENT-BRIEF-in-app-ai.md`

---

## The one sentence

The two questions that were two-thirds of all assistant usage are now answered by
Postgres functions that also back screens, so the chat and the page return the
same number by construction; the legacy agent that could delete projects on the
service-role client is gone; and the failure that killed this feature for six
days now shows up as a banner, a health endpoint and a dashboard row.

---

## What reconciles

`crew_balances()` was checked against the ledger as of 2026-09-06, both as the
service role and under RLS as a real authenticated user. Identical either way:

| Figure | Value |
|---|---|
| Outstanding payroll, **net basis** (`net_pay - total_paid`) | **$14,186.71** |
| Outstanding payroll, **gross basis** (`gross_pay - total_paid`) | **$14,466.60** |
| Difference (NIB on 2 workers) | $279.89 |
| Pay periods carrying it | 15 |
| Oldest unpaid period start | 2026-04-18 |
| Workers owed | 9 of a 20-person roster |
| Uncovered time (hours in no pay period) | **$0.00** — the Sept 6 backfill closed it |
| Terminated workers still owed | 0 |

**The brief's reconciliation target of $14,186.71 is the net basis.** That is
worth stating plainly, because the brief also says the current TypeScript uses
gross — and it does, which is why it would have reported $14,466.60. The two
numbers were never reconciled against each other before now. See the escalation
below.

`project_labor_cost()` spot-checked on the three jobs with the most labour:
Twin Coves $270,908.58 (32.0% of budget), Laundromat $34,620.00 (no budget set),
Metal Roof $25,331.20 (26.7%) — the last being the job Jay kept asking about.

---

## Part 1 — Two functions, four surfaces, one number

**`public.crew_balances(p_company_id uuid)`** · `supabase/migrations/20260906120000_crew_balances.sql`

Per worker and company-wide: outstanding payroll, uncovered time, total owed.
Modelled on `dashboard_summary` — `SECURITY INVOKER`, `STABLE`,
`SET search_path = public`, America/Nassau dates, each section in its own
exception block.

Three deliberate departures from the TypeScript it replaces:

1. **Both bases returned**, plus a `basis_note` naming the difference. Not
   resolved here — see escalation 1.
2. **Entries inside a period marked `paid` are included.** The old TS filtered
   `pay_periods.status <> 'paid'`, silently dropping a part-paid worker the
   moment someone closed the period. One such entry exists today, worth $190.24.
3. **Uncovered time is time in *no* period**, not time after the last period
   end. The old rule missed hours sitting in a *gap between* periods, which is
   exactly the shape of the $53k hole.

Terminated workers with a balance are returned in their own
`terminated_with_balance` array and their own totals, never folded away.

**`public.project_labor_cost(p_project_id uuid)`** · `…20260906120100_project_labor_cost.sql`

Per worker: days, regular/OT hours, rate, cost; plus totals and cost against
budget and contract. Uses `workers.hourly_rate` — a **crew wage cost**, never a
client price; no ODS rate card, no markup, no O&P. Zero-hour entries are counted
and excluded from cost, and the payload says so. The absence of a historical rate
table is a note in the payload, rendered by both the panel and the assistant.

**Surfaced on:**

- `/dashboard` — an **Owed to crew** tile beside Owed to us, reusing `Tile` and
  the same `oldest_days` tone thresholds. Headline net, gross stated underneath,
  uncovered time and terminated balances as their own tinted lines.
- `/payroll` — `CrewOwedPanel`, a summary strip that expands into the per-worker
  table, with the basis note and rate caveat printed under the numbers.
- Job page → Costs tab — `ProjectLabourPanel`.
- Chat — `crew_balances` and `project_labor_cost` tools, thin RPC wrappers with
  **no arithmetic in the handler**.

`list_unpaid_workers` and `get_worker_unpaid` now project from `crew_balances`
instead of keeping their own duplicate maths. `get_worker_unpaid`'s hand-rolled
NIB estimate is gone — it was inventing a figure the ledger already holds.

---

## Part 2 — Legacy retired

- **Deleted:** `src/lib/ai-agent/**` (11 files), `src/app/api/ai/agent/route.ts`,
  `AI-AGENT-README.md`. Verified before deleting: zero callers anywhere in `src/`,
  and `ai_actions` / `ai_messages` / `ai_conversations` all still hold 0 rows.
  This was 50+ tools including `delete_project` and `update_payment_instructions`
  on the service-role client with no confirmation gate.
- **`/api/ai/search` — rewritten, not deleted.** Deletion was the brief's
  recommendation and the "done when" allowed either. I took the rewrite: deleting
  it takes the whole ⌘K modal, `search-view`, `use-search-view` and
  `search-history` with it, which is a lot of churn to remove a hole that the
  rewrite closes completely. The query now runs on a **user-scoped client** (anon
  key + caller JWT, so RLS applies to whatever the model picks), and a table
  outside a hard `ALLOWED_TABLES` set is **rejected with an error** rather than
  quietly run unscoped. If you would still rather it were gone, say so — it is a
  clean removal from here.
- **`ai_actions` / `ai_messages` / `ai_conversations` left in place** as empty
  tables, per the brief. Droppable whenever you want.
- **`/api/ai/generate-description` left on OpenAI.** The brief said to port it if
  it were the last OpenAI consumer. It is not — `src/lib/ocr/enhanced-receipt-parser.ts`
  (the receipt scanner) also uses OpenAI, so dropping the dependency would break
  receipt scanning. Two providers remains the honest state, and `.env.example`
  now says which is which.

---

## Part 3 — The failure is now impossible to miss

This is the part that actually killed the feature, and it was treated as
load-bearing.

- **`src/lib/ai-config.ts`** — one place that knows the provider and model.
  `ANTHROPIC_MODEL` env var (default `claude-sonnet-4-6`), plus
  `classifyAnthropicError()` which turns a provider response into
  `billing` / `auth` / `config` / `rate_limit` / `network` / `unknown`.
- **`GET /api/ai/health`** — authenticated; makes a real 1-token call and reports
  provider, model, key presence, latency and a typed failure reason. Every run
  writes an `audit_logs` row.
- **Message ordering fixed.** The old route persisted the user's message, *then*
  called the provider, then returned a 500. That is precisely why nine messages
  sat in threads looking ignored. Now the thread is not created and nothing is
  written until there is an answer to write; on failure the response carries
  `offline: true` and a structured failure.
- **Offline banner** in the assistant — persistent, names the cause, and the
  client pulls the optimistic bubble back out and returns the user's text to the
  composer.
- **Dashboard row.** `dashboard_extra_checks()` raises a destructive
  `ai_offline` row once the health check has been failing for more than 24 hours.
  It is a **separate function** concatenated client-side — `dashboard_summary` is
  untouched, as ruled.
- **Spend.** The chat route logs a `claude_chat` audit row per turn with input and
  output token counts. Settings → AI Features leads with an `AiStatusPanel`:
  live health check, conversations, tool calls, tokens and an estimated spend
  clearly labelled as an estimate at list pricing. Turns before this shipped have
  no token counts and the panel says so rather than under-reporting silently.
- **`.env.example`** now carries `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` and
  `ANTHROPIC_MAX_TOKENS`. It previously had no Anthropic entry at all.

---

## Part 4 — Where the work happens

- **Mobile bottom nav**: Home / Projects / Quick Add / **Claude** / More.
  Claude takes the Invoices slot rather than becoming a sixth item — five is what
  fits a 375px bar, and billing a client is a desk task while asking what a job
  cost is not. **Invoices is still under More → Workspace, and swapping them back
  is a one-line change** if you disagree.
- **`/more` → Workspace** now leads with Claude.
- **"Ask about this"** (`src/components/ai/ask-about-this.tsx`) on the payroll
  period header, the crew-owed panel and the job labour panel. It opens
  `/assistant?skill=…&ask=…` with the ids already in the question and the pill
  lit. **The text is placed in the composer, not auto-sent** — navigating to a
  page should not spend money on a call nobody pressed enter on.

---

## Part 5 — Tools, prompt, writes

**Prompt.** `BASE_SYSTEM` corrected: ODS Construction (also trading as Whelsco),
**Palmetto Point, Eleuthera**, working the length of the island, tagline
**"Built Right, Built to Last."** The invented "SB Construction", "Maple House
property" and "central Eleuthera" are gone. Added as hard rules: never compute a
total from raw rows; always give the as-of date and the basis; always show
uncovered time as its own line; never price work or apply markup. Tone rules and
the never-name-the-team rule kept verbatim.

**Skills: four.** `payroll`, `timesheet`, `receipts` (new), `job_status`.
`estimate` and `client_update` retired from both `SKILLS` and `SKILL_PROMPTS`.
The two existing `estimate` threads still open and read — an unrecognised
`skill_id` falls through to the default read-only prompt, verified in the code
path and against the 2 rows in `ai_threads`.

- The **timesheet prompt's "7am–4pm with 1hr lunch = 7 net hrs" is corrected to
  8.00**, which is what 3,716 of 3,918 existing entries actually say.
- **`job_status` now has a fact source** — wired to `project_labor_cost`,
  `list_time_entries` and `get_project`, and explicitly forbidden from inventing
  a "% complete" that has no field behind it.

**New reads:** `crew_balances`, `project_labor_cost`, `list_unattributed_receipts`
— all `tier: "none"`.

**New writes — all `tier: "confirm"`, all with a `preview()`:**

| Tool | Skill | Touches |
|---|---|---|
| `create_time_entry` | timesheet | new `time_entries` rows |
| `bulk_create_time_entries` | timesheet | new `time_entries` rows, ≤20, all-or-nothing |
| `attribute_receipt` | receipts | `receipts.project_id` **only** |

`record_payment` (existing) got a preview that now names the worker, the amount,
the period, and the balance **before and after**, flagging when a payment clears
the entry.

Time entries mirror `quick-time-entry.tsx` exactly: 07:00 start, 60-minute break,
8.00 regular hours, end time from `7 + hours + 1`, overtime past 8 with regular
capped. `approved_by`/`approved_at` stay null.

**The two refusals are not overridable.** The settled-period guard blocks
`processing` / `processed` / `paid`. That was validated against the live data:
all 51 `paid` and all 14 `processing` periods have payroll entries generated from
them, and the single `open` period (2026-09-05 → 2026-09-11, which contains
today) has none. So the guard blocks exactly the periods where a new time entry
would desync payroll, and lets today through. The duplicate guard returns the
existing row and needs an explicit `allow_duplicate` after the user has seen it.

`create_payroll_entry`, `void_payroll_entry`, `delete_payroll_entry` and
`delete_pay_period` were left exactly as they were. No existing row in
`time_entries`, `payroll_entries`, `payment_transactions` or `pay_periods` is
edited or deleted by anything added here.

---

## Two things escalated, not decided

### 1. Gross vs net — the balance basis · **Wallace and Jay**

Today the same question has two right answers, and which one is quoted depends
on where you ask:

- **`/payroll` pays on the net basis.** Its Pay buttons compute
  `net_pay - total_paid`.
- **The AI tools reported gross.** `gross_pay - total_paid`.
- The gap is **$279.89**, entirely NIB on the **2 of 20** workers with
  `nib_enabled`. For those two, gross overstates what actually gets handed over.

`crew_balances()` returns both and states the difference in every payload. The
dashboard tile, the payroll panel and the assistant all lead with **net** and show
gross beside it, on the grounds that net is what the paying screen already uses —
but that is a display choice made to be consistent, not a ruling. **The decision
needed is which figure "what we owe" means**, and it should be made once and
applied everywhere. It is a small number now; it grows with every worker put on
NIB.

### 2. Terminated workers carrying balances · **Wallace**

**There are zero today**, so nothing is currently at stake — but the code had to
decide what to do with them and I would not have it decide silently. As built:
they are excluded from the headline roster total, returned separately in
`terminated_with_balance` with their own totals, and rendered as a tinted line
saying "whether these are owed or written off is an open question". **The decision
needed is whether a balance owed to someone who has left is a debt or a
write-off.** Until that is answered the number stays visible and stays out of the
headline, which is the only honest place to park it.

---

## What I could not verify, and why

**`npm run build` and `npm run lint` were not run. Node is not installed on this
machine** — no `node`, `npm`, `pnpm`, nvm, volta or homebrew on `PATH` or
anywhere findable, and the user's own terminal shows the same (`/opt/homebrew/bin/brew:
no such file or directory`). `node_modules/` exists but every `.bin` shim needs a
Node runtime to execute. **These need to be run before this branch merges.**

In place of a compiler I did a static pass: every `@/…` import in every changed
file resolves to a real path; every symbol the registry imports exists as an
export; brace/paren/bracket balance checked across all 25 changed TS/TSX files
(the one flag was a false positive in my own checker — a `https://` URL tripping
its comment-stripping regex; that file is 13/13 raw). I also restructured two
spots in the chat route that leaned on TypeScript's definite-assignment and
optional-chain narrowing, since I could not confirm them. **That is not the same
as a green build and should not be read as one.**

**Runtime paths not exercised:** `record_payment` end-to-end from the payroll
screen, and the assistant answering at all. Both need a live Anthropic key, and
the key being dead is the premise of this whole piece of work. `GET /api/ai/health`
is the thing to run first once a key is in place — if it comes back `ok: false`
with `reason: "billing"`, that is the original bug, still there, now visible.

**What was verified against the live database:** both functions applied and
returning correct payloads; identical figures under RLS as a real authenticated
user and as the service role; `EXECUTE` granted to `authenticated`;
`dashboard_extra_checks` returning `[]`; 6 receipts currently unattributed;
the pay-period status/entry correspondence behind the settled-period guard.

---

## Open question you asked me to answer

**Should `job_status` keep a pill?** On the evidence, no — but not yet.

It has no write tools, and `project_labor_cost` carries `core` in its skills, so
it is loaded in default mode anyway. Functionally the pill now buys one thing: a
prompt that forbids inventing a "% complete". That is worth something, given the
old prompt invited exactly that. Five threads have used it.

My recommendation: keep it for now, fold the anti-percentage instruction into
`BASE_SYSTEM`, and drop the pill once you have seen whether anyone reaches for it
after the change. Three pills that each gate a real write is a cleaner story than
three plus one that gates a paragraph.
