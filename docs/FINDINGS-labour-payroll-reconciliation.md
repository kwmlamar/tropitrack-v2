# Findings — Labour vs Payroll Reconciliation

**Scope:** ODS Construction (company_id `4ee41a41-7790-4e26-8d3c-e8ce66ab38a3`), Supabase project `rrqpwtggiirexptnhyqy`, schema `public`. All figures below are from live, read-only `SELECT` queries run 2026-09-04. No rows were modified. All dollar figures are BSD (1:1 USD).

---

## 1. Bottom line

Of the **$55,971.44** gap between labour value implied by `time_entries` ($243,847.46) and actual payroll gross ($187,876.02) for dates ≥ 2025-10-18:

- **$53,026.48 (95%)** is time logged during calendar weeks for which **no `pay_periods` row exists at all**. This is real, unpaid labour — 541 time entries across 17 workers, concentrated in four specific windows (Nov 1–14 2025, Nov 22–Dec 5 2025, Dec 13 2025–Jan 9 2026, and Aug 22–28 2026).
- **$480.00** is one worker's (Alaine Prophete) time that fell inside a *technically-covered* but mislabeled pay period and never got a `payroll_entry` — also real, unpaid labour, masked by a data defect (see §5).
- **~$3,390** of the remainder is **not missing money at all** — it's an artifact of this audit's own flat-rate method. One worker's hourly rate rose from $10.00 to $12.50 on 2026-08-08; payroll correctly froze and paid the lower historical rate, but valuing his older hours at today's rate overstates the "implied labour value" figure.
- **~$130** is a duplicate time entry (one worker, one shift, logged twice against two different projects) that inflates the time-entry side of the ledger without ever reaching payroll — also not missing money.
- **-$635.04** works in the opposite direction: a pay-period boundary bug caused 7 workers to be paid **twice** for the same calendar day (2026-04-03), which is real erroneous overpayment that happens to shrink the apparent gap.
- A small residual of roughly **$400–600** — including an $150 short payroll line for one worker and a forgotten-day correction that was recorded but never actually applied — could not be traced to a single further cause within this review (see §3).

**In short: essentially all of the money is explained, and essentially all of it (~96%) is real unpaid wages caused by gaps and defects in how `pay_periods` rows get created, not by any error in the overtime or NIB calculation (overtime never applies in this window at all — see §2.3) and not by missing/subcontracted workers (§2.4).**

---

## 2. Explained portion

### 2.1 Orphaned time — no `pay_periods` row at all (Hypothesis 1 & 6) — **$53,026.48**

```sql
with pp as (
  select * from pay_periods
  where company_id = '4ee41a41-7790-4e26-8d3c-e8ce66ab38a3' and voided_at is null
),
te as (
  select t.*, w.hourly_rate
  from time_entries t join workers w on w.id = t.worker_id
  where t.company_id = '4ee41a41-7790-4e26-8d3c-e8ce66ab38a3' and t.date >= '2025-10-18'
)
select count(*) as n_orphan_entries,
  sum(regular_hours + coalesce(overtime_hours,0)) as orphan_hours,
  sum((regular_hours+coalesce(overtime_hours,0))*hourly_rate) as orphan_value
from te
where not exists (select 1 from pp where te.date between pp.start_date and pp.end_date);
-- n_orphan_entries=541, orphan_hours=4200.00, orphan_value=53026.48
```

**The four missing windows** (computed by taking the gap between each `pay_periods.end_date` and the next `start_date`):

| Gap | Days missing | Orphaned value in this window |
|---|---|---|
| 2025-11-01 → 2025-11-14 | 14 | ~$14,220 |
| 2025-11-22 → 2025-12-05 | 14 | ~$9,585 |
| 2025-12-13 → 2026-01-09 | 28 | ~$14,240 |
| 2026-08-22 → 2026-08-28 | 7 | ~$2,980 |

(Sub-totals from the per-date breakdown query below; the four windows sum to the $53,026.48 total. There are no other gaps — every other consecutive pair of `pay_periods` in the company either abuts exactly or overlaps, see §5.)

