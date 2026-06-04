-- ============================================================
-- Smoke test for Issue #11 — takeoff-level material lines per section
-- ============================================================
-- Verifies:
--   1. Default material markup (75%) yields qty × unit_cost × 1.75
--   2. Per-line markup_pct override beats the estimate default
--   3. is_equipment flag routes to default_equipment_markup_pct (0% = pass-through)
--   4. Snapshot contract — catalog price change does not mutate the takeoff row
--
-- Run:
--   psql $DATABASE_URL -f supabase/tests/issue_11_section_materials.sql
-- ============================================================

DO $$
DECLARE
  test_estimate_id uuid;
  test_section_id  uuid;
  test_line_id     uuid;
  test_company_id  uuid;
  test_material_id text := 'SMOKE_TEST_material_issue_11';
  computed_sell    numeric;
  saved_unit_cost  numeric;
BEGIN
  SELECT id INTO test_company_id FROM public.companies LIMIT 1;
  IF test_company_id IS NULL THEN
    RAISE EXCEPTION 'No company exists — seed at least one before running this test';
  END IF;

  INSERT INTO public.materials (id, division_code, division_name, category, name, unit, unit_cost)
  VALUES (test_material_id, '00', 'TEST', 'test', 'TEST CMU Block', 'EACH', 4.25);

  INSERT INTO public.estimates (company_id, name, status, default_material_markup_pct, default_equipment_markup_pct)
  VALUES (test_company_id, 'SMOKE_TEST_issue_11', 'draft', 75, 0)
  RETURNING id INTO test_estimate_id;

  INSERT INTO public.estimate_sections (estimate_id, name, order_index)
  VALUES (test_estimate_id, 'ENTRANCE GATE', 0)
  RETURNING id INTO test_section_id;

  -- Case 1: 135 CMU @ $4.25 with default 75% markup → 1,004.06
  INSERT INTO public.estimate_section_materials
    (section_id, material_id, description, quantity, unit, unit_cost, is_equipment)
  VALUES
    (test_section_id, test_material_id, 'TEST CMU Block', 135, 'EACH', 4.25, false)
  RETURNING id INTO test_line_id;

  SELECT m.quantity * m.unit_cost * (1 + COALESCE(m.markup_pct, e.default_material_markup_pct) / 100)
  INTO computed_sell
  FROM public.estimate_section_materials m
  JOIN public.estimate_sections s ON s.id = m.section_id
  JOIN public.estimates e ON e.id = s.estimate_id
  WHERE m.id = test_line_id;
  IF round(computed_sell, 2) != 1004.06 THEN
    RAISE EXCEPTION 'FAIL case 1 — expected ~1004.06, got %', computed_sell;
  END IF;

  -- Case 2: per-line override 30% → 745.88
  UPDATE public.estimate_section_materials SET markup_pct = 30 WHERE id = test_line_id;
  SELECT m.quantity * m.unit_cost * (1 + COALESCE(m.markup_pct, e.default_material_markup_pct) / 100)
  INTO computed_sell
  FROM public.estimate_section_materials m
  JOIN public.estimate_sections s ON s.id = m.section_id
  JOIN public.estimates e ON e.id = s.estimate_id
  WHERE m.id = test_line_id;
  IF round(computed_sell, 2) != 745.88 THEN
    RAISE EXCEPTION 'FAIL case 2 — expected 745.88, got %', computed_sell;
  END IF;

  -- Case 3: is_equipment with default 0% markup → 573.75 pass-through
  UPDATE public.estimate_section_materials SET is_equipment = true, markup_pct = NULL WHERE id = test_line_id;
  SELECT m.quantity * m.unit_cost * (1 +
    CASE WHEN m.is_equipment
         THEN COALESCE(m.markup_pct, e.default_equipment_markup_pct)
         ELSE COALESCE(m.markup_pct, e.default_material_markup_pct)
    END / 100)
  INTO computed_sell
  FROM public.estimate_section_materials m
  JOIN public.estimate_sections s ON s.id = m.section_id
  JOIN public.estimates e ON e.id = s.estimate_id
  WHERE m.id = test_line_id;
  IF round(computed_sell, 2) != 573.75 THEN
    RAISE EXCEPTION 'FAIL case 3 — expected 573.75, got %', computed_sell;
  END IF;

  -- Case 4: catalog price change does not mutate the takeoff row
  UPDATE public.materials SET unit_cost = 99.99 WHERE id = test_material_id;
  SELECT unit_cost INTO saved_unit_cost FROM public.estimate_section_materials WHERE id = test_line_id;
  IF saved_unit_cost != 4.25 THEN
    RAISE EXCEPTION 'FAIL case 4 — snapshot violated, got %', saved_unit_cost;
  END IF;

  DELETE FROM public.estimates WHERE id = test_estimate_id;
  DELETE FROM public.materials WHERE id = test_material_id;

  RAISE NOTICE 'Issue #11 smoke test PASSED — 4 cases ok';
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='estimate_section_materials') THEN
    RAISE EXCEPTION 'FAIL: estimate_section_materials table missing';
  END IF;
  RAISE NOTICE 'Issue #11 schema invariants PASSED';
END $$;
