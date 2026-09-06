-- 2026-09-05 — close two holes in the live `receipts` row-level policies.
--
-- WHY THIS EXISTS
--
-- Production's receipts policies are NOT the ones in
-- 20260604_enable_rls_on_orphan_tables.sql. That migration created
-- `receipts_select_own_company` / `receipts_modify_own_company`, and neither
-- exists in production. The four policies actually live there are named
-- "Users can view/create/update/delete receipts" and were created out of
-- band, with two problems the repo versions do not have:
--
--   1. The UPDATE policy has no WITH CHECK. USING controls which rows you may
--      update; WITH CHECK controls what the updated row is allowed to look
--      like. With only USING, an authenticated user could update a receipt
--      belonging to their own company and set `company_id` to another
--      company's id, moving the row out of their tenant entirely. Nothing
--      stopped that.
--
--   2. SELECT and UPDATE both admit `company_id IS NULL` rows to ANY
--      authenticated user, across every tenant.
--
-- Only SELECT and UPDATE are rewritten here. The INSERT policy already
-- requires `company_id IS NOT NULL` and a profile match, so it is correct as
-- it stands and is left alone.
--
-- WHY THIS IS SAFE TO APPLY (verified against production 2026-09-05)
--
--   - `receipts.company_id` is NOT NULL, and zero rows have a null value.
--     The `company_id IS NULL` branch is therefore unreachable: removing it
--     cannot change which rows any policy admits, today or ever, unless the
--     column is made nullable again.
--   - There is no UPDATE path to `receipts` in the application at all. The
--     only writer is the INSERT in src/app/(dashboard)/receipts/page.tsx,
--     which sets `company_id` from the caller's own profile. Adding a
--     WITH CHECK cannot break a writer that does not exist.
--   - `receipts` has no triggers.
--   - `dashboard_summary()` is the only function that reads the table, it is
--     SECURITY INVOKER, and every one of its four reads already filters
--     `company_id = p_company_id`. Its output is unchanged.
--   - Caye/TropiTrack's integration writes through the service role, which
--     bypasses RLS entirely. It is unaffected by this migration in either
--     direction -- which is also why RLS is a backstop here and not the
--     primary control for that path.
--
-- The policies from 20260604 are deliberately NOT dropped. They are already
-- correct (company-scoped, WITH CHECK present, no null branch), so in an
-- environment where both sets exist, OR-ing them with the tightened versions
-- below changes nothing.

DROP POLICY IF EXISTS "Users can view receipts" ON public.receipts;

CREATE POLICY "Users can view receipts"
  ON public.receipts FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND company_id = (
      SELECT profiles.company_id FROM public.profiles WHERE profiles.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update receipts" ON public.receipts;

-- USING: which rows this user may touch. WITH CHECK: what the row is allowed
-- to look like afterwards. Both clauses are required -- WITH CHECK alone
-- would let a user edit another tenant's row into their own, and USING alone
-- is the hole this migration exists to close.
--
-- A user with no profile row makes the subquery return NULL, `company_id =
-- NULL` evaluates to NULL, and the policy denies. Fails closed.
CREATE POLICY "Users can update receipts"
  ON public.receipts FOR UPDATE
  USING (
    auth.role() = 'authenticated'
    AND company_id = (
      SELECT profiles.company_id FROM public.profiles WHERE profiles.id = auth.uid()
    )
  )
  WITH CHECK (
    auth.role() = 'authenticated'
    AND company_id = (
      SELECT profiles.company_id FROM public.profiles WHERE profiles.id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 2026-09-06 addendum: the DELETE policy, same class of hole.
--
-- The live DELETE policy reads:
--
--   auth.role() = 'authenticated'
--   AND ( EXISTS (SELECT 1 FROM profiles
--                  WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
--         OR company_id = (SELECT profiles.company_id
--                            FROM profiles WHERE profiles.id = auth.uid()) )
--
-- The admin branch is OR-ed in with no company scoping at all, so any user
-- whose profile has role = 'admin' could delete ANY company's receipts, not
-- just their own. That is cross-tenant destruction from a single flag.
--
-- The fix drops the admin branch entirely rather than scoping it, because
-- scoping it would make it redundant: an admin is already covered by the
-- company_id match below. This is strictly TIGHTER and cannot remove access
-- from anyone legitimately deleting their own company's receipts -- the
-- second branch already granted exactly that, to admins and non-admins alike.
--
-- Verified against production and the app tree 2026-09-06:
--   - There is no DELETE path to `receipts` anywhere in the application.
--     The only two references to the table in src/ are the SELECT at
--     receipts/page.tsx:88 and the INSERT at receipts/page.tsx:191.
--   - `receipts.company_id` is NOT NULL with zero null rows, so no row is
--     rendered undeletable by requiring the company match.
--   - Service-role callers (Caye) bypass RLS and are unaffected.
DROP POLICY IF EXISTS "Users can delete receipts" ON public.receipts;

CREATE POLICY "Users can delete receipts"
  ON public.receipts FOR DELETE
  USING (
    auth.role() = 'authenticated'
    AND company_id = (
      SELECT profiles.company_id FROM public.profiles WHERE profiles.id = auth.uid()
    )
  );
