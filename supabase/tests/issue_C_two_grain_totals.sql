-- ============================================================
-- Smoke test for Option C — two-grain estimate totals
-- ============================================================
-- Verifies end-to-end: estimate.total_amount is recomputed correctly when
-- either labor (estimate_line_items) or takeoff materials
-- (estimate_section_materials) change.
--
-- Formula:
--   subtotal = sum(line_items.amount) + sum(takeoff sell with markup)
--   overhead = subtotal × overhead_pct / 100
--   profit   = (subtotal + overhead) × profit_margin_percent / 100
--   vat      = (subtotal + overhead + profit) × vat_pct / 100
--   total    = subtotal + overhead + profit + vat
--
-- Run:
--   psql $DATABASE_URL -f supabase/tests/issue_C_two_grain_totals.sql
-- ============================================================

DO $$
DECLARE
  test_company_id  uuid;
  test_estimate_id uuid;
  test_section_id  uuid;
  est_subtotal     numeric;
  est_total        numeric;
BEGIN
  SELECT id INTO test_company_id FROM public.companies LIMIT 1;
  IF test_company_id IS NULL THEN
    RAISE EXCEPTION 'No company exists — seed at least one before running this test';
  END IF;

  INSERT INTO public.estimates
    (company_id, name, status, labor_sell_rate_per_day,
     default_material_markup_pct, default_equipment_markup_pct,
     overhead_pct, vat_pct)
  VALUES (test_company_id, 'SMOKE_TEST_optionC', 'draft', 180, 75, 0, 15, 10)
  RETURNING id INTO test_estimate_id;

  INSERT INTO public.estimate_sections (estimate_id, name, order_index)
  VALUES (test_estimate_id, 'ENTRANCE GATE', 0)
  RETURNING id INTO test_section_id;

  -- Setup: labor $1,440 + 135 CMU @ $4.25 (75% markup → $1,004.06) + $200 equipment (0% markup → $200)
  INSERT INTO public.estimate_line_items
    (estimate_id, section_id, description, quantity, crew_days, man_days,
     labor_cost, material_cost, equipment_cost, order_index, daily_workers, show_to_client)
  VALUES (test_estimate_id, test_section_id, 'Excavation', 1, 4, 8, 1440, 0, 0, 0, '{}'::jsonb, true);

  INSERT INTO public.estimate_section_materials
    (section_id, description, quantity, unit, unit_cost, is_equipment)
  VALUES (test_section_id, 'CMU Block', 135, 'EACH', 4.25, false),
         (test_section_id, 'Scaffolding', 1, 'EACH', 200, true);

  -- Case 1: full setup → subtotal = 1440 + 1004.06 + 200 = 2644.06, total = 3344.74
  SELECT subtotal, total_amount INTO est_subtotal, est_total
  FROM public.estimates WHERE id = test_estimate_id;
  IF round(est_subtotal, 2) != 2644.06 THEN RAISE EXCEPTION 'FAIL 1 subtotal: %', est_subtotal; END IF;
  IF round(est_total, 2) != 3344.74 THEN RAISE EXCEPTION 'FAIL 1 total: %', est_total; END IF;

  -- Case 2: update CMU qty to 200 → 200×4.25×1.75 = 1487.50, subtotal = 1440 + 1487.50 + 200 = 3127.50
  UPDATE public.estimate_section_materials SET quantity = 200
  WHERE section_id = test_section_id AND description = 'CMU Block';
  SELECT subtotal INTO est_subtotal FROM public.estimates WHERE id = test_estimate_id;
  IF round(est_subtotal, 2) != 3127.50 THEN RAISE EXCEPTION 'FAIL 2 subtotal: %', est_subtotal; END IF;

  -- Case 3: zero labor → subtotal = takeoffs only = 1687.50
  UPDATE public.estimate_line_items SET labor_cost = 0 WHERE estimate_id = test_estimate_id;
  SELECT subtotal INTO est_subtotal FROM public.estimates WHERE id = test_estimate_id;
  IF round(est_subtotal, 2) != 1687.50 THEN RAISE EXCEPTION 'FAIL 3 zero-labor: %', est_subtotal; END IF;

  -- Case 4: delete takeoffs → subtotal = 0 (labor still 0)
  DELETE FROM public.estimate_section_materials WHERE section_id = test_section_id;
  SELECT subtotal INTO est_subtotal FROM public.estimates WHERE id = test_estimate_id;
  IF est_subtotal != 0 THEN RAISE EXCEPTION 'FAIL 4 no-takeoff: %', est_subtotal; END IF;

  -- Case 5: overhead_pct change on estimate triggers recompute
  UPDATE public.estimate_line_items SET labor_cost = 1000 WHERE estimate_id = test_estimate_id;
  UPDATE public.estimates SET overhead_pct = 20 WHERE id = test_estimate_id;
  -- subtotal=1000, overhead=200, vat=(1000+200)×0.10=120, total=1320
  SELECT total_amount INTO est_total FROM public.estimates WHERE id = test_estimate_id;
  IF round(est_total, 2) != 1320 THEN RAISE EXCEPTION 'FAIL 5 overhead change: %', est_total; END IF;

  DELETE FROM public.estimates WHERE id = test_estimate_id;
  RAISE NOTICE 'Option C two-grain smoke test PASSED — 5 cases ok';
END $$;
