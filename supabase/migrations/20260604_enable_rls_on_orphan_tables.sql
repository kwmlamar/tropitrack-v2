-- ============================================================
-- Issue #6: enable RLS on 10 orphan tables
-- ============================================================
-- Supabase advisory: these tables have RLS disabled, so the anon key
-- can read/modify every row. Each ENABLE is paired with policies in
-- the same migration so access is never silently dropped.
--
-- Scope rule: a row is visible iff the requesting user's profile
-- shares its company_id (auth.uid() → profiles.company_id).
-- Children (line items, sections) reach company_id through their parent.
-- Pattern mirrors estimate_categories in _deprecated/20260128_estimate_builder_system.sql.
--
-- materials is a global catalog (no company_id) → authenticated SELECT only.
-- section_tasks was dropped in 20260604_task_attached_line_items but
-- the advisory still lists it on the live DB; policy added defensively
-- and is a no-op if the table is already gone.
-- ============================================================

-- ─── 1. estimates ────────────────────────────────────────────────────────────
ALTER TABLE public.estimates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "estimates_select_own_company"
  ON public.estimates FOR SELECT
  USING (company_id IN (
    SELECT company_id FROM public.profiles WHERE id = auth.uid()
  ));

CREATE POLICY "estimates_modify_own_company"
  ON public.estimates FOR ALL
  USING (company_id IN (
    SELECT company_id FROM public.profiles WHERE id = auth.uid()
  ))
  WITH CHECK (company_id IN (
    SELECT company_id FROM public.profiles WHERE id = auth.uid()
  ));

-- ─── 2. estimate_sections ────────────────────────────────────────────────────
ALTER TABLE public.estimate_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "estimate_sections_select_own_company"
  ON public.estimate_sections FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.estimates e
    JOIN public.profiles p ON p.company_id = e.company_id
    WHERE e.id = estimate_sections.estimate_id AND p.id = auth.uid()
  ));

CREATE POLICY "estimate_sections_modify_own_company"
  ON public.estimate_sections FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.estimates e
    JOIN public.profiles p ON p.company_id = e.company_id
    WHERE e.id = estimate_sections.estimate_id AND p.id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.estimates e
    JOIN public.profiles p ON p.company_id = e.company_id
    WHERE e.id = estimate_sections.estimate_id AND p.id = auth.uid()
  ));

-- ─── 3. estimate_line_items ──────────────────────────────────────────────────
ALTER TABLE public.estimate_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "estimate_line_items_select_own_company"
  ON public.estimate_line_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.estimates e
    JOIN public.profiles p ON p.company_id = e.company_id
    WHERE e.id = estimate_line_items.estimate_id AND p.id = auth.uid()
  ));

CREATE POLICY "estimate_line_items_modify_own_company"
  ON public.estimate_line_items FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.estimates e
    JOIN public.profiles p ON p.company_id = e.company_id
    WHERE e.id = estimate_line_items.estimate_id AND p.id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.estimates e
    JOIN public.profiles p ON p.company_id = e.company_id
    WHERE e.id = estimate_line_items.estimate_id AND p.id = auth.uid()
  ));

-- ─── 4. section_tasks (may already be dropped on some DBs) ───────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'section_tasks') THEN
    EXECUTE 'ALTER TABLE public.section_tasks ENABLE ROW LEVEL SECURITY';
    EXECUTE $p$
      CREATE POLICY "section_tasks_select_own_company"
        ON public.section_tasks FOR SELECT
        USING (EXISTS (
          SELECT 1 FROM public.estimate_sections s
          JOIN public.estimates e ON e.id = s.estimate_id
          JOIN public.profiles p ON p.company_id = e.company_id
          WHERE s.id = section_tasks.section_id AND p.id = auth.uid()
        ))
    $p$;
    EXECUTE $p$
      CREATE POLICY "section_tasks_modify_own_company"
        ON public.section_tasks FOR ALL
        USING (EXISTS (
          SELECT 1 FROM public.estimate_sections s
          JOIN public.estimates e ON e.id = s.estimate_id
          JOIN public.profiles p ON p.company_id = e.company_id
          WHERE s.id = section_tasks.section_id AND p.id = auth.uid()
        ))
        WITH CHECK (EXISTS (
          SELECT 1 FROM public.estimate_sections s
          JOIN public.estimates e ON e.id = s.estimate_id
          JOIN public.profiles p ON p.company_id = e.company_id
          WHERE s.id = section_tasks.section_id AND p.id = auth.uid()
        ))
    $p$;
  END IF;
