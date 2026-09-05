# Bedrock — Dashboard & Navigation Redesign Brief

**Repo:** `tropitrack-v2` (Next.js 14 App Router, TypeScript, Tailwind, Supabase)
**Scope:** `/dashboard` page + primary sidebar navigation
**Branch:** create `feat/dashboard-redesign` — do not commit to main
**Owner context:** ODS Construction, Governors Harbour, Eleuthera, Bahamas. ~12 active crew, 14 active jobs, 3–4 concurrent projects. Users are the owner (Wallace), the office manager (Lamar), a project manager (Omar) and a site supervisor (Jay). All currency is BSD, at 1:1 with USD.

---

## 1. Why this work exists

The current dashboard reports **size**, not **decisions**. It shows Active Jobs (14), Crew (12), Payroll MTD, a list of six recent job names, and two hand-nudged progress bars called Goals. None of that changes what anyone does today.

Meanwhile, real conditions in the production database go completely unsurfaced:

- 8 invoices totalling **$94,178.46** are all marked `sent` with `amount_paid = 0.00`, and the `payments` table has **zero rows**. The app believes nothing has ever been paid.
- **14 pay periods** sit in `processing`, the oldest since late April.
- **21 of 25 estimates** are `$0.00` drafts. The Estimates page proudly displays "PIPELINE BSD $0".
- Several active jobs carry `budget = 0.00` while crew log hours against them daily.
- All 6 receipts have `image_url` set to the literal string `"uploaded"` — the source documents do not exist. `receipt_line_items` is empty.
- `invoice_line_items`, `material_price_history` and `payments` are all empty tables.

**A dashboard that shows "14 Active Jobs" while the company cannot say who owes it money is measuring the wrong thing.**

There is also a plain navigation bug: `/invoices`, `/clients`, `/vendors`, `/reports` and `/schedule` all exist as fully built pages but appear **nowhere in the desktop sidebar** (`src/components/layout/sidebar.tsx`, `NAV_MAIN`). Invoices are reachable only from the mobile bottom nav. The office manager works on desktop. This is very likely why invoice records in the app drifted out of sync with the company's separate spreadsheet register — the person doing the invoicing could not see the invoice screen.

---

## 2. Design principles

1. **The dashboard answers "what needs me right now," not "how big are we."** Counts are not decisions. Money owed, money going out, and things that are stuck are decisions.
2. **Never render an empty table as a measured zero.** If `payments` has no rows, the UI says "no payments recorded yet" — it does not say "$0.00 received". Conflating "we have no data" with "the value is zero" is the exact failure that produced the $94k phantom. This rule is non-negotiable and applies to every figure on the page.
3. **Every number is clickable and leads to the screen where it can be fixed.**
4. **Exceptions are the product.** The most valuable region of the screen is a list the user can drive to zero.
5. **Respect the existing design system.** This codebase carries a carefully built Supabase-Studio-derived token set. Do not introduce new colors, new spacing scales, or new fonts.

---

## 3. Navigation changes (`src/components/layout/sidebar.tsx`)

Replace the flat 10-item `NAV_MAIN` with grouped sections. Render small uppercase mono section labels (`text-[10px] font-mono uppercase tracking-widest text-foreground-lighter px-2 pt-3 pb-1`), hidden when the sidebar is collapsed to the icon rail.

```
  Today            /dashboard        (renamed from "Dashboard")
  Claude           /assistant

  MONEY
  Estimates        /estimates
  Invoices         /invoices         ← currently unreachable on desktop
  Clients          /clients          ← currently unreachable on desktop

  WORK
  Jobs             /projects
  Schedule         /schedule         ← currently unreachable on desktop
  Time             /time-tracking

  CREW
  Crew             /workers
  Payroll          /payroll

  BUYING
  Receipts         /receipts
  Materials        /materials
  Vendors          /vendors          ← currently unreachable on desktop

  Reports          /reports          ← currently unreachable on desktop
  ─────
  Settings         /settings
```

**Remove `Goals` from the primary nav.** Leave `/goals` and the `business_goals` table intact and reachable from `/reports` — do not delete data — but two manually incremented progress bars are not primary navigation.

Keep the existing collapse behaviour, icon rail, `ICON_STROKE = 1.5`, active-state styling and the user/sign-out row exactly as they are. Pick sensible `lucide-react` icons for the new entries (`Receipt` for Invoices, `Building2` for Clients, `Truck` for Vendors, `CalendarDays` for Schedule, `BarChart3` for Reports).

