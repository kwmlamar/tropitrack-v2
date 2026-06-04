-- ============================================================
-- Option C: split labor and materials at the model level
-- ============================================================
-- Locks in the two-grain estimate model:
--   - estimate_line_items  → LABOR only (man_days × rate via labor_cost)
--   - estimate_section_materials → MATERIALS + EQUIPMENT (takeoff)
--
-- Migration steps:
--   1. Backfill: any line_item with material_cost or equipment_cost > 0
--      becomes a synthetic takeoff line on its section. markup_pct = 0 so
--      historical estimate totals are preserved exactly during the migration.
--   2. Zero out material_cost / equipment_cost on all line items. Since
--      `amount` is generated, it drops to `labor_cost` after this.
--   3. Rewrite update_estimate_totals trigger function:
--         subtotal = sum(labor from line_items) + sum(sell from takeoffs)
--         overhead = subtotal × estimates.overhead_pct / 100
--         vat = (subtotal + overhead) × estimates.vat_pct / 100
--         total = subtotal + overhead + vat
--      (Uses the actual live column names — overhead_pct, vat_pct.)
--   4. Bind the trigger on both estimate_line_items and estimate_section_materials.
--   5. Recompute totals on every existing estimate one-time.
-- ============================================================

-- ─── 1. Backfill takeoff lines from existing task material/equipment costs ──
-- Materials backfill
INSERT INTO public.estimate_section_materials
  (section_id, description, quantity, unit, unit_cost, markup_pct, is_equipment, order_index)
SELECT
  eli.section_id,
  CASE
    WHEN COALESCE(NULLIF(trim(eli.description), ''), '') = ''
      THEN 'Material (migrated)'
    ELSE 'Material — ' || eli.description
  END,
  1,
  COALESCE(eli.unit, 'EACH'),
  eli.material_cost,
  0,  -- markup_pct=0 so the historic cost flows through as-is
  false,
  COALESCE(eli.order_index, 0) * 10 + 1
FROM public.estimate_line_items eli
WHERE eli.material_cost > 0;

-- Equipment backfill
INSERT INTO public.estimate_section_materials
  (section_id, description, quantity, unit, unit_cost, markup_pct, is_equipment, order_index)
SELECT
  eli.section_id,
  CASE
    WHEN COALESCE(NULLIF(trim(eli.description), ''), '') = ''
      THEN 'Equipment (migrated)'
    ELSE 'Equipment — ' || eli.description
  END,
  1,
  COALESCE(eli.unit, 'EACH'),
  eli.equipment_cost,
  0,
  true,
  COALESCE(eli.order_index, 0) * 10 + 2
FROM public.estimate_line_items eli
WHERE eli.equipment_cost > 0;

-- ─── 2. Zero out task material_cost + equipment_cost ────────────────────────
-- `amount` is GENERATED from labor + material + equipment, so this drops it to
-- labor only. Tasks now own labor exclusively.
UPDATE public.estimate_line_items
SET material_cost = 0, equipment_cost = 0
WHERE material_cost > 0 OR equipment_cost > 0;

-- ─── 3. Rewrite the trigger function for the two-grain model ────────────────
CREATE OR REPLACE FUNCTION public.update_estimate_totals()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  est_id          uuid;
  labor_sum       numeric(14, 2);
  takeoff_sell    numeric(14, 2);
  new_subtotal    numeric(14, 2);
  overhead_pct    numeric(5, 2);
  vat_pct         numeric(5, 2);
  default_mat_mk  numeric(5, 2);
  default_eq_mk   numeric(5, 2);
  new_overhead    numeric(14, 2);
  new_vat         numeric(14, 2);
BEGIN
  -- Figure out which estimate to update — works whether the row came from
  -- estimate_line_items (has estimate_id) or estimate_section_materials
  -- (has section_id → estimate_id via join).
  IF TG_TABLE_NAME = 'estimate_line_items' THEN
    est_id := COALESCE(NEW.estimate_id, OLD.estimate_id);
  ELSIF TG_TABLE_NAME = 'estimate_section_materials' THEN
    SELECT s.estimate_id INTO est_id
    FROM public.estimate_sections s
    WHERE s.id = COALESCE(NEW.section_id, OLD.section_id);
  END IF;

  IF est_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Labor sum — line items' generated `amount` after material/equip zeroed = labor_cost
  SELECT COALESCE(SUM(amount), 0) INTO labor_sum
  FROM public.estimate_line_items
  WHERE estimate_id = est_id;

  -- Lookup the markup defaults for the takeoff sell computation
  SELECT
    COALESCE(default_material_markup_pct, 0),
    COALESCE(default_equipment_markup_pct, 0),
    COALESCE(overhead_pct, 0),
    COALESCE(vat_pct, 0)
  INTO default_mat_mk, default_eq_mk, overhead_pct, vat_pct
  FROM public.estimates WHERE id = est_id;

  -- Takeoff sell sum — apply per-line markup_pct override or fall back to default
  -- depending on is_equipment flag
  SELECT COALESCE(SUM(
    m.quantity * m.unit_cost * (1 +
      CASE WHEN m.is_equipment
           THEN COALESCE(m.markup_pct, default_eq_mk)
           ELSE COALESCE(m.markup_pct, default_mat_mk)
      END / 100)
  ), 0) INTO takeoff_sell
  FROM public.estimate_section_materials m
  JOIN public.estimate_sections s ON s.id = m.section_id
  WHERE s.estimate_id = est_id;

  new_subtotal := labor_sum + takeoff_sell;
  new_overhead := new_subtotal * overhead_pct / 100;
  new_vat      := (new_subtotal + new_overhead) * vat_pct / 100;

  UPDATE public.estimates
  SET subtotal       = new_subtotal,
      overhead_amount = new_overhead,
      tax_amount     = new_vat,
      total_amount   = new_subtotal + new_overhead + new_vat
  WHERE id = est_id;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

COMMENT ON FUNCTION public.update_estimate_totals IS
  'Recomputes estimates.subtotal/overhead/vat/total from the two-grain model: labor sum (line_items.amount, which equals labor_cost after Option C migration) + takeoff sell sum (estimate_section_materials with markup applied). Fired by triggers on both source tables.';

-- ─── 4. Bind triggers on both source tables ─────────────────────────────────
DROP TRIGGER IF EXISTS trg_estimate_line_items_totals ON public.estimate_line_items;
CREATE TRIGGER trg_estimate_line_items_totals
  AFTER INSERT OR UPDATE OR DELETE ON public.estimate_line_items
  FOR EACH ROW EXECUTE FUNCTION public.update_estimate_totals();

DROP TRIGGER IF EXISTS trg_estimate_section_materials_totals ON public.estimate_section_materials;
CREATE TRIGGER trg_estimate_section_materials_totals
  AFTER INSERT OR UPDATE OR DELETE ON public.estimate_section_materials
  FOR EACH ROW EXECUTE FUNCTION public.update_estimate_totals();

-- ─── 5. One-time recompute for all existing estimates ───────────────────────
-- Touch every line item so the trigger fires once per estimate.
-- (Setting a column to its own value is enough — AFTER UPDATE fires regardless.)
UPDATE public.estimate_line_items SET order_index = order_index;

-- For estimates that have NO line items but DO have takeoff materials,
-- fire via the materials trigger too.
UPDATE public.estimate_section_materials SET order_index = order_index;
