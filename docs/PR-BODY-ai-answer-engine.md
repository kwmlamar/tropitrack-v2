## The rule this is built on

**The AI must never do the arithmetic. It calls the same database function the screen calls.**

Two questions were two-thirds of all assistant usage — *"how much do we owe everyone"* and *"labour on [job]"* — and neither had a screen. A language model was the only way to get them, and it got them by adding up columns. On 2026-08-21 it answered the same question twice in one day with two different totals.

Meanwhile the feature had been **dead since 2026-08-31** — the Anthropic key ran out of credit, the UI said nothing, and the same question went into silence nine times over six days.

---

## What reconciles

`crew_balances()` checked against the live ledger, identically as the service role and under RLS as a real authenticated user:

| Figure | Value |
|---|---|
| Outstanding payroll, **net basis** (`net_pay - total_paid`) | **$14,186.71** |
| Outstanding payroll, **gross basis** (`gross_pay - total_paid`) | **$14,466.60** |
| Difference (NIB on 2 of 20 workers) | $279.89 |
| Pay periods carrying it | 15 |
| Oldest unpaid period start | 2026-04-18 |
| Uncovered time (hours in no pay period) | $0.00 — the Sept 6 backfill closed it |

**The brief's target of $14,186.71 is the net basis.** The current TypeScript uses gross, so it would have reported $14,466.60. Those two numbers had never been reconciled against each other before.

`project_labor_cost()` spot-checked: Twin Coves $270,908.58 (32.0% of budget), Laundromat $34,620.00 (no budget), Metal Roof $25,331.20 (26.7%).

---

## Part 1 — Two functions, four surfaces, one number

**`crew_balances(company)`** and **`project_labor_cost(project)`** — modelled on `dashboard_summary`: `SECURITY INVOKER`, `STABLE`, `SET search_path = public`, America/Nassau dates, each section in its own exception block.

Three deliberate departures from the TypeScript they replace:

1. **Both bases returned**, with a `basis_note` naming the difference. Not resolved here — see escalation 1.
2. **Entries inside a period marked `paid` are included.** The old TS filtered `pay_periods.status <> 'paid'`, silently dropping a part-paid worker the moment someone closed the period. One such entry exists today, worth $190.24.
3. **Uncovered time is time in *no* period**, not time after the last period end. The old rule missed hours in a *gap between* periods — exactly the shape of the $53k hole.

Surfaced on `/dashboard` (an "Owed to crew" tile beside "Owed to us", reusing `Tile` and the same tone thresholds), `/payroll` (an expandable per-worker panel), the job page Costs tab, and as two AI tools that are **thin RPC wrappers with no arithmetic in the handler**. `list_unpaid_workers` and `get_worker_unpaid` now project from `crew_balances` instead of keeping duplicate maths.

`project_labor_cost` uses `workers.hourly_rate` — a **crew wage cost**, never a client price. No rate card, no markup, no O&P.

## Part 2 — Legacy retired

- **Deleted** `src/lib/ai-agent/**` (11 files), `/api/ai/agent`, `AI-AGENT-README.md`. Verified first: zero callers in `src/`, and `ai_actions`/`ai_messages`/`ai_conversations` still hold 0 rows. This was 50+ tools including `delete_project` and `update_payment_instructions` on the service-role client with **no confirmation gate**.
- **`/api/ai/search` rewritten, not deleted.** Deletion was the brief's recommendation and either was allowed — but deleting takes the whole ⌘K modal and three supporting files with it. The rewrite closes the hole completely: the query runs on a **user-scoped client** (RLS applies to whatever the model picks) and a table outside a hard allowlist is **rejected**, not quietly run unscoped. Easy to remove instead if preferred.
- **`/api/ai/generate-description` left on OpenAI** — it is *not* the last OpenAI consumer (the receipt scanner uses it too), so dropping the dependency would break receipt scanning.

## Part 3 — The failure is now impossible to miss

- `src/lib/ai-config.ts` — one place that knows provider and model. `ANTHROPIC_MODEL` env var; `classifyAnthropicError()` returns `billing` / `auth` / `config` / `rate_limit` / `network`.
- **`GET /api/ai/health`** — authenticated, makes a real 1-token call, reports provider/model/key/latency/failure reason, and writes an `audit_logs` row every run.
- **Message ordering fixed.** The old route persisted the user's message, *then* called the provider, then 500'd — which is precisely why nine messages sat in threads looking ignored. Nothing is written until there is an answer to write.
- **Persistent offline banner** that names the cause and hands the user's text back to the composer.
- **Dashboard row** after 24h of failure, via a *separate* `dashboard_extra_checks()` function — `dashboard_summary` is untouched, as ruled.
- **Spend**: token counts per turn in `audit_logs`, surfaced as "AI this month" in Settings alongside a live health check.
- `.env.example` now carries the Anthropic vars. It previously had **no Anthropic entry at all**, which is part of why this was invisible.

