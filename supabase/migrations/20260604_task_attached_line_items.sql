-- ============================================================
-- Issue #1: task-attached line items + labor formula
-- ============================================================
-- Reality check: on the live DB, line items are ALREADY attached to
-- sections via estimate_line_items.section_id (NOT NULL), and each line
-- item carries its own labor_cost / material_cost / equipment_cost +
-- crew_days + daily_workers (jsonb). Line items ARE tasks in this model.
--
-- This migration:
--   1. Drops unused section_tasks (artifact from 20260603_single_source_gantt)
--   2. Adds man_days to estimate_line_items
--   3. Adds labor_sell_rate_per_day to estimates
--   4. Backfills man_days from existing crew_days × daily_workers data
--
-- Labor cost formula (computed in app):
--   labor_cost = man_days * COALESCE(line_item.labor_sell_rate_per_day,
--                                    estimate.labor_sell_rate_per_day)
-- ============================================================

-- ─── 1. Drop unused section_tasks table ──────────────────────────────────────
-- This was created by 20260603_single_source_gantt but never wired into the
-- app — line items attach directly to sections, not through tasks.
DROP TABLE IF EXISTS public.section_tasks CASCADE;

-- ─── 2. Add man_days to estimate_line_items ──────────────────────────────────
ALTER TABLE public.estimate_line_items
  ADD COLUMN IF NOT EXISTS man_days numeric(10,2) NOT NULL DEFAULT 0
    CHECK (man_days >= 0);

-- Per-line override; falls back to estimates.labor_sell_rate_per_day
ALTER TABLE public.estimate_line_items
  ADD COLUMN IF NOT EXISTS labor_sell_rate_per_day numeric(10,2);

COMMENT ON COLUMN public.estimate_line_items.man_days IS
  'Total worker-days for this task. Labor cost = man_days * COALESCE(line.labor_sell_rate_per_day, estimate.labor_sell_rate_per_day).';

-- ─── 3. Add labor_sell_rate_per_day to estimates ─────────────────────────────
-- ODS uses a single blended rate (no specialty roles). SaaS customers with
-- per-role rates can use the labor_roles jsonb column instead.
ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS labor_sell_rate_per_day numeric(10,2);

COMMENT ON COLUMN public.estimates.labor_sell_rate_per_day IS
  'Default labor sell rate per worker-day. Used when line item does not override. ODS workflow: single blended rate, no specialty roles.';

-- ─── 4. Backfill man_days from existing crew_days + daily_workers ────────────
-- For existing line items where man_days = 0 but crew_days > 0:
--   - Prefer sum of daily_workers values (most accurate — captures variable crew per day)
--   - Fall back to crew_days × 1 (assumes 1 worker if no daily breakdown)
UPDATE public.estimate_line_items
SET man_days = COALESCE(
  -- Sum the values in daily_workers jsonb if present
  (SELECT SUM((value)::numeric)
   FROM jsonb_each_text(daily_workers)
   WHERE value ~ '^[0-9]+(\.[0-9]+)?$'),
  -- Fallback: crew_days assuming 1 worker
  crew_days::numeric,
  0
)
WHERE man_days = 0 AND (crew_days IS NOT NULL OR daily_workers != '{}'::jsonb);

-- ─── 5. Verify no inconsistent state ─────────────────────────────────────────
DO $$
DECLARE
  bad_count integer;
BEGIN
  -- Check that all line items have a section_id (should already be NOT NULL but verify)
  SELECT count(*) INTO bad_count
  FROM public.estimate_line_items
  WHERE section_id IS NULL;

  IF bad_count > 0 THEN
    RAISE EXCEPTION 'Found % line items without section_id — schema invariant violated', bad_count;
  END IF;
END $$;