Also add the new destinations to the mobile "More" page (`src/app/(dashboard)/more/page.tsx`) if they are missing there.

---

## 4. The new `/dashboard` — "Today"

Four horizontal bands. Keep the existing page chrome: the top bar with the mono uppercase date, the "{Greeting}, {first name}" heading, and the "Ask Claude" link on the right.

**Change the header sub-line** to a one-sentence brief generated from live data, e.g. *"3 pay periods still open · $62,733 owed to you · 21 estimates unpriced."* Show at most the three highest-severity facts. If nothing is outstanding, say "Nothing needs attention."

### Band 1 — Money (three tiles, replacing Active Jobs / Crew / Payroll MTD)

| Tile | Value | Sub-line | Links to |
|---|---|---|---|
| **Owed to us** | `SUM(invoices.balance_due)` where status not in ('paid','void','cancelled') | "N invoices · oldest N days" | `/invoices` |
| **Open pay period** | running labour cost of the current period from `time_entries` × worker rate | "closes in N days" — and if other periods are still `processing`, "N older periods still open" in warning colour | `/payroll` |
| **This month** | money in vs money out | "in: … · out: …" | `/reports` |

Tile 3 rules: money in = `SUM(payments.amount)` for the current month; money out = payroll paid + receipt totals + PO totals for the month. **If `payments` has no rows at all, the "in" figure renders as an em-dash with the sub-line "no payments recorded yet" — not $0.00.**

Colour the "Owed to us" figure by the age of its oldest open invoice: `text-foreground` under 30 days, `text-warning` at 30–60, `text-destructive` over 60.

### Band 2 — Needs attention (the centrepiece)

A single bordered panel titled `NEEDS ATTENTION`, containing one row per triggered condition. **Render a row only when its count is greater than zero.** Sort by severity (destructive → warning → info). If every check passes, show a quiet "All clear" state.

Each row: a severity dot, a plain-English sentence, the count and age on the right, and the whole row is a link.

Implement these checks:

| # | Condition | Row text | Severity | Links to |
|---|---|---|---|---|
| 1 | `pay_periods.status = 'processing'` AND `end_date < now() - 14 days` | "{n} pay periods never closed — oldest {date}" | destructive | `/payroll` |
| 2 | `invoices` open, `amount_paid = 0`, `issue_date < now() - 30 days` | "{n} invoices unpaid over 30 days — ${sum}" | destructive | `/invoices` |
| 3 | `receipts` where `image_url` is null, empty, or not a resolvable path | "{n} receipts with no image on file" | destructive | `/receipts` |
| 4 | `estimates.status='draft'` AND `total_amount = 0` | "{n} estimates awaiting pricing" | warning | `/estimates` |
| 5 | `projects` active/in_progress AND (`budget` is null or 0) | "{n} active jobs with no budget set" | warning | `/projects` |
| 6 | active projects with `time_entries` in the last 14 days but no linked estimate | "{n} jobs burning labour with no estimate" | warning | `/projects` |
| 7 | `receipts` with no rows in `receipt_line_items` | "{n} receipts not itemised" | warning | `/receipts` |
| 8 | active workers with no `time_entries` for the last working day | "{n} crew with no hours logged {day}" | info | `/time-tracking` |
| 9 | `invoices.invoice_number` not matching `^INV-\d{4}-\d{3}$` | "{n} invoices outside the numbering sequence" | info | `/invoices` |

Write each check so it degrades safely: a query error on one row must not blank the whole panel.

### Band 3 — Jobs by money

Replace the current six-name job list with a table of active jobs, **sorted by risk, not by date**. Columns:

`Job · Client · Contract · Labour to date · Materials · Spent % · Status`

- Labour to date = `SUM(time_entries.hours × worker rate)` for that project (use the same rate logic `/payroll` already uses — find it and reuse it, do not reimplement).
- Materials = purchase orders and receipts coded to the project.
- Spent % = (labour + materials) ÷ budget, rendered as a thin bar in the existing 2px style.
- If `budget` is 0 or null, **do not render 0% or divide by zero** — render a `no budget` chip using `bg-warning-subtle border-warning-border text-warning`.
- Sort: no-budget jobs first, then descending Spent %.
- Highlight rows over 80% spent.

Show the top 8 with an "All →" link to `/projects`.

### Band 4 — This week

One compact row: a Mon–Sun strip of hours logged (the pattern already exists in `/time-tracking` — reuse the component if it is extractable), hours this week vs last week, and the count of crew who logged time today. Keep this to a single band; it is context, not the point of the page.

### Removed from the dashboard

