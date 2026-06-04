-- ============================================================
-- Issue #2: markup model + catalog snapshot behavior
-- ============================================================
-- Adds the markup-percentage model:
--   estimates.default_material_markup_pct   — default 75 (industry norm for ODS)
--   estimates.default_equipment_markup_pct  — default 0 (often pass-through)
--   estimate_line_items.markup_pct          — per-line override, null falls back
--
-- Sell amount formula (computed in app):
--   sell_amount = qty × unit_rate × (1 + COALESCE(line.markup_pct, default-for-category) / 100)
--
-- Snapshot behavior is enforced in app code, not schema — line items already
-- have description / unit / unit_rate columns, the contract is that those get
-- populated FROM the catalog on add and never live-referenced.
-- ============================================================

ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS default_material_markup_pct numeric(5,2) NOT NULL DEFAULT 75
    CHECK (default_material_markup_pct >= 0),
  ADD COLUMN IF NOT EXISTS default_equipment_markup_pct numeric(5,2) NOT NULL DEFAULT 0
    CHECK (default_equipment_markup_pct >= 0);

COMMENT ON COLUMN public.estimates.default_material_markup_pct IS
  'Default markup % applied to material line items when the line does not override. ODS default 75%.';
COMMENT ON COLUMN public.estimates.default_equipment_markup_pct IS
  'Default markup % applied to equipment line items when the line does not override. Default 0 (pass-through).';

ALTER TABLE public.estimate_line_items
  ADD COLUMN IF NOT EXISTS markup_pct numeric(5,2)
    CHECK (markup_pct IS NULL OR markup_pct >= 0);

COMMENT ON COLUMN public.estimate_line_items.markup_pct IS
  'Per-line markup % override. NULL means use estimate default for this category.';
