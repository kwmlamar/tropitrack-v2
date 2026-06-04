-- ============================================================
-- Add display columns the existing /estimates page expects.
-- The auto-create trigger from 20260603_single_source_gantt.sql
-- produced rows without these fields, causing the list view
-- to crash on null .toLowerCase() calls.
-- ============================================================

-- ─── 1. Add columns ──────────────────────────────────────────────────────────
ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS estimate_number text,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS client_name text,
  ADD COLUMN IF NOT EXISTS total_amount numeric(12,2) DEFAULT 0;

-- ─── 2. Backfill existing rows ──────────────────────────────────────────────
WITH numbered AS (
  SELECT id, row_number() OVER (ORDER BY created_at) AS rn
  FROM public.estimates
  WHERE estimate_number IS NULL
)
UPDATE public.estimates e
SET estimate_number = 'EST-' || LPAD(n.rn::text, 5, '0')
FROM numbered n
WHERE e.id = n.id;

UPDATE public.estimates SET title = name WHERE title IS NULL;

UPDATE public.estimates e
SET client_name = COALESCE(p.client_name, '')
FROM public.projects p
WHERE e.project_id = p.id AND e.client_name IS NULL;

UPDATE public.estimates SET client_name = '' WHERE client_name IS NULL;
UPDATE public.estimates SET total_amount = 0 WHERE total_amount IS NULL;

-- ─── 3. Unique estimate_number going forward ─────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_estimates_estimate_number
  ON public.estimates(estimate_number)
  WHERE estimate_number IS NOT NULL;

-- ─── 4. Update auto-create trigger to populate the new fields ────────────────
CREATE OR REPLACE FUNCTION public.ensure_project_estimate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_n  integer;
  new_num text;
BEGIN
  SELECT COALESCE(MAX(SUBSTRING(estimate_number FROM 'EST-(\d+)')::int), 0) + 1
    INTO next_n
    FROM public.estimates
    WHERE estimate_number ~ '^EST-\d+$';
  new_num := 'EST-' || LPAD(next_n::text, 5, '0');

  INSERT INTO public.estimates (
    project_id, company_id, name, title, status, created_by,
    estimate_number, client_name, total_amount
  )
  VALUES (
    NEW.id,
    NEW.company_id,
    COALESCE(NEW.name, 'Untitled') || ' — Estimate',
    COALESCE(NEW.name, 'Untitled') || ' — Estimate',
    'draft',
    NEW.created_by,
    new_num,
    COALESCE(NEW.client_name, ''),
    0
  )
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;

NOTIFY pgrst, 'reload schema';