- The **Goals** card in its entirety.
- The four-up **quick action** grid. Replace with two buttons only — **Log Time** and **Scan Receipt** — placed inline in the top bar next to "Ask Claude". `cmdk` is already a dependency; if a command palette is wired up, add a `⌘K` hint there instead of restoring the grid.

---

## 5. Data fetching

The current page fires five client-side Supabase queries from a `load()` in a `useEffect`. The redesign needs roughly fifteen, several of them aggregates and joins. Do not fan fifteen round-trips out of the browser.

Build **one read-only Postgres function** returning a single JSON payload:

```sql
create or replace function dashboard_summary(p_company_id uuid)
returns jsonb
language plpgsql
security invoker      -- must respect RLS; do NOT use security definer
stable
as $$ ... $$;
```

- Add it as a new timestamped migration in `supabase/migrations/`, matching the existing naming convention.
- `security invoker` and `stable`. Every query inside it filters on `p_company_id`.
- It is **read-only**. This migration must not write, alter or drop any existing table.
- Shape the return as `{ money: {...}, attention: [...], jobs: [...], week: {...} }` so the page does one `supabase.rpc('dashboard_summary', { p_company_id })` call.
- Keep a typed interface for the payload in `src/types/index.ts`.
- Add indexes only if a query plan genuinely needs one, in the same migration.

Preserve the existing loading-skeleton approach (`animate-pulse` blocks at the right heights) and the `profile?.company_id` guard.

---

## 6. Styling constraints — read before writing any JSX

Everything must come from the existing token system in `tailwind.config.ts` and `src/app/globals.css`.

- **No raw hex, no arbitrary colors, no new CSS variables.**
- Panels: `rounded-lg border border-border bg-surface-100`. Hover: `hover:bg-surface-200`.
- Text ramp: `text-foreground` → `text-foreground-light` → `text-foreground-lighter`.
- Section labels: `text-[11px] font-mono uppercase tracking-widest text-foreground-lighter`.
- Status chips: `bg-{status}-subtle border-{status}-border text-{status}` where status ∈ warning | destructive | success | info.
- The single accent is `text-brand` (construction orange). Use it sparingly — one or two figures per screen, not every number.
- **All figures use `tabular-nums`.** Money is always `BSD $12,345.67`, two decimal places, thousands separators.
- Use the project's custom font scale (`text-sm` is 13px here, `text-base` is 15px). Body weight is 450.
- Both light and dark themes must work — `next-themes` is already wired. Check both.
- **No new npm dependencies.** `recharts` and `lucide-react` are already installed if you need a chart or an icon.

---

## 7. Responsive

- Desktop is the primary target — this is where the office work happens.
- Below `md`, everything stacks to a single column and **Needs Attention moves above the money tiles**. On a phone, on site, the exception list is the whole point.
- The app is a PWA with a fixed bottom nav (`MobileNav`, `h-16`); keep the existing `pb-safe` bottom padding so nothing hides behind it.

---

## 8. Out of scope — do not do these

- Do not modify any existing table's schema, or add data to `project_documents` or `company_docs` (both are deliberately empty by architectural decision).
- Do not backfill, correct or "clean up" any invoice, payment, estimate or receipt data. The reconciliation of those records is a separate decision the owner has not yet made. **Surface the problems; do not fix them.**
- Do not delete the `/goals` page or the `business_goals` rows.
- Do not touch the Claude assistant, the AI agent tools, or the estimate/invoice PDF renderers.

---

## 9. Definition of done

- [ ] `npm run build` passes with no new TypeScript errors.
- [ ] `npm run lint` clean.
- [ ] Sidebar shows all grouped sections; every previously orphaned page is reachable on desktop; collapse-to-rail still works.
- [ ] `/dashboard` renders all four bands against the live database.
- [ ] Every "Needs Attention" row that has data links to the right screen; rows with zero count do not render.
- [ ] Empty tables render as em-dash + explanatory sub-line, never as `$0.00`. Verify specifically with `payments`, which has no rows.
- [ ] Jobs with `budget = 0` show the `no budget` chip and no division-by-zero output.
- [ ] Light and dark themes both correct; no hard-coded colors introduced.
- [ ] Mobile: single column, Needs Attention first, nothing under the bottom nav.
- [ ] One migration added under `supabase/migrations/`, read-only, `security invoker`.
- [ ] Work is on `feat/dashboard-redesign`, with a short summary of what changed and any check you could not implement and why.

If any check in section 4 cannot be computed from the current schema, **do not invent a proxy metric** — implement the rest, and list what you skipped and what would be needed.
