-- ============================================================
-- Smoke test for Issue #2 — markup model + catalog snapshot
-- ============================================================
-- Verifies against the live composite line-item shape:
--   - labor_cost + material_cost + equipment_cost are stored per row
--   - amount + unit_rate are GENERATED columns (do not insert them)
--   - no `category` column on line items (composite, not single-category)
--
-- Cases:
--   1. Sell formula with estimate default markups (material 75%, equipment 0%)
--   2. Per-line markup_pct override applies to both portions
--   3. Equipment-only line with default 0% markup yields pass-through
--   4. Catalog price change does NOT mutate snapshotted line item material_cost
--   5. Schema invariants
--
-- Run:
--   psql $DATABASE_URL -f supabase/tests/issue_2_markup_and_snapshot.sql
-- ============================================================

DO $$
DECLARE
  test_estimate_id uuid;
  test_section_id  uuid;
  test_line_id     uuid;
  test_company_id  uuid;
  test_material_id text := 'SMOKE_TEST_material_issue_2';
  computed_sell    numeric;
  saved_material   numeric;
BEGIN
  SELECT id INTO test_company_id FROM public.companies LIMIT 1;
  IF test_company_id IS NULL THEN
    RAISE EXCEPTION 'No company exists — seed at least one before running this test';
  END IF;

  INSERT INTO public.materials (id, division_code, division_name, category, name, unit, unit_cost)
  VALUES (test_material_id, '00', 'TEST', 'test', 'TEST CMU Block', 'EACH', 4.25);

  INSERT INTO public.estimates
    (company_id, name, status, default_material_markup_pct, default_equipment_markup_pct)
  VALUES (test_company_id, 'SMOKE_TEST_issue_2', 'draft', 75, 0)
  RETURNING id INTO test_estimate_id;

  INSERT INTO public.estimate_sections (estimate_id, name, order_index)
  VALUES (test_estimate_id, 'Test Section', 0)
  RETURNING id INTO test_section_id;

  -- amount + unit_rate are generated; omit from insert
  INSERT INTO public.estimate_line_items
    (estimate_id, section_id, description, material_id,
     quantity, unit, man_days,
     labor_cost, material_cost, equipment_cost,
     order_index, daily_workers, show_to_client)
  VALUES
    (test_estimate_id, test_section_id, 'TEST composite task', test_material_id,
     1, 'EACH', 5,
     900, 100, 0,
     0, '{}'::jsonb, true)
  RETURNING id INTO test_line_id;

  -- Case 1: defaults → 900 + 100×1.75 + 0×1.00 = 1075
  SELECT eli.labor_cost
       + eli.material_cost  * (1 + COALESCE(eli.markup_pct, e.default_material_markup_pct)  / 100)
       + eli.equipment_cost * (1 + COALESCE(eli.markup_pct, e.default_equipment_markup_pct) / 100)
  INTO computed_sell
  FROM public.estimate_line_items eli
  JOIN public.estimates e ON e.id = eli.estimate_id
  WHERE eli.id = test_line_id;
  IF computed_sell != 1075 THEN
    RAISE EXCEPTION 'FAIL case 1 — expected 1075, got %', computed_sell;
  END IF;

  -- Case 2: per-line override (50%) applies to both portions → 900 + 100×1.50 + 200×1.50 = 1350
  UPDATE public.estimate_line_items
  SET markup_pct = 50, equipment_cost = 200
  WHERE id = test_line_id;

  SELECT eli.labor_cost
       + eli.material_cost  * (1 + COALESCE(eli.markup_pct, e.default_material_markup_pct)  / 100)
       + eli.equipment_cost * (1 + COALESCE(eli.markup_pct, e.default_equipment_markup_pct) / 100)
  INTO computed_sell
  FROM public.estimate_line_items eli
  JOIN public.estimates e ON e.id = eli.estimate_id
  WHERE eli.id = test_line_id;
  IF computed_sell != 1350 THEN
    RAISE EXCEPTION 'FAIL case 2 — expected 1350, got %', computed_sell;
  END IF;

  -- Case 3: equipment-only, default 0% markup → 500
  UPDATE public.estimate_line_items
  SET markup_pct = NULL, labor_cost = 0, material_cost = 0, equipment_cost = 500
  WHERE id = test_line_id;

  SELECT eli.labor_cost
       + eli.material_cost  * (1 + COALESCE(eli.markup_pct, e.default_material_markup_pct)  / 100)
       + eli.equipment_cost * (1 + COALESCE(eli.markup_pct, e.default_equipment_markup_pct) / 100)
  INTO computed_sell
  FROM public.estimate_line_items eli
  JOIN public.estimates e ON e.id = eli.estimate_id
  WHERE eli.id = test_line_id;
  IF computed_sell != 500 THEN
    RAISE EXCEPTION 'FAIL case 3 — expected 500, got %', computed_sell;
  END IF;

  -- Case 4: snapshot — restore material_cost=100, change catalog, verify line stays
  UPDATE public.estimate_line_items
  SET labor_cost = 900, material_cost = 100, equipment_cost = 0
  WHERE id = test_line_id;
  UPDATE public.materials SET unit_cost = 999.99 WHERE id = test_material_id;

  SELECT material_cost INTO saved_material
  FROM public.estimate_line_items WHERE id = test_line_id;
  IF saved_material != 100 THEN
    RAISE EXCEPTION 'FAIL case 4 — snapshot violated: material_cost is % but should still be 100', saved_material;
  END IF;

  DELETE FROM public.estimates WHERE id = test_estimate_id;
  DELETE FROM public.materials WHERE id = test_material_id;

  RAISE NOTICE 'Markup + snapshot smoke test PASSED — all 4 cases ok';
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='estimates'
                   AND column_name='default_material_markup_pct') THEN
    RAISE EXCEPTION 'FAIL: estimates.default_material_markup_pct missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='estimates'
                   AND column_name='default_equipment_markup_pct') THEN
    RAISE EXCEPTION 'FAIL: estimates.default_equipment_markup_pct missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='estimate_line_items'
                   AND column_name='markup_pct') THEN
    RAISE EXCEPTION 'FAIL: estimate_line_items.markup_pct missing';
  END IF;

  RAISE NOTICE 'Issue #2 schema invariants PASSED';
END $$;
