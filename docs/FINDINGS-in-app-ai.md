# Findings — The "Claude" feature in TropiTrack

**Repo:** `tropitrack-v2` · **DB:** Supabase `rrqpwtggiirexptnhyqy` · **Date:** 2026-09-06
**Companion:** `docs/AGENT-BRIEF-in-app-ai.md`

---

## 1. There are three AI systems in this codebase, not one

| # | Surface | Provider | Path | Status |
|---|---|---|---|---|
| 1 | **Claude assistant** (`/assistant`) | Anthropic, `claude-sonnet-4-6` hardcoded | `/api/ai/chat` + `src/lib/ai-tools/` | Live design, **dead since Aug 31** |
| 2 | **Legacy agent** | OpenAI `gpt-4o-mini` | `/api/ai/agent` + `src/lib/ai-agent/` | Zero rows, zero callers, **route still open** |
| 3 | **Smart Search (⌘K)** + description generator | OpenAI `gpt-4o-mini` | `/api/ai/search`, `/api/ai/generate-description` | 2 searches, lifetime |

So the premise "it's powered by the OpenAI key" is only half right. The chat you see in the sidebar runs on **Anthropic**. OpenAI powers the two surfaces nobody uses.

### System 1 is the good one

`src/lib/ai-tools/` is genuinely well built and worth keeping:

