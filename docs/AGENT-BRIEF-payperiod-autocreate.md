# Agent Brief — Automatic Pay Period Creation + Job Creation Write-Through

**Repo:** `tropitrack-v2` · **DB:** Supabase `rrqpwtggiirexptnhyqy` · **Branch:** `feat/period-autocreate`
**Read first:** `docs/FINDINGS-labour-payroll-reconciliation.md`

---

## Part 1 — The bug that matters (do this first)

`pay_periods` rows are created by hand, via the **"+ New Period"** button on `/payroll`. When nobody clicks it, the week silently vanishes: crew log time, no period covers those dates, no `payroll_entry` is ever generated, and nothing anywhere says a week is missing.

It has happened four times, costing **4,200 hours / $53,026.48** of labour that never reached payroll:

| Window missing | Days |
|---|---|
| 2025-11-01 → 2025-11-14 | 14 |
| 2025-11-22 → 2025-12-05 | 14 |
| 2025-12-13 → 2026-01-09 | 28 |
| 2026-08-22 → 2026-08-28 | 7 |

**Build:** pay periods generate themselves on a fixed weekly cadence (Sat→Fri, matching the existing rows) instead of waiting for a human.

- Add a scheduled job — Supabase `pg_cron` + an edge function, matching the pattern already in `supabase/functions/` — that runs weekly and creates the next `pay_periods` row for every company if one does not already exist.
- **Backfill safety:** on each run, also detect any *gap* between the latest `end_date` and today and create the missing periods, so a lapse self-heals instead of accumulating.
- Do **NOT** backfill the four historical windows above. Those are a money decision for Wallace, not an automation. Detect and report them only.
- Creating a period must never generate `payroll_entries` automatically — period creation is structural, payroll runs stay human-triggered.

**Also fix the boundary bug:** two adjacent periods currently share an inclusive boundary date, which paid 7 workers twice for 2026-04-03 (**$635.04**). Find the period-generation and payroll-calculation code, make date ranges half-open or otherwise non-overlapping, and add a constraint or check that prevents two non-voided periods for one company from overlapping. Report the existing overlap; do not edit the historical rows.

**Add a dashboard check** to the existing Needs Attention panel: *"{n} weeks of logged time with no pay period"* — so this can never again be invisible.

## Part 2 — Job creation writes the record

Today a job can begin life in a Claude conversation, in Dropbox, or in TropiTrack, and only sometimes becomes a `projects` row. Make TropiTrack the place a job's identity is minted.

- Review `/projects/new`. Make `client_id`, `location` and `contract_value` required at creation (25 of 25 projects should link to a client; 1 currently doesn't, and 8 have no budget).
- Add an idempotent API route — `POST /api/projects` — that creates a project from a JSON payload and **returns the row including its id**. It must be safe to call twice with the same job (match on name + client) and return the existing row rather than a duplicate. This is what an outside caller (a Claude skill, or Caye) will use so a job is never created in two places.
- Authenticate it the same way the rest of the app's API routes are authenticated — find the existing pattern, don't invent one.

### Deferred — design but DO NOT build

A Supabase database webhook on `projects` INSERT → edge function → Dropbox API → create the project folder tree.

**Dropbox is off limits in this work.** The folder convention has not been decided by the owner and there are currently two competing ones in use. Write the design into `docs/DESIGN-dropbox-folder-sync.md` — webhook config, the edge function shape, where the Dropbox token would live, what the folder template would be, and how a rename would be handled — and stop there. No Dropbox API calls, no credentials, no folder creation.

## Constraints

- No changes to `time_entries`, `payroll_entries`, `payment_transactions`, or any historical `pay_periods` row.
- Migrations are additive only. `security invoker`, RLS respected.
- Stay inside the existing design tokens (see `docs/DESIGN-SYSTEM.md` and `tailwind.config.ts`); no new colors or dependencies.
- `npm run build` and `npm run lint` clean.

## Done when

- A missing week creates itself, and a lapse self-heals on the next run.
- Two periods can no longer overlap.
- The dashboard reports uncovered weeks of logged time.
- `POST /api/projects` exists, is idempotent, and returns the id.
- `docs/DESIGN-dropbox-folder-sync.md` exists and nothing in Dropbox was touched.
- A short summary of what changed, plus the four historical windows and the April overlap listed as outstanding owner decisions.
