-- Voided columns on payroll_entries: same pattern as pay_periods void.

ALTER TABLE public.payroll_entries
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS void_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_payroll_entries_voided ON public.payroll_entries(voided_at) WHERE voided_at IS NOT NULL;

COMMENT ON COLUMN public.payroll_entries.voided_at IS 'Timestamp when entry was voided. NULL = active. Voided entries are kept for audit but excluded from balances.';
COMMENT ON COLUMN public.payroll_entries.void_reason IS 'Required when voiding. Free-text explanation shown in the audit trail.';

-- payroll_adjustments was missing company_id under the new RLS regime.
ALTER TABLE public.payroll_adjustments
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

UPDATE public.payroll_adjustments pa
SET company_id = w.company_id
FROM public.workers w
WHERE pa.worker_id = w.id AND pa.company_id IS NULL AND w.company_id IS NOT NULL;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.payroll_adjustments WHERE company_id IS NULL) THEN
    UPDATE public.payroll_adjustments
    SET company_id = (SELECT id FROM public.companies ORDER BY created_at LIMIT 1)
    WHERE company_id IS NULL;
  END IF;
END $$;

ALTER TABLE public.payroll_adjustments ALTER COLUMN company_id SET NOT NULL;

DROP POLICY IF EXISTS "Users can view payroll adjustments" ON public.payroll_adjustments;
DROP POLICY IF EXISTS "Admins can create payroll adjustments" ON public.payroll_adjustments;
DROP POLICY IF EXISTS "Admins can update payroll adjustments" ON public.payroll_adjustments;
CREATE POLICY "payroll_adjustments_select_same_company" ON public.payroll_adjustments
  FOR SELECT USING (company_id = public.current_company_id());
CREATE POLICY "payroll_adjustments_insert_admin_same_company" ON public.payroll_adjustments
  FOR INSERT WITH CHECK (public.is_admin() AND company_id = public.current_company_id());
CREATE POLICY "payroll_adjustments_update_admin_same_company" ON public.payroll_adjustments
  FOR UPDATE USING (public.is_admin() AND company_id = public.current_company_id());
