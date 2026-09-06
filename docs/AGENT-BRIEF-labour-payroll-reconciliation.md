# Agent Brief — Labour vs Payroll Reconciliation (READ-ONLY INVESTIGATION)

**Database:** Supabase project `rrqpwtggiirexptnhyqy` (TropiTrack-V2 / Bedrock), schema `public`
**Company:** ODS Construction, Governors Harbour, Eleuthera, Bahamas. Currency BSD, 1:1 with USD.
**Output:** a written findings report. **No writes. No migrations. No "fixes".**

---

## THE ABSOLUTE CONSTRAINT

**This is a read-only forensic task.** You may run `SELECT` only. You must not run `INSERT`, `UPDATE`, `DELETE`, `ALTER`, `CREATE`, or any migration, and you must not "correct" a single row no matter how obviously wrong it looks. If you believe a row is wrong, that belongs in your report, not in the database.

The reason is not caution for its own sake: this is a live payroll ledger for real people's wages, and the whole point of the exercise is to establish what the numbers currently say. An agent that fixes as it goes destroys the evidence it was sent to gather.

---

## The discrepancy to investigate

Two figures that should reconcile, don't:

| | |
|---|---|
| Labour value implied by `time_entries` × worker rate, for dates on/after 2025-10-18 | **$243,847.46** |
| Gross payroll actually recorded in `payroll_entries` for the same window | **$187,876.02** |
| **Unexplained gap** | **≈ $55,971** |

(2025-10-18 is the start of the earliest pay period. Time entries begin 2025-05-31, so ~4.5 months of logged time pre-dates payroll entirely — that earlier period accounts for a further ~$136,959 and is expected, not part of this question.)

Note the direction. Overtime should push payroll *above* a flat-rate estimate of the same hours, not below it. So the gap is larger than it looks, not smaller.

## The question

**Where does the $55,971 go?** Specifically — is every hour logged in `time_entries` actually reaching a pay period and a `payroll_entry`, and if not, which ones aren't and why?

## Hypotheses to test (test all; do not stop at the first that fits)

1. **Orphaned time.** Time entries in the window that belong to no pay period at all — no `pay_periods` row covers their date, or one does but no `payroll_entry` was generated for that worker/period. Quantify hours and value, and list the worst offenders by worker and by date range.
2. **Rate drift.** `workers.hourly_rate` is a *current* rate. If rates changed over the period, a flat current-rate calculation misstates history. Determine whether `payroll_entries` stores the rate used at the time (check the columns), and if so, recompute the labour value using period-accurate rates and report how much of the gap that explains.
3. **Overtime treatment.** Establish how `payroll_entries` actually computes gross from `regular_hours` and `overtime_hours` — find the calculation in the app code (`src/app/(dashboard)/payroll/`, `src/lib/`) rather than assuming a 1.5× multiplier. Report the real rule and whether it is applied consistently.
4. **Non-payroll labour.** Some workers may be subcontractors or otherwise paid outside payroll. Look for workers with time entries but no payroll entries at all, and for any status/type field that distinguishes them.
5. **Duplicate or inflated time entries.** Check for the same worker double-logged on the same date/project, entries with implausible hours, and entries created in bulk (compare `created_at` clustering against `date`).
6. **Coverage gaps in `pay_periods`.** Are there calendar weeks in the window with logged time and no pay period row at all? List them.

## Also quantify, separately (do not conflate with the above)

The 14 pay periods with `status = 'processing'` are each **partially** paid:
net due **$54,476.65**, recorded in `payment_transactions` **$39,100.18**, difference **$15,376.47**.
Report this per period and per worker: who is short, by how much, since when. This is a distinct issue from the labour/payroll gap — keep the two apart in your report and do not let one explain away the other.

## Method notes

- `time_entries` has 3,910 rows and none are orphaned from a project, so project linkage is not the problem — worker and pay-period linkage is where to look.
- Read the app's own payroll code before trusting any assumption about how gross, NIB, overtime or net are derived. The code is the specification here.
- Show your SQL for every figure you report, so a person can re-run it.
- Where you cannot determine something from the database, say so plainly rather than estimating.

## Report format

1. **Bottom line** — one paragraph: what accounts for the $55,971, in order of size.
2. **Explained portion** — each cause, the dollars it accounts for, and the query proving it.
3. **Unexplained residual** — what's left, and what information (outside the database) would be needed to close it.
4. **The partial-payment picture** — per period and per worker, who is owed what.
5. **Data defects found** — a plain list of rows that look wrong, with ids. **Do not fix them.**
6. **Recommendations** — what should change in the app or the process so this cannot silently recur.

Write the report to `docs/FINDINGS-labour-payroll-reconciliation.md`. That file is the only thing you create.
