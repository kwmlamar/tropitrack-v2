-- ============================================================
-- Add issue_date to estimates (referenced by /estimates list view).
-- Default to today for new rows; backfill from created_at for
-- existing rows. Update auto-create trigger accordingly.
-- ============================================================

ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS issue_date date DEFAULT CURRENT_DATE;

UPDATE public.estimates
SET issue_date = created_at::date
WHERE issue_date IS NULL;

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
    estimate_number, client_name, total_amount, issue_date
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
    0,
    CURRENT_DATE
  )
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;

NOTIFY pgrst, 'reload schema';