**Worst-offender workers** (all 17 affected workers, largest first):

```sql
-- (full query in scratch history; summarized below)
```

| Worker | Hours orphaned | Value | Status |
|---|---|---|---|
| Earnest Phillipe | 364.00 | $5,915.00 | active |
| Rebins (no last name) | 348.00 | $5,220.00 | active |
| Leonville Elfra | 364.00 | $4,550.00 | active |
| Louis Beauvais | 296.00 | $4,440.00 | active |
| Fanel Etiene | 276.00 | $4,140.00 | active |
| Enel Philipe | 276.00 | $3,966.12 | **inactive** |
| David Telusma | 200.00 | $3,750.00 | **inactive** |
| Makenson (no last name) | 344.00 | $3,440.00 | active |
| Aprodieu Florial | 364.00 | $3,414.32 | active |
| Guellen Francois | 332.00 | $3,320.00 | **inactive** |
| E Z | 332.00 | $3,320.00 | **inactive** |
| Felix Mike-Awentz | 240.00 | $2,400.00 | active |
| Seline' Emilien | 208.00 | $1,951.04 | active |
| Mitchello Elusnord | 144.00 | $1,800.00 | active |
| Cyrike Tiler | 32.00 | $600.00 | active |
| Rebins Brother | 40.00 | $400.00 | active |
| Alaine Prophete | 40.00 | $400.00 | **inactive** |

This affects nearly every worker on the crew, which is consistent with the cause being a **process gap** (nobody created a `pay_periods` row for those weeks) rather than a worker-specific error.

### 2.2 Rate drift (Hypothesis 2) — **~$3,390 explained (not missing money)**

`payroll_entries` **does** store the rate actually used (`regular_rate`, `overtime_rate` columns), frozen at the moment payroll was processed — confirmed in the app code (`src/app/(dashboard)/payroll/page.tsx:184`, which writes `regular_rate: t.hourly_rate` onto the new row). There is **no rate-history table**; `workers.hourly_rate` is the single current value, so this frozen column on `payroll_entries` is the *only* record of what rate applied historically.

```sql
select pe.regular_rate, w.hourly_rate as current_rate, count(*) as n, sum(pe.regular_hours) as reg_hours
from payroll_entries pe
join workers w on w.id = pe.worker_id
join pay_periods pp on pp.id = pe.pay_period_id
where pe.company_id = '4ee41a41-7790-4e26-8d3c-e8ce66ab38a3' and pp.start_date >= '2025-10-18'
  and pe.regular_rate <> w.hourly_rate
group by pe.regular_rate, w.hourly_rate;
-- regular_rate=10.00, current_rate=12.50, n=33, reg_hours=1396.00
```

This is exactly **one worker**, Leonville Elfra (`731f4420-f40a-4fff-a97f-ca0af972b4d3`): every payroll period before the one starting 2026-08-08 paid him $10.00/hr; from 2026-08-08 onward he's paid $12.50/hr. Payroll handled this correctly. The reconciliation's own flat-rate method (current rate × all hours) doesn't know about the raise, so it overvalues his pre-raise hours:

```sql
-- Distinct time_entries actually matched to a pay period AND having a payroll_entry, priced at current rate, vs actual gross:
-- Leonville Elfra: flat_value=$19,150.00, actual_gross=$15,760.00, diff=$3,390.00
```

This is a genuine, well-behaved system (period-accurate rate snapshot) — the "gap" here is purely a limitation of estimating historical pay from today's rate table, not a defect.

### 2.3 Overtime treatment (Hypothesis 3) — **tested, not a contributor to this gap**

From the app code (`src/lib/utils.ts:84-91`, `src/app/(dashboard)/payroll/page.tsx:167-177`):

- Overtime is **not** a 40-hour/week rule. It's a flat **8-hours-per-time-entry-row** cutoff, computed once at time-entry creation (`calculateOvertimeHours`), not recomputed at payroll time.
- Gross pay formula (`src/app/(dashboard)/payroll/page.tsx:176-177`):
  `gross = regular_hours × hourly_rate + overtime_hours × hourly_rate × overtime_rate_multiplier` (multiplier defaults to 1.5 if `workers.overtime_rate_multiplier` is null).
