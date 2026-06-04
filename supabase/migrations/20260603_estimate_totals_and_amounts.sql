-- ============================================================
-- Make estimate totals roll up live from line items.
-- - estimate_line_items.amount  = labor + material + equipment (GENERATED)
-- - estimate_line_items.unit_rate = amount / quantity (GENERATED)
-- - estimates gets subtotal/overhead_amount/profit_amount/tax_amount
-- - Trigger recalculates totals on line-item INSERT/UPDATE/DELETE
--   and on estimate pct changes
-- ============================================================

ALTER TABLE public.estimate_line_items
  ADD COLUMN IF NOT EXISTS amount numeric(12,2)
    GENERATED ALWAYS AS (
      COALESCE(labor_cost,0) + COALESCE(material_cost,0) + COALESCE(equipment_cost,0)
    ) STORED,
  ADD COLUMN IF NOT EXISTS unit_rate numeric(12,2)
    GENERATED ALWAYS AS (
      CASE WHEN COALESCE(quantity,0) > 0
        THEN (COALESCE(labor_cost,0) + COALESCE(material_cost,0) + COALESCE(equipment_cost,0)) / quantity
        ELSE 0
      END
    ) STORED;

ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS subtotal              numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overhead_amount       numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS profit_margin_percent numeric(5,2)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS profit_amount         numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_rate              numeric(5,2)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_amount            numeric(12,2) NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.recalc_estimate_totals(p_estimate_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_subtotal     numeric(12,2);
  v_overhead_pct numeric(5,2);
  v_tax_pct      numeric(5,2);
  v_profit_pct   numeric(5,2);
  v_overhead     numeric(12,2);
  v_profit       numeric(12,2);
  v_tax          numeric(12,2);
  v_total        numeric(12,2);
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO v_subtotal
  FROM public.estimate_line_items WHERE estimate_id = p_estimate_id;

  SELECT COALESCE(overhead_pct, 0), COALESCE(vat_pct, 0), COALESCE(profit_margin_percent, 0)
    INTO v_overhead_pct, v_tax_pct, v_profit_pct
  FROM public.estimates WHERE id = p_estimate_id;

  v_overhead := ROUND(v_subtotal * v_overhead_pct / 100, 2);
  v_profit   := ROUND((v_subtotal + v_overhead) * v_profit_pct / 100, 2);
  v_tax      := ROUND((v_subtotal + v_overhead + v_profit) * v_tax_pct / 100, 2);
  v_total    := v_subtotal + v_overhead + v_profit + v_tax;

  UPDATE public.estimates
  SET subtotal=v_subtotal, overhead_amount=v_overhead, profit_amount=v_profit,
      tax_amount=v_tax, total_amount=v_total, updated_at=now()
  WHERE id = p_estimate_id;
END $$;

CREATE OR REPLACE FUNCTION public.trg_line_items_recalc_estimate()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalc_estimate_totals(OLD.estimate_id);
    RETURN OLD;
  ELSE
    PERFORM public.recalc_estimate_totals(NEW.estimate_id);
    IF TG_OP = 'UPDATE' AND OLD.estimate_id <> NEW.estimate_id THEN
      PERFORM public.recalc_estimate_totals(OLD.estimate_id);
    END IF;
    RETURN NEW;
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_line_items_recalc ON public.estimate_line_items;
CREATE TRIGGER trg_line_items_recalc
  AFTER INSERT OR UPDATE OR DELETE ON public.estimate_line_items
  FOR EACH ROW EXECUTE FUNCTION public.trg_line_items_recalc_estimate();

CREATE OR REPLACE FUNCTION public.trg_estimate_pct_recalc()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.overhead_pct IS DISTINCT FROM OLD.overhead_pct
     OR NEW.vat_pct IS DISTINCT FROM OLD.vat_pct
     OR NEW.profit_margin_percent IS DISTINCT FROM OLD.profit_margin_percent THEN
    PERFORM public.recalc_estimate_totals(NEW.id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_estimate_pct_recalc ON public.estimates;
CREATE TRIGGER trg_estimate_pct_recalc
  AFTER UPDATE OF overhead_pct, vat_pct, profit_margin_percent ON public.estimates
  FOR EACH ROW EXECUTE FUNCTION public.trg_estimate_pct_recalc();

-- Backfill totals
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT id FROM public.estimates LOOP
    PERFORM public.recalc_estimate_totals(r.id);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