- A **tool registry** (14 tools: 8 core reads, 1 cross-skill write, 5 payroll writes) with `tier` (`none` / `confirm` / `double-confirm`), `scope`, and `skills` on every descriptor.
- **Skill-scoped tool filtering** in the chat route: no active skill pill = reads only. Writes are literally not in the model's tool list unless the matching skill is on. That is the right shape — capability is withheld, not just discouraged by prompt.
- **Propose → confirm → write**: any tiered write is staged into `ai_pending_writes` with a rendered `preview()` summary and a 15-minute expiry; the model never commits. `double-confirm` requires the user to type an exact string.
- **Full audit**: every call lands in `audit_logs` with input, result, target table + row id, status, duration, confirmation mode. Cancels are logged as `denied`.
- Tools run through a **user-scoped Supabase client** (anon key + the caller's JWT), so RLS applies. Only auth and thread persistence use the service role.

That is the same propose/confirm/verify discipline Caye uses. It is the part of this feature that should survive.

### System 2 is dead code with a live door

`/api/ai/agent` is not referenced anywhere in `src/` outside its own route file. `ai_actions`, `ai_messages` and `ai_conversations` all hold **0 rows** — it has never run in production. But the route is deployed and any authenticated user can POST to it, and behind that door:

- It builds its Supabase client from **`SUPABASE_SERVICE_ROLE_KEY`** — RLS off.
- It exposes **50+ tools including `delete_project`, `delete_timesheet`, `update_company_info` and `update_payment_instructions`** (the bank details on client invoices).
- **There is no confirmation gate of any kind.** `tool_choice: "auto"`, execute, log after the fact.

Company scoping depends entirely on each tool remembering to add `.eq("company_id", …)`. Most do. That is a convention, not a boundary.

### System 3 leaks by construction

`/api/ai/search` asks GPT for a JSON query object and then runs it:

```ts
let query = supabase.from(table).select(safeSelect);          // service-role client
if (companyId && TABLES_WITH_COMPANY_ID.has(table)) {          // 7 tables only
  query = query.eq("company_id", companyId);
}
```

`table` is model-chosen. The allowlist is `time_entries, workers, projects, invoices, estimates, materials, clients`. If the model picks `payroll_entries`, `pay_periods`, `receipts`, `vendors`, `payments`, `profiles` or `companies` — all of which exist and are named in the schema prompt it was given — the query runs **unscoped on the service-role client**. Today ODS is effectively the only tenant, so it is latent rather than exploited. It is still a hole, in a feature used twice ever.

---

## 2. What the usage data actually says

All-time: **70 threads, 219 messages, ~187 AI tool calls, 1 write.**

**Who uses it**

| User | Threads | Tool calls |
|---|---|---|
| Jay (`jaysineus@`) | **64** | 181 |
| Lamar | 4 | 14 |
| Wallace | 2 | 0 |
| Omar | 0 | 0 |

Jay is 91% of the feature. That matches how the company actually divides: Jay is the one who lives in TropiTrack.

**What they ask** — of 45 sampled user messages:

- **~20** are literally *"How much do we owe everyone"* (and variants: "how much do we owe the guys", "what's the payroll total")
- **~10** are *"Labor on [job]"* / *"How much labor cost is on the metal roof job"*
- 1 is the interesting one: *"We have more money coming in tomorrow but we have 9000 now, what's the best way to divide this — keep in mind we paid Felix $1000 yesterday and I already logged it"*

Two questions are two-thirds of all usage.

**How deep the threads go**

52 of 70 threads are one exchange or less. 13 have a user message and **no reply at all**.

**When it broke**

| Date | Threads | Dead (no reply) |
|---|---|---|
| Aug 29 | 1 | 0 |
| **Aug 31** | 4 | **4** |
| Sep 1 | 1 | 1 |
| Sep 2 | 2 | 1 |
| Sep 4 | 2 | 2 |
| Sep 5 | 1 | 1 |

The last successful answer was **Aug 29**. Since Aug 31 every single message has gone unanswered — the Anthropic key ran out of credits and the UI says nothing. **Jay asked the same question into a dead box nine times over six days.** Nobody was told, nothing alerted, and the failure only surfaced because we went looking.

That is the single most damning fact in this report, and it is not an AI problem. It is an operations problem.

---

## 3. When it worked, it was good — and it found a real bug

The August answers hold up. It returned clean per-worker balance tables, per-job labour breakdowns with rates and hours, and on 2026-09-02 it said this about Felix:

> Outstanding payroll balance $1,660 · **Unbilled hours (since Jul 10) $3,360** · Total owed $5,020
> *"The unbilled side is 336 regular hours @ $10 not yet on a payroll entry."*

That is the uncovered-time bug — logged hours with no pay period covering them — spotted in August by the assistant, months before the September reconciliation put a number on it ($53,026.48 across four windows). No screen in the app showed that. The AI found it because it was the only thing reading across `time_entries` and `payroll_entries` at once.

**The counterweight:** on Aug 21 it answered "how much do we owe everyone" twice in one day with **two different totals** — Fanel at $5,515 in one, $4,715 in the other; Earnest $5,315 then $4,315. Some of that is real data changing between runs. Some of it is a language model doing arithmetic. Either way, the number Jay was shown was not reproducible, and the underlying ledger was wrong anyway until the Sept 6 backfill.

**AI over a broken ledger launders bad data into a confident table.** The ledger is only trustworthy as of Sept 6. That timing matters: it means an in-app assistant is worth building *now* in a way it wasn't in August.

---

## 4. The honest case for and against

**For.**

1. The top question — *who do we owe* — spans `payroll_entries`, `pay_periods` and time not yet covered by a period. **No screen in TropiTrack answers it.** The AI is currently the only thing that can.
2. It is where the data is. Claude-in-Cowork can reach this database, but only through Lamar's laptop and an MCP hop. Jay standing on the payroll screen needs an answer in the app.
3. Every call is audited with input, result and target row. That is better provenance than an answer given over WhatsApp.
4. It caught a $53k hole nobody was looking for.

**Against — and this is the part worth arguing with.**

1. **Two-thirds of the usage is two questions that should be screens, not chat.** Asking a language model to total a column costs money, adds five seconds, can't be reproduced, and already gave two different answers in one day. A SQL function is instant, free, deterministic and correct. Chat is the wrong tool for a question asked twenty times.
2. **One write, ever — and it was a June test.** The propose/confirm machinery is excellent and completely unexercised. Building more write tools before one write path is proven in daily use is building on nothing.
3. **Three AI systems, two providers, one unmonitored budget.** The feature died from a billing failure with no health check, no alert and no error message. Adding capability without fixing that just gives you more surface to die silently.
4. **Wallace and Omar will not open a web app.** Wallace has 2 threads and 0 tool calls; Omar has none. Building the in-app assistant to serve Wallace is building for a user who isn't there — that's Caye's job on WhatsApp. Build this one for Jay and Lamar.
5. **The assistant is not in the mobile navigation at all.** Mobile nav is Home / Projects / Quick Add / Invoices / More, and `/more` lists twelve destinations, none of them the assistant. On a phone this feature does not exist.

---

## 5. Recommendation

The rule already written into the ODS decision log applies here: **Claude authors, Caye watches, TropiTrack remembers, Dropbox keeps.**

So the in-app AI should be **TropiTrack's reader and explainer, plus one narrow write path** — not a fourth author. Estimates, invoices and client letters are authored in Claude/Cowork where the ODS skills live and where the house formats are already correct. Proactive watching belongs to Caye on WhatsApp. What TropiTrack's own assistant should do is answer questions about the ledger it holds, and let Jay record the handful of facts he is standing in front of.

Five moves, in order:

**1. Move the two top questions out of chat and into SQL.**
Build `crew_balances(company)` and `project_labor_cost(project)` as Postgres functions, in the same shape as the existing `dashboard_summary(company)`. Surface them as a dashboard tile and a job-page panel. **Then give the AI those same functions as tools.** The arithmetic happens once, in the database. The screen and the chat return the identical number because they call the identical function. The model's job is to choose the function and explain the result — never to add up a column.

**2. Retire the legacy surfaces.** Delete `/api/ai/agent` and `src/lib/ai-agent/**`. Delete or rewrite `/api/ai/search`. One AI provider, one tool registry, one confirmation model.

**3. Fix what actually killed it.** Model and provider in env vars. A health endpoint. A spend counter off `audit_logs`. And a visible in-app error — "Claude is offline" — so nobody ever again talks to a dead box for six days.

**4. Put it where Jay works.** Mobile nav, and an "Ask about this" button on the payroll period screen and the job page that opens a thread already seeded with that period or job. A context-seeded thread beats a blank text box.

**5. Prove exactly one write end to end.** `record_payment`, from the payroll screen, with the confirm card. That is Jay's August question — *"I have 9k, what's the best way to split this, we paid Felix $1000 yesterday"* — and it is the one write worth having. Nothing else until that one is used weekly.

### Which skills belong in the app

Lamar's rule, stated 2026-09-06: **TropiTrack is where the facts live, so its in-app skills should be ledger skills.** If a skill produces a document, it belongs in Claude/Cowork. If it reads or writes a fact, it belongs here.

That retires two of the five:

- **`estimate`** — its embedded rates ("$15-18/hr general, $20-28 skilled", flat 15% overhead) contradict the ODS rate card (Wallace $75 / Omar $70 / Jay $60 / other $45, 30% O&P already baked in), and it carries no Bahamian landed cost at all: no 25-45% duty, no 10% VAT, no 1% CPF, no freight. Two threads have ever used it. A second, wrong pricing brain inside the app is a liability.
- **`client_update`** — pure authoring. The house voice and format live in the ODS Claude skills; there is no reason for a second copy here.

Three survive, all ledger operations: **payroll**, **timesheet**, **job_status**.

`job_status` needs work to earn its place — its current prompt asks the user what has been completed, because nothing feeds it. `project_labor_cost` gives it a real fact source, but "% complete" still has no field behind it. Either derive it from the schedule or drop the percentage and report labour, schedule and blockers only.

The landed-cost gap is a much larger money item than anything in this document, but it is an estimating problem blocked on Wallace's decision, not an in-app AI problem. Don't let this work stand in for it.