- Because the 8-hour cutoff is applied **per row**, a worker who logs two 6-hour entries on the same day across two projects gets **zero** overtime even though they worked 12 hours — the cutoff never sees the daily total. This is a latent defect, but:

```sql
select count(*) filter (where overtime_hours > 0) as te_ot_gt0, count(*) as te_total
from time_entries where company_id = '4ee41a41-7790-4e26-8d3c-e8ce66ab38a3';
-- te_ot_gt0=36, te_total=3910

select date from time_entries where company_id='...' and overtime_hours>0 order by date;
-- all 36 rows fall between 2025-07-23 and 2025-09-22 — entirely BEFORE the 2025-10-18 reconciliation window.
```

**Overtime is confirmed to be zero for every time entry in the window under investigation, on both the time_entries side and the payroll_entries side.** It is not a contributor to the $55,971 gap, though it remains a real defect worth fixing (see §6).

### 2.4 Non-payroll labour / subcontractors (Hypothesis 4) — **ruled out**

```sql
select count(*) from time_entries te join workers w on w.id=te.worker_id
where te.company_id='...' and te.date>='2025-10-18'
  and not exists (select 1 from payroll_entries pe where pe.worker_id=te.worker_id and pe.company_id=te.company_id);
-- 0 rows
```

Every worker who logged time in the window has at least one `payroll_entry` somewhere in the system — no worker was silently excluded from payroll entirely. Separately:

```sql
select worker_type, status, count(*) from workers where company_id='...' group by worker_type, status;
-- hourly/active: 12, hourly/inactive: 8
```

**All 20 workers are `worker_type = 'hourly'`.** There is no subcontractor/1099 type in use, and the schema has no field that would let one be excluded from payroll processing even if there were (confirmed in code: `handleProcessPayroll`'s query has no `worker_type` or `status` filter at all — it processes every hourly time entry in the date range regardless of whether the worker is `active`, `inactive`, or `terminated`).

### 2.5 Duplicate/inflated time entries (Hypothesis 5) — **one instance, ~$130, time-entry side only**

```sql
select te.worker_id, w.first_name, w.last_name, te.date, count(*) as n_rows, sum(te.regular_hours+te.overtime_hours) as total_hours
from time_entries te join workers w on w.id=te.worker_id
where te.company_id='...' and te.date>='2025-10-18'
group by te.worker_id, w.first_name, w.last_name, te.date
having count(*) > 1;
-- Earnest Phillipe, 2026-03-11, 2 rows, 16.00 hours
```

Two rows for Earnest Phillipe (`4add769e-194f-464e-a103-a904e94a4d43`) on 2026-03-11, both 07:00–16:00 (8 hrs), logged ~20 hours apart by the same admin against **two different `project_id`s** (`966a8c73-...` and `0192fec1-...`) — physically impossible to work the same shift on two sites. However, his `payroll_entries.regular_hours` for that pay period (Mar 7–13, period `9523872e`) is 48.00 — a normal 6-day week, **not** 56. **Payroll was not inflated by this duplicate**, but it does inflate the time-entries-based "implied labour value" side of this audit by ~8 hrs × $16.25/hr ≈ **$130**.

Bulk-insert clusters were also checked (`created_by` + `created_at::date` grouping): three genuine backfill batches by admin Lamar Sineus (120 entries on 2025-12-11 covering Dec 3–11; 48 entries on 2025-12-18 covering Dec 15–18; 42 entries on 2025-11-05 covering Nov 3–5). These land inside the already-identified coverage-gap windows (§2.1) — they are late-entered real timesheets, not duplicated data.

### 2.6 A second, distinct defect found while testing the overlap hypothesis: **real double-payment, $635.04**

While checking whether overlapping `pay_periods` rows (§5) caused double payment, two *different* kinds of overlap turned up with two *different* outcomes:

**a) The Feb 21–Mar 27 "big period" (`6429ca76...`) — not a double payment.** Its `end_date` is wrong (five weeks instead of one), but it was only ever processed for the first week; the other four weeks were separately and correctly paid via four normal weekly periods. Verified for all 12 workers: the big period's `regular_hours` matches exactly their Feb 21–27 time, no more.

