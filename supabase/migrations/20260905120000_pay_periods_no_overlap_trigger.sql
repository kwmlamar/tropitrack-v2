-- Prevent two non-voided pay_periods from ever overlapping for the same
-- company again. See docs/FINDINGS-labour-payroll-reconciliation.md §2.6/§5 —
-- cd6ab878 (ends 2026-04-03) and 7539cd7a (starts 2026-04-03) share an
-- inclusive boundary date and double-paid 7 workers $635.04 for that day.
--
-- This is a BEFORE-trigger check, not a table-wide EXCLUDE constraint. An
-- EXCLUDE constraint would need to validate every existing row against every
-- other row, which fails today because of that historical pair (and the
-- 5-week 6429ca76 period, which overlaps four subsequent weekly periods) —
-- and those rows must not be touched; the money decision belongs to the
-- owner, not this migration. A trigger only ever checks the row being
-- written, so it closes the door going forward without requiring the past
-- to already be clean.
--
-- Voided periods are exempt (voiding is how you retire a bad period without
-- deleting it) and never blocked by this check.

CREATE OR REPLACE FUNCTION public.pay_periods_check_no_overlap()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.voided_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.pay_periods pp
    WHERE pp.company_id = NEW.company_id
      AND pp.id <> NEW.id
      AND pp.voided_at IS NULL
      AND daterange(pp.start_date, pp.end_date, '[]')
          && daterange(NEW.start_date, NEW.end_date, '[]')
  ) THEN
    RAISE EXCEPTION
      'Pay period % to % overlaps an existing pay period for this company',
      NEW.start_date, NEW.end_date
      USING ERRCODE = '23P01';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pay_periods_no_overlap ON public.pay_periods;

CREATE TRIGGER trg_pay_periods_no_overlap
BEFORE INSERT OR UPDATE OF start_date, end_date, company_id, voided_at
ON public.pay_periods
FOR EACH ROW
EXECUTE FUNCTION public.pay_periods_check_no_overlap();

COMMENT ON FUNCTION public.pay_periods_check_no_overlap() IS
  'Blocks INSERT/UPDATE of a non-voided pay_periods row whose date range overlaps another non-voided period for the same company. Does not validate pre-existing rows against each other — only the row being written.';