END $$;

-- ─── 5. receipts ─────────────────────────────────────────────────────────────
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "receipts_select_own_company"
  ON public.receipts FOR SELECT
  USING (company_id IN (
    SELECT company_id FROM public.profiles WHERE id = auth.uid()
  ));

CREATE POLICY "receipts_modify_own_company"
  ON public.receipts FOR ALL
  USING (company_id IN (
    SELECT company_id FROM public.profiles WHERE id = auth.uid()
  ))
  WITH CHECK (company_id IN (
    SELECT company_id FROM public.profiles WHERE id = auth.uid()
  ));

-- ─── 6. receipt_line_items (scope via parent receipt) ────────────────────────
ALTER TABLE public.receipt_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "receipt_line_items_select_own_company"
  ON public.receipt_line_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.receipts r
    JOIN public.profiles p ON p.company_id = r.company_id
    WHERE r.id = receipt_line_items.receipt_id AND p.id = auth.uid()
  ));

CREATE POLICY "receipt_line_items_modify_own_company"
  ON public.receipt_line_items FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.receipts r
    JOIN public.profiles p ON p.company_id = r.company_id
    WHERE r.id = receipt_line_items.receipt_id AND p.id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.receipts r
    JOIN public.profiles p ON p.company_id = r.company_id
    WHERE r.id = receipt_line_items.receipt_id AND p.id = auth.uid()
  ));

-- ─── 7. exports ──────────────────────────────────────────────────────────────
ALTER TABLE public.exports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exports_select_own_company"
  ON public.exports FOR SELECT
  USING (company_id IN (
    SELECT company_id FROM public.profiles WHERE id = auth.uid()
  ));

CREATE POLICY "exports_modify_own_company"
  ON public.exports FOR ALL
  USING (company_id IN (
    SELECT company_id FROM public.profiles WHERE id = auth.uid()
  ))
  WITH CHECK (company_id IN (
    SELECT company_id FROM public.profiles WHERE id = auth.uid()
  ));

-- ─── 8. company_docs ─────────────────────────────────────────────────────────
ALTER TABLE public.company_docs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_docs_select_own_company"
  ON public.company_docs FOR SELECT
  USING (company_id IN (
    SELECT company_id FROM public.profiles WHERE id = auth.uid()
  ));

CREATE POLICY "company_docs_modify_own_company"
  ON public.company_docs FOR ALL
  USING (company_id IN (
    SELECT company_id FROM public.profiles WHERE id = auth.uid()
  ))
  WITH CHECK (company_id IN (
    SELECT company_id FROM public.profiles WHERE id = auth.uid()
  ));

-- ─── 9. business_goals ───────────────────────────────────────────────────────
ALTER TABLE public.business_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "business_goals_select_own_company"
  ON public.business_goals FOR SELECT
  USING (company_id IN (
    SELECT company_id FROM public.profiles WHERE id = auth.uid()
  ));

CREATE POLICY "business_goals_modify_own_company"
  ON public.business_goals FOR ALL
  USING (company_id IN (
    SELECT company_id FROM public.profiles WHERE id = auth.uid()
  ))
  WITH CHECK (company_id IN (
    SELECT company_id FROM public.profiles WHERE id = auth.uid()
  ));

-- ─── 10. materials (global catalog — read-only to authenticated) ─────────────
-- No company_id; this is a shared reference table. Writes restricted to
-- service_role (no INSERT/UPDATE/DELETE policies = blocked under RLS).
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "materials_select_authenticated"
  ON public.materials FOR SELECT
  TO authenticated
  USING (true);