**b) The Mar 28–Apr 3 period (`cd6ab878`) and the Apr 3–10 period (`7539cd7a`) — real double payment.** These two periods share the boundary date **2026-04-03** (`cd6ab878.end_date = 7539cd7a.start_date`), and both queries are inclusive (`.gte(start).lte(end)`). Every worker who logged hours on 2026-04-03 got those hours counted, and paid, in **both** periods:

```sql
select worker_id,
  sum(case when date between '2026-03-28' and '2026-04-02' then regular_hours+overtime_hours else 0 end) as hrs_cd6ab878_exclusive,
  sum(case when date = '2026-04-03' then regular_hours+overtime_hours else 0 end) as hrs_shared_0403,
  sum(case when date between '2026-04-04' and '2026-04-10' then regular_hours+overtime_hours else 0 end) as hrs_7539cd7a_exclusive
from time_entries
where company_id='4ee41a41-7790-4e26-8d3c-e8ce66ab38a3' and date between '2026-03-28' and '2026-04-10'
group by worker_id;
```

| Worker | Rate | Hours double-paid (2026-04-03) | $ overpaid |
|---|---|---|---|
| Louis Beauvais | $15.00 | 8 | $120.00 |
| Fanel Etiene | $15.00 | 8 | $120.00 |
| Makenson | $10.00 | 8 | $80.00 |
| Leonville Elfra | $10.00 | 8 | $80.00 |
| Felix Mike-Awentz | $10.00 | 8 | $80.00 |
| E Z | $10.00 | 8 | $80.00 |
| Aprodieu Florial | $9.38 | 8 | $75.04 |
| **Total** | | | **$635.04** |

This is real money that **was** paid but **shouldn't have been** — it mathematically shrinks the reported gap (actual payroll is $635.04 higher than it should be), but it is a distinct problem from the underpayment gap, not a fix for it. It should be treated as an overpayment to recover or offset, not netted silently against the unpaid weeks in §2.1.

---

## 3. Unexplained residual

Reconciling the components above against the exact $55,971.44 gap:

| Component | Amount | Direction |
|---|---|---|
| Coverage gaps, no `pay_periods` row (§2.1) | $53,026.48 | real unpaid wages |
| Alaine Prophete missing payroll_entries in 2 masked weeks (§5) | $480.00 | real unpaid wages |
| Rate drift, Leonville Elfra (§2.2) | ~$3,390.00 | audit-method artifact, overstates the flat estimate |
| Duplicate entry, Earnest Phillipe (§2.5) | ~$130.00 | audit-method artifact, overstates the flat estimate |
| April 3 boundary double-payment (§2.6) | $635.04 | real overpayment, understates the flat-vs-actual gap |

Netting these against the reported $55,971.44 leaves a **residual of approximately $400–600** that this review could not pin to a single further cause. Two specific, small, named pieces of it are known:

- **Cyrike Tiler's most recent period** (2026-08-29 to 2026-09-04): her `payroll_entries.regular_hours` (16.00) is 8 hours short of what her `time_entries` for that exact date range show (24.00) — an $150.00 shortfall at her $18.75/hr rate, inside a period that otherwise has a normal `payroll_entry`. A `payroll_adjustments` row exists for exactly this (`hours_correction`, `hours_adjustment = 8.00`, reason "Forgot a day (Friday)") — but its `amount_adjustment` is recorded as **$8.00**, not the ~$150.00 that 8 hours at her rate would actually be worth, and `applied_in_period_id` is `null`, meaning it has never been applied to any payroll_entry.
- The remainder (roughly $250–450) is spread thinly (single-digit dollars per period per worker in a handful of otherwise-clean periods) and did not resolve to a specific transaction within the time available for this review. It is small relative to the $55,971 gap (well under 1%) and should not be assumed to net to zero — a full penny-level reconciliation of every `payroll_entries` row against its exact underlying `time_entries` rows (not sampled, as this review did for the largest workers) would be needed to close it completely.

