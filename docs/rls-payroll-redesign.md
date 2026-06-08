# RLS Redesign — Payroll-Adjacent Tables

**Status:** Draft, pending Lamar sign-off
**Issue:** #17
**Blocks:** #18 (foundational migration)

## Why

The Claude assistant currently runs under `SUPABASE_SERVICE_ROLE_KEY`, which bypasses RLS entirely. To move it to user-JWT auth (#18), RLS has to actually enforce something meaningful. Today it doesn't:

- 23 SELECT policies on `auth.role() = 'authenticated'` — any logged-in user can read every row across every company.
- Three tables in the payroll chain (`pay_periods`, `payroll_entries`, `payment_transactions`) have no `company_id` at all; tenancy is only enforced transitively via `workers.company_id`.

This is a multi-tenant data leak waiting for the second customer. Bedrock is single-tenant on ODS today, so it's latent.

## Scope

Six tables, in dependency order:

1. `profiles` — already has `company_id`. Policies need rewrite.
2. `companies` — already correctly scoped (members-only).
3. `workers` — already has `company_id` (added in `20260122_import_v1_workers.sql`). Policies need rewrite.
4. `time_entries` — already has `company_id` (added in `20260122_add_company_id_to_time_entries.sql`). Policies need rewrite.
5. `pay_periods` — **needs `company_id` column added**. Policies need rewrite.
6. `payroll_entries` — **needs `company_id` column added** (denormalized for RLS perf). Policies need rewrite.
7. `payment_transactions` — **needs `company_id` column added** (denormalized for RLS perf). Policies need rewrite.

Denormalizing `company_id` onto `pay_periods`, `payroll_entries`, and `payment_transactions` is cheaper than join-based policies (one index lookup vs subquery per row) and matches what other migrations already did for workers/time_entries/vendors.

## Role model

`profiles.role` is `'admin' | 'project_manager'` (per schema.sql:17). Workers themselves don't have auth accounts in the current model — only profiles do.

Three behaviors land on every tenanted table:

- **SELECT** — any member of the company (`profiles.company_id = row.company_id`).
- **INSERT / UPDATE** — any member of the company.
- **DELETE** — admin in the company only.

`pay_periods` and `payroll_entries` deletes stay admin-only, matching today. `payment_transactions` is append-only (no UPDATE policy, no DELETE policy) — corrections happen via additional rows with negative amounts or via voiding the parent `payroll_entry`. This preserves the audit trail.

## Helper function

To keep policies readable, add a SECURITY DEFINER helper:

```sql
CREATE OR REPLACE FUNCTION public.current_company_id() RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT company_id FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.is_admin() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
$$;
```

Every policy below uses these. If a user has no company (`current_company_id()` returns NULL), all `company_id = current_company_id()` checks fail — they see nothing. That's the correct behavior.

## Policies per table

### `profiles`

| Op | Current | New |
|---|---|---|
| SELECT | `USING (true)` — leaks every user across tenants | `USING (id = auth.uid() OR company_id = current_company_id())` |
| UPDATE (self) | `USING (auth.uid() = id)` — keep | `USING (auth.uid() = id)` |
| UPDATE (admin) | admin can update all profiles globally | `USING (is_admin() AND company_id = current_company_id())` |
| INSERT | n/a (profiles created via trigger on auth.users) | n/a |
| DELETE | n/a | n/a |

### `companies`

Existing policies in `20260122_companies_invitations_payments.sql` are correct (members-only). No change.

### `workers`

| Op | Current | New |
|---|---|---|
| SELECT | `auth.role() = 'authenticated'` | `company_id = current_company_id()` |
| INSERT | `auth.role() = 'authenticated'` | `WITH CHECK (company_id = current_company_id())` |
| UPDATE | `auth.role() = 'authenticated'` | `USING (company_id = current_company_id())` |
| DELETE | admin-only globally | `USING (is_admin() AND company_id = current_company_id())` |

### `time_entries`

| Op | Current | New |
|---|---|---|
| SELECT | `auth.role() = 'authenticated'` | `company_id = current_company_id()` |
| INSERT | `auth.role() = 'authenticated'` | `WITH CHECK (company_id = current_company_id())` |
| UPDATE | `auth.role() = 'authenticated'` | `USING (company_id = current_company_id())` |
| DELETE | admin-only globally | `USING (is_admin() AND company_id = current_company_id())` |

### `pay_periods` (after adding `company_id`)

| Op | Current | New |
|---|---|---|
| SELECT | `auth.role() = 'authenticated'` | `company_id = current_company_id()` |
| INSERT | `auth.role() = 'authenticated'` | `WITH CHECK (company_id = current_company_id())` |
| UPDATE | `auth.role() = 'authenticated'` | `USING (company_id = current_company_id())` |
| DELETE | admin-only globally | `USING (is_admin() AND company_id = current_company_id())` |

### `payroll_entries` (after adding `company_id`)

| Op | Current | New |
|---|---|---|
| SELECT | `auth.role() = 'authenticated'` | `company_id = current_company_id()` |
| INSERT | `auth.role() = 'authenticated'` | `WITH CHECK (company_id = current_company_id())` |
| UPDATE | `auth.role() = 'authenticated'` | `USING (company_id = current_company_id())` |
| DELETE | admin-only globally | `USING (is_admin() AND company_id = current_company_id())` |

### `payment_transactions` (after adding `company_id`)

| Op | Current | New |
|---|---|---|
| SELECT | via subquery on `payroll_entries` | `company_id = current_company_id()` |
| INSERT | via subquery on `payroll_entries` | `WITH CHECK (company_id = current_company_id())` |
| UPDATE | none | none (append-only) |
| DELETE | none | none (append-only) |

## Migration plan

The migration in #18 will:

1. Create `current_company_id()` and `is_admin()` helpers.
2. `ALTER TABLE` to add `company_id UUID REFERENCES companies(id)` to `pay_periods`, `payroll_entries`, `payment_transactions`.
3. Backfill: `pay_periods.company_id` from any associated `payroll_entries.worker → workers.company_id` (or NULL if no entries — pick the one ODS company since today is single-tenant); `payroll_entries.company_id` from `worker → workers.company_id`; `payment_transactions.company_id` from parent `payroll_entry.company_id`.
4. Set `company_id NOT NULL` after backfill.
5. Drop old policies, create new ones in the order above (dependencies: helpers first, then tables).
6. Add trigger or check to enforce `payroll_entries.company_id = workers.company_id` (no cross-company entries).

## Edge cases

- **Users with no company (`profiles.company_id` is NULL).** `current_company_id()` returns NULL; all `company_id = NULL` comparisons are NULL (not TRUE), so they see nothing. Correct.
- **Existing rows with NULL `company_id` after backfill.** Backfill must complete before the NOT NULL constraint is added. If any row can't be backfilled (orphaned data), it gets assigned to the single ODS company today; document this in the migration.
- **`payment_transactions.company_id` denormalization drift.** A trigger on INSERT copies `company_id` from the parent `payroll_entry` so app code can't get it wrong.
- **Cross-table policies.** `payment_transactions` previously checked access via subquery on `payroll_entries`. The new design uses the denormalized `company_id` directly — faster, and the trigger guarantees consistency.
- **Service-role callers (jobs, migrations, edge functions).** Service role bypasses all RLS. Any internal job that needs to operate cross-company stays on service role explicitly. The chat route is what moves off service role.
- **Test fixture for multi-tenant verification (#18 acceptance criterion).** Create a second company + profile in a test, attempt to read another company's worker via the user-JWT-scoped client, expect zero rows.

## What this does NOT do

- Does **not** add per-worker access control (e.g. "worker only sees own payroll"). Workers don't have logins today. Future work.
- Does **not** touch RLS on the other ~20 tables (clients, vendors, materials, estimates, etc.). Those get rewritten when their respective tools ship. This doc is payroll-adjacent only, per the slice scope.
- Does **not** restrict admin-only writes beyond what already exists. Tier and confirmation system in #19 / #20 are the second line of defense.

## Sign-off

Lamar to approve in a PR comment. Then #18 opens with the migration PR referencing this doc.