## Part 4 — Where the work happens

Mobile bottom nav is now Home / Projects / Quick Add / **Claude** / More, and `/more → Workspace` leads with Claude. **Claude takes the Invoices slot** rather than becoming a sixth item — five fits a 375px bar, Invoices is still under More, and swapping back is one line.

**"Ask about this"** on the payroll period header, the crew-owed panel and the job labour panel, opening a thread with the ids already in the question and the pill lit. The text is *placed*, not auto-sent — navigating to a page shouldn't spend money on a call nobody pressed enter on.

## Part 5 — Tools, prompt, writes

`BASE_SYSTEM` corrected: ODS Construction (also trading as Whelsco), **Palmetto Point, Eleuthera**, working the length of the island, **"Built Right, Built to Last."** The invented "SB Construction", "Maple House property" and "central Eleuthera" are gone. Added as hard rules: never compute a total from raw rows; always give the as-of date and the basis; always show uncovered time as its own line; never price work.

**Four ledger skills**: `payroll`, `timesheet`, `receipts` (new), `job_status`. `estimate` and `client_update` retired — the two existing `estimate` threads still open and read via fallback to the default read-only prompt. The timesheet prompt's **"7am–4pm = 7 net hrs" is corrected to 8.00**, which is what 3,716 of 3,918 existing entries actually say. `job_status` is wired to `project_labor_cost` and explicitly forbidden from inventing a "% complete" that has no field behind it.

New writes, all `tier: "confirm"` with a `preview()`:

| Tool | Skill | Touches |
|---|---|---|
| `create_time_entry` | timesheet | new `time_entries` rows |
| `bulk_create_time_entries` | timesheet | new rows, ≤20, all-or-nothing |
| `attribute_receipt` | receipts | `receipts.project_id` **only** |

`record_payment`'s preview now names the worker, amount, period and the balance **before and after**.

**The two refusals are not overridable**, and the guard was validated against live data: all 51 `paid` and all 14 `processing` periods have payroll entries generated from them, and the single `open` period (2026-09-05 → 2026-09-11, containing today) has none. So it blocks exactly where a write would desync payroll, and lets today through.

`create_payroll_entry`, `void_payroll_entry`, `delete_payroll_entry` and `delete_pay_period` are untouched. **No existing row in `time_entries`, `payroll_entries`, `payment_transactions` or `pay_periods` is edited or deleted by anything here.**

---

## Two things escalated, not decided

**1. Gross vs net — the balance basis · Wallace and Jay.** `/payroll` pays on net; the AI tools reported gross; the gap is $279.89, entirely NIB on the 2 of 20 workers with `nib_enabled`. Every surface now leads with net and shows gross beside it *for consistency* — but which figure "what we owe" means is an owner ruling, not a schema decision. It is small now and grows with every worker put on NIB.

**2. Terminated workers carrying balances · Wallace.** There are **zero today**, so nothing is at stake — but the code had to decide and shouldn't decide silently. As built they are kept out of the headline, returned separately with their own totals, and labelled as an open question.

---

## ⚠️ Not verified

**`npm run build` and `npm run lint` were not run — Node is not installed on this machine** (no node/npm/pnpm/nvm/brew on PATH or findable; the user's own terminal shows the same). `node_modules/` exists but every `.bin` shim needs a Node runtime. **These must be run before merge.**

In place of a compiler: every `@/…` import in every changed file resolves; every symbol the registry imports exists as an export; brace/paren/bracket balance checked across all 25 changed TS/TSX files; and two spots in the chat route that leaned on TypeScript's definite-assignment and optional-chain narrowing were restructured since I couldn't confirm them. **That is not a green build.**

**Runtime paths not exercised**: `record_payment` end-to-end, and the assistant answering at all — both need a live Anthropic key, and the key being dead is the premise of this work. Run `GET /api/ai/health` first; if it returns `reason: "billing"`, that's the original bug, still there, now visible.

**Verified against the live database**: both functions applied and returning correct payloads; identical figures under RLS as a real user and as the service role; `EXECUTE` granted to `authenticated`; `dashboard_extra_checks` returning `[]`; 6 receipts currently unattributed; the pay-period status/entry correspondence behind the settled-period guard.

---

## Open question answered

**Should `job_status` keep a pill?** On the evidence, eventually no. It has no write tools and `project_labor_cost` carries `core`, so it loads in default mode anyway — the pill now buys one thing: a prompt forbidding an invented "% complete". Recommendation: keep it for now, fold that instruction into `BASE_SYSTEM`, drop the pill once you've seen whether anyone reaches for it.

Full write-up: `docs/SUMMARY-in-app-ai-rebuild.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