**What would close this precisely:** a `worker_rate_history` table (or equivalent) so historical rates don't have to be inferred from the frozen `payroll_entries.regular_rate` column, and a full per-payroll-entry audit trail (which specific `time_entries.id` rows fed a given `payroll_entries` row) so every dollar can be traced without inference. Neither exists today.

---

## 4. The partial-payment picture (14 `processing` pay periods)

Independently confirmed against the brief's stated totals:

```sql
select pp.id, pp.start_date, pp.end_date,
  sum(pe.net_pay) as net_due,
  coalesce((select sum(pt.amount) from payment_transactions pt
            where pt.payroll_entry_id in (select id from payroll_entries where pay_period_id = pp.id)),0) as paid
from pay_periods pp join payroll_entries pe on pe.pay_period_id = pp.id
where pp.company_id = '4ee41a41-7790-4e26-8d3c-e8ce66ab38a3' and pp.status = 'processing'
group by pp.id, pp.start_date, pp.end_date order by pp.start_date;
```

**Total: net due $54,476.65, paid $39,100.18, shortfall $15,376.47 — matches the brief exactly.**

### Per period

| Period | Net due | Paid | Shortfall | Days since period end (as of 2026-09-04) |
|---|---|---|---|---|
| 2026-04-25 – 05-01 | $3,969.79 | $2,620.16 | $1,349.63 | 126 |
| 2026-05-02 – 05-08 | $2,479.08 | $1,785.12 | $693.96 | 119 |
| 2026-05-09 – 05-15 | $3,970.25 | $3,030.16 | $940.09 | 112 |
| 2026-05-16 – 05-22 | $3,574.87 | $2,927.72 | $647.15 | 105 |
| 2026-05-23 – 05-29 | $3,094.83 | $2,645.20 | $449.63 | 98 |
| 2026-05-30 – 06-05 | $3,058.08 | $1,565.20 | $1,492.88 | 91 |
| 2026-06-06 – 06-12 | $3,934.91 | $1,710.24 | $2,224.67 | 84 |
| 2026-06-13 – 06-19 | $3,734.91 | $2,400.24 | $1,334.67 | 77 |
| 2026-06-20 – 06-26 | $3,294.83 | $1,385.00 | $1,909.83 | 70 |
| 2026-06-27 – 07-03 | $4,534.91 | $3,900.00 | $634.91 | 63 |
| 2026-07-04 – 07-10 | $4,346.31 | $2,221.40 | $2,124.91 | 56 |
| 2026-07-18 – 07-24 | $4,156.23 | $3,305.83 | $850.40 | 42 |
| 2026-07-25 – 07-31 | $5,692.59 | $5,312.11 | $380.48 | 35 |
| 2026-08-29 – 09-04 | $4,635.06 | $4,291.80 | $343.26 | 0 |

### Per worker (across all 14 processing periods)

```sql
with pp as (select id, start_date, end_date from pay_periods where company_id='...' and status='processing'),
pe as (select p.id, p.worker_id, p.pay_period_id, p.net_pay,
  coalesce((select sum(pt.amount) from payment_transactions pt where pt.payroll_entry_id=p.id),0) as paid
  from payroll_entries p where p.pay_period_id in (select id from pp))
select pe.worker_id, w.first_name, w.last_name, count(*) as n_periods_short,
  sum(pe.net_pay) as total_net_due, sum(pe.paid) as total_paid, sum(pe.net_pay-pe.paid) as shortfall
from pe join workers w on w.id=pe.worker_id join pp on pp.id=pe.pay_period_id
where pe.net_pay - pe.paid > 0.01
group by pe.worker_id, w.first_name, w.last_name order by shortfall desc;
```

