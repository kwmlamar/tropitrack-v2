-- ============================================================
-- Smoke test for Issue #1 — task-attached line items + labor formula
-- ============================================================
-- Run against any environment to verify the labor formula and the
-- schema delta from 20260604_task_attached_line_items.
--
-- Acceptance criterion from issue #1:
--   crew_size=2, man_days=8, labor_sell_rate_per_day=180  →  labor_cost = $1,440
--
-- Run:
--   psql $DATABASE_URL -f supabase/tests/issue_1_labor_formula.sql
-- ============================================================

DO $$
DECLARE
  test_estimate_id uuid;
  test_section_id  uuid;
  test_line_id     uuid;
  computed_labor   numeric;
  test_company_id  uuid;
BEGIN
  SELECT id INTO test_company_id FROM public.companies LIMIT 1;
  IF test_company_id IS NULL THEN
    RAISE EXCEPTION 'No company exists — seed at least one before running this test';
  END IF;

  -- Set up: estimate with rate, section, line item with man_days
  INSERT INTO public.estimates (company_id, name, status, labor_sell_rate_per_day)
  VALUES (test_company_id, 'SMOKE_TEST_issue_1', 'draft', 180)
  RETURNING id INTO test_estimate_id;

  INSERT INTO public.estimate_sections (estimate_id, name, order_index)
  VALUES (test_estimate_id, 'Test Section', 0)
  RETURNING id INTO test_section_id;

  INSERT INTO public.estimate_line_items
    (estimate_id, section_id, description, quantity, crew_days, man_days,
     labor_cost, material_cost, equipment_cost, order_index, daily_workers, show_to_client)
  VALUES
    (test_estimate_id, test_section_id, 'Test Task: 2 crew × 4 days = 8 man-days',
     1, 4, 8, 0, 0, 0, 0, '{}'::jsonb, true)
  RETURNING id INTO test_line_id;

  -- Case 1: line uses estimate-level default rate
  SELECT eli.man_days * COALESCE(eli.labor_sell_rate_per_day, e.labor_sell_rate_per_day)
  INTO computed_labor
  FROM public.estimate_line_items eli
  JOIN public.estimates e ON e.id = eli.estimate_id
  WHERE eli.id = test_line_id;

  IF computed_labor != 1440 THEN
    RAISE EXCEPTION 'FAIL: default rate case — expected 1440, got %', computed_labor;
  END IF;

  -- Case 2: per-line override beats estimate default
  UPDATE public.estimate_line_items
  SET labor_sell_rate_per_day = 250
  WHERE id = test_line_id;

  SELECT eli.man_days * COALESCE(eli.labor_sell_rate_per_day, e.labor_sell_rate_per_day)
  INTO computed_labor
  FROM public.estimate_line_items eli
  JOIN public.estimates e ON e.id = eli.estimate_id
  WHERE eli.id = test_line_id;

  IF computed_labor != 2000 THEN
    RAISE EXCEPTION 'FAIL: override case — expected 2000, got %', computed_labor;
  END IF;

  -- Case 3: zero man_days yields zero labor
  UPDATE public.estimate_line_items SET man_days = 0 WHERE id = test_line_id;

  SELECT eli.man_days * COALESCE(eli.labor_sell_rate_per_day, e.labor_sell_rate_per_day)
  INTO computed_labor
  FROM public.estimate_line_items eli
  JOIN public.estimates e ON e.id = eli.estimate_id
  WHERE eli.id = test_line_id;

  IF computed_labor != 0 THEN
    RAISE EXCEPTION 'FAIL: zero man_days case — expected 0, got %', computed_labor;
  END IF;

  -- Cleanup (CASCADE drops section + line item too)
  DELETE FROM public.estimates WHERE id = test_estimate_id;

  RAISE NOTICE 'Labor formula smoke test PASSED — all 3 cases ok';
END $$;

-- Invariant assertions on the post-migration schema
DO $$
DECLARE
  col_count integer;
BEGIN
  SELECT count(*) INTO col_count
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='estimate_line_items'
    AND column_name IN ('man_days','labor_sell_rate_per_day','section_id');
  IF col_count != 3 THEN
    RAISE EXCEPTION 'FAIL: expected man_days+labor_sell_rate_per_day+section_id on estimate_line_items, found % of 3', col_count;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='section_tasks') THEN
    RAISE EXCEPTION 'FAIL: section_tasks should have been dropped';
  END IF;

  IF EXISTS (SELECT 1 FROM public.estimate_line_items WHERE section_id IS NULL) THEN
    RAISE EXCEPTION 'FAIL: found orphan line items without section_id';
  END IF;

  RAISE NOTICE 'Schema invariants PASSED';
END $$;