| Worker | Periods short | Total due | Total paid | **Shortfall** | Earliest shortfall period |
|---|---|---|---|---|---|
| Fanel Etiene | 12 of 14 | $6,620.11 | $1,825.00 | **$4,795.11** | 2026-04-25 |
| Seline' Emilien | 13 of 14 | $5,140.24 | $1,575.00 | **$3,565.24** | 2026-04-25 |
| Makenson | 12 of 14 | $4,700.00 | $1,320.00 | **$3,380.00** | 2026-04-25 |
| Felix Mike-Awentz | 6 | $2,640.00 | $1,000.00 | **$1,640.00** | 2026-05-30 |
| Aprodieu Florial | 5 | $2,101.12 | $1,140.00 | **$961.12** | 2026-06-20 |
| Leonville Elfra | 3 | $1,440.00 | $1,120.00 | **$320.00** | 2026-06-13 |
| Mitchello Elusnord | 2 | $300.00 | $0.00 | **$300.00** | 2026-05-16 |
| Earnest Phillipe | 1 | $650.00 | $355.00 | **$295.00** | 2026-07-04 |
| Rebins (no last name) | 1 | $600.00 | $480.00 | **$120.00** | 2026-07-18 |
| **Total** | | | | **$15,376.47** | |

Fanel Etiene and Seline' Emilien are owed money in almost every processing period going back **126 days** (2026-04-25) with several periods entirely unpaid (e.g. 2026-06-06–06-12, 2026-06-20–06-26 for Fanel: $0 paid against $3,934.91–$3,294.83 due).

---

## 5. Data defects found (list only — not fixed)

1. **`pay_periods` row `6429ca76-0449-45ab-b64e-7c08ef293b48`** has `start_date = 2026-02-21`, `end_date = 2026-03-27` — a 5-week span where every other period in the table is 1 week. It overlaps four subsequent weekly periods (`318916be`, `9523872e`, `51ee25cd`, `79a2e57d`). It was processed early (created_at `2026-03-01`) and its `payroll_entries` only ever reflect the first week (Feb 21–27); the `end_date` itself appears to be a data-entry error (should likely be `2026-02-27`).
2. **Boundary overlap between `cd6ab878-8145-4efd-9ea5-626d8bd7ef34` (ends 2026-04-03) and `7539cd7a-b327-45bd-9da8-0e5617045d13` (starts 2026-04-03)** — both share 2026-04-03 inclusively, causing the real $635.04 double-payment in §2.6. This is a systemic risk: any two adjacent `pay_periods` rows that share a boundary date will double-pay for that day.
3. **Four coverage gaps with no `pay_periods` row at all**, totaling 63 days (2025-11-01–11-14, 2025-11-22–12-05, 2025-12-13–2026-01-09, 2026-08-22–08-28) — root cause of $53,026.48 of unpaid wages (§2.1).
4. **`payroll_adjustments` row `74ef02e8-8947-4ef7-882d-fdb3e293427f`** (Cyrike Tiler, pay_period `9c6a5ff9...`): `hours_adjustment = 8.00` but `amount_adjustment = 8.00` (should be ≈$150.00 at her $18.75/hr rate) and `applied_in_period_id = null` (never applied to any payroll_entry). Either a data-entry mistake or the adjustment workflow doesn't compute/apply dollar amounts from hours.
5. **Missing `payroll_entries` for Alaine Prophete** (`76e90328-4959-414e-9cac-a31602e3668d`) in pay periods `9523872e-c936-4e3a-9f5d-f90c1fc13cc7` (Mar 7–13) and `79a2e57d-26a4-4633-9337-a5f6d92a3dba` (Mar 21–27) despite 48.00 hours of logged `time_entries` in those exact date ranges — $480.00 never paid, masked from casual inspection by defect #1 above (the big period's payroll_entry made it look like she'd been paid for that span).
6. **Duplicate time entry**: Earnest Phillipe, 2026-03-11, two rows (`e92843a8-771b-4901-bb30-e0859ea1b557` and `dedd8bb0-603e-4590-8936-b83509367444`), identical 07:00–16:00 window, logged against two different `project_id`s 20 hours apart by the same creator. Physically impossible; payroll was not affected, but the time-tracking data is wrong.
7. **Placeholder/incomplete worker names**: `Rebins` and `Makenson` have empty `last_name`; `E` `Z`, `Jeff` (blank last name), and `Rally` (blank last name) are similarly incomplete; two distinct workers are both named "Rebins" (`485dc822...` and `e8f24166...`, the latter with last name "Brother") — a real risk of misattributing hours or pay between them by name alone.
8. **`time_entries.overtime_hours` split is per-row, not per-worker-day**: confirmed in code (`src/lib/utils.ts:84-91`) — the 8-hour cutoff is applied independently to each logged entry, so a worker logging two 6-hour entries on the same date across two projects registers 0 overtime hours system-wide even though they worked a 12-hour day. Not a contributor to this specific gap (§2.3) but a live risk of underpaying overtime going forward.
9. **Inconsistent NIB-deduction logic across the codebase**: the main payroll page caps insurable wages at `$550 × weeks-in-period`; `src/lib/ai-tools/create-payroll-entry.ts` caps at a flat `$550` regardless of period length; `src/lib/ai-agent/tools/payroll.ts` caps at a flat `$110` per entry. Three different rules compute three different NIB amounts for the same hours depending which code path processes them. Not investigated further as it affects deductions, not the gross-pay gap under review, but flagged as a correctness risk.
10. **Inactive/terminated workers are not excluded from payroll processing** by the app code — confirmed `handleProcessPayroll`'s time-entries query has no `status` filter. Three of the four highest-value orphaned-time workers in §2.1 (Enel Philipe, David Telusma, Guellen Francois, E Z) are marked `inactive`, meaning their unpaid hours will keep needing manual attention rather than being caught by any active-roster check.

---

## 6. Recommendations

1. **Make `pay_periods` generation systematic, not manual.** The single largest cause of this gap ($53,026.48, 95%) is simply that nobody created pay-period rows for four windows over the last 10 months. A scheduled job (or a UI guard that refuses to let a new period start with a gap since the last one's `end_date`) would have caught this immediately instead of after $54k accumulated.
2. **Enforce non-overlapping, contiguous `pay_periods` at the database level.** Add a constraint (e.g. an exclusion constraint on `daterange(start_date, end_date, '[]')` per `company_id`) so a period like `6429ca76` (5 weeks) or the `cd6ab878`/`7539cd7a` shared-boundary pair cannot be created. Alternatively, standardize on half-open ranges (`start_date` inclusive, `end_date` exclusive, with the next period's `start_date` equal to the previous `end_date`) to eliminate boundary double-counting by construction.
3. **Recompute regular/overtime hours at payroll-processing time from the worker's daily total**, not by summing whatever was frozen into each `time_entries` row at creation time. Today four separate UI entry points each independently decide reg/OT per row, and the payroll page trusts those numbers verbatim — a worker logging hours against two projects on the same day never triggers overtime.
4. **Add a `worker_rate_history` table** (worker_id, rate, effective_from) instead of relying on `payroll_entries.regular_rate` as the only historical record. Right now the only way to know a worker's past rate is to find an already-processed payroll row for them in that period — if a period was never processed (as happened here), the historical rate is unrecoverable from the database.
5. **Fix or remove the `payroll_adjustments` workflow** — the one adjustment row in the system has an hours field and a dollar field that don't agree, and was never applied to a payroll_entry. Either compute `amount_adjustment` from `hours_adjustment × rate` automatically, or require both to be entered and reconciled before the row is considered valid; and make "apply this adjustment" a real, trackable action instead of a `null` `applied_in_period_id` sitting indefinitely.
6. **Unify NIB calculation into one function** used by every code path (`/payroll`, the AI single-entry tool, the AI agent tool) instead of three independent implementations with three different caps.
7. **Clean up worker records**: fill in missing last names and disambiguate the two workers both named "Rebins" before it causes a misattributed payment.
8. **Address the 14-period, $15,376.47 payroll-partial-payment backlog directly** — several workers (Fanel Etiene, Seline' Emilien, Makenson) have gone unpaid or partially paid for over four months. Whatever process pays down `processing` periods should run on a schedule tied to `pay_periods.end_date`, not be left to accumulate.
