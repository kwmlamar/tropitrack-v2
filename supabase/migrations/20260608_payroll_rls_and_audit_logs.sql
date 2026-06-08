-- Payroll RLS rewrite + audit_logs scaffolding.
-- Implements docs/rls-payroll-redesign.md (#17), unblocks #18.

BEGIN;

-- ============================================================================
-- 1. Helper functions
-- ============================================================================

CREATE OR REPLACE FUNCTION public.current_company_id() RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT company_id FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.is_admin() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
$$;

REVOKE ALL ON FUNCTION public.current_company_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_company_id() TO authenticated;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- ============================================================================
-- 2. Add company_id to pay_periods, payroll_entries, payment_transactions
-- ============================================================================

ALTER TABLE public.pay_periods
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE public.payroll_entries
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

-- ============================================================================
-- 3. Backfill company_id from related rows
-- ============================================================================

-- payroll_entries.company_id <- workers.company_id
UPDATE public.payroll_entries pe
SET company_id = w.company_id
FROM public.workers w
WHERE pe.worker_id = w.id
  AND pe.company_id IS NULL
  AND w.company_id IS NOT NULL;

-- payment_transactions.company_id <- parent payroll_entry.company_id
UPDATE public.payment_transactions pt
SET company_id = pe.company_id
FROM public.payroll_entries pe
WHERE pt.payroll_entry_id = pe.id
  AND pt.company_id IS NULL
  AND pe.company_id IS NOT NULL;

-- pay_periods.company_id <- from any associated payroll_entry
UPDATE public.pay_periods pp
SET company_id = sub.company_id
FROM (
  SELECT DISTINCT pay_period_id, company_id
  FROM public.payroll_entries
  WHERE company_id IS NOT NULL
) sub
WHERE pp.id = sub.pay_period_id
  AND pp.company_id IS NULL;

-- Final fallback: if exactly one company exists, assign orphans to it.
-- Defensive — single-tenant ODS today; if multi-tenant data exists, abort.
DO $$
DECLARE
  v_company_count INT;
  v_only_company UUID;
BEGIN
  SELECT COUNT(*) INTO v_company_count FROM public.companies;
  SELECT id INTO v_only_company FROM public.companies ORDER BY created_at LIMIT 1;
  IF v_company_count = 1 THEN
    UPDATE public.pay_periods         SET company_id = v_only_company WHERE company_id IS NULL;
    UPDATE public.payroll_entries     SET company_id = v_only_company WHERE company_id IS NULL;
    UPDATE public.payment_transactions SET company_id = v_only_company WHERE company_id IS NULL;
  ELSIF EXISTS (
    SELECT 1 FROM public.pay_periods WHERE company_id IS NULL
    UNION ALL SELECT 1 FROM public.payroll_entries WHERE company_id IS NULL
    UNION ALL SELECT 1 FROM public.payment_transactions WHERE company_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Multi-tenant data with orphaned company_id rows. Backfill manually before re-running.';
  END IF;
END $$;

ALTER TABLE public.pay_periods         ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.payroll_entries     ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.payment_transactions ALTER COLUMN company_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pay_periods_company         ON public.pay_periods(company_id);
CREATE INDEX IF NOT EXISTS idx_payroll_entries_company     ON public.payroll_entries(company_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_company ON public.payment_transactions(company_id);

-- ============================================================================
-- 4. Guard denormalization drift: payment_transactions.company_id must
--    match parent payroll_entry.company_id, set automatically.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.payment_transactions_set_company()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  SELECT company_id INTO NEW.company_id
  FROM public.payroll_entries
  WHERE id = NEW.payroll_entry_id;
  IF NEW.company_id IS NULL THEN
    RAISE EXCEPTION 'payroll_entry % has no company_id', NEW.payroll_entry_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_payment_tx_set_company ON public.payment_transactions;
CREATE TRIGGER trg_payment_tx_set_company
  BEFORE INSERT ON public.payment_transactions
  FOR EACH ROW EXECUTE FUNCTION public.payment_transactions_set_company();

-- Guard: payroll_entries.company_id must match workers.company_id.
CREATE OR REPLACE FUNCTION public.payroll_entries_check_company()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_worker_company UUID;
BEGIN
  SELECT company_id INTO v_worker_company FROM public.workers WHERE id = NEW.worker_id;
  IF v_worker_company IS NULL OR NEW.company_id <> v_worker_company THEN
    RAISE EXCEPTION 'payroll_entry.company_id (%) must match worker.company_id (%)',
      NEW.company_id, v_worker_company;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_payroll_entries_check_company ON public.payroll_entries;
CREATE TRIGGER trg_payroll_entries_check_company
  BEFORE INSERT OR UPDATE ON public.payroll_entries
  FOR EACH ROW EXECUTE FUNCTION public.payroll_entries_check_company();

-- ============================================================================
-- 5. Drop old RLS policies and replace with company-scoped ones
-- ============================================================================

-- profiles
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
CREATE POLICY "profiles_select_self_or_same_company" ON public.profiles
  FOR SELECT USING (id = auth.uid() OR company_id = public.current_company_id());
CREATE POLICY "profiles_update_admin_same_company" ON public.profiles
  FOR UPDATE USING (public.is_admin() AND company_id = public.current_company_id());
-- "Users can update own profile" stays as-is.

-- workers
DROP POLICY IF EXISTS "Users can view workers"   ON public.workers;
DROP POLICY IF EXISTS "Users can create workers" ON public.workers;
DROP POLICY IF EXISTS "Users can update workers" ON public.workers;
DROP POLICY IF EXISTS "Admins can delete workers" ON public.workers;
CREATE POLICY "workers_select_same_company" ON public.workers
  FOR SELECT USING (company_id = public.current_company_id());
CREATE POLICY "workers_insert_same_company" ON public.workers
  FOR INSERT WITH CHECK (company_id = public.current_company_id());
CREATE POLICY "workers_update_same_company" ON public.workers
  FOR UPDATE USING (company_id = public.current_company_id());
CREATE POLICY "workers_delete_admin_same_company" ON public.workers
  FOR DELETE USING (public.is_admin() AND company_id = public.current_company_id());

-- time_entries
DROP POLICY IF EXISTS "Users can view time entries"   ON public.time_entries;
DROP POLICY IF EXISTS "Users can create time entries" ON public.time_entries;
DROP POLICY IF EXISTS "Users can update time entries" ON public.time_entries;
DROP POLICY IF EXISTS "Admins can delete time entries" ON public.time_entries;
CREATE POLICY "time_entries_select_same_company" ON public.time_entries
  FOR SELECT USING (company_id = public.current_company_id());
CREATE POLICY "time_entries_insert_same_company" ON public.time_entries
  FOR INSERT WITH CHECK (company_id = public.current_company_id());
CREATE POLICY "time_entries_update_same_company" ON public.time_entries
  FOR UPDATE USING (company_id = public.current_company_id());
CREATE POLICY "time_entries_delete_admin_same_company" ON public.time_entries
  FOR DELETE USING (public.is_admin() AND company_id = public.current_company_id());

-- pay_periods
DROP POLICY IF EXISTS "Users can view pay periods"   ON public.pay_periods;
DROP POLICY IF EXISTS "Admins can manage pay periods" ON public.pay_periods;
DROP POLICY IF EXISTS "Authenticated users can create pay periods" ON public.pay_periods;
DROP POLICY IF EXISTS "Authenticated users can update pay periods" ON public.pay_periods;
CREATE POLICY "pay_periods_select_same_company" ON public.pay_periods
  FOR SELECT USING (company_id = public.current_company_id());
CREATE POLICY "pay_periods_insert_same_company" ON public.pay_periods
  FOR INSERT WITH CHECK (company_id = public.current_company_id());
CREATE POLICY "pay_periods_update_same_company" ON public.pay_periods
  FOR UPDATE USING (company_id = public.current_company_id());
CREATE POLICY "pay_periods_delete_admin_same_company" ON public.pay_periods
  FOR DELETE USING (public.is_admin() AND company_id = public.current_company_id());

-- payroll_entries
DROP POLICY IF EXISTS "Users can view payroll entries"   ON public.payroll_entries;
DROP POLICY IF EXISTS "Users can create payroll entries" ON public.payroll_entries;
DROP POLICY IF EXISTS "Users can update payroll entries" ON public.payroll_entries;
DROP POLICY IF EXISTS "Admins can delete payroll entries" ON public.payroll_entries;
DROP POLICY IF EXISTS "Admins can manage payroll entries" ON public.payroll_entries;
CREATE POLICY "payroll_entries_select_same_company" ON public.payroll_entries
  FOR SELECT USING (company_id = public.current_company_id());
CREATE POLICY "payroll_entries_insert_same_company" ON public.payroll_entries
  FOR INSERT WITH CHECK (company_id = public.current_company_id());
CREATE POLICY "payroll_entries_update_same_company" ON public.payroll_entries
  FOR UPDATE USING (company_id = public.current_company_id());
CREATE POLICY "payroll_entries_delete_admin_same_company" ON public.payroll_entries
  FOR DELETE USING (public.is_admin() AND company_id = public.current_company_id());

-- payment_transactions (append-only — no update/delete policies)
DROP POLICY IF EXISTS "Users can view payment transactions for their company's payroll"  ON public.payment_transactions;
DROP POLICY IF EXISTS "Users can insert payment transactions for their company's payroll" ON public.payment_transactions;
CREATE POLICY "payment_tx_select_same_company" ON public.payment_transactions
  FOR SELECT USING (company_id = public.current_company_id());
CREATE POLICY "payment_tx_insert_same_company" ON public.payment_transactions
  FOR INSERT WITH CHECK (company_id = public.current_company_id());

-- ============================================================================
-- 6. audit_logs — every state-changing tool call writes one row.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  source TEXT NOT NULL CHECK (source IN ('ui', 'ai', 'api', 'system')),
  tool_name TEXT NOT NULL,
  tool_version INT NOT NULL DEFAULT 1,
  scope TEXT NOT NULL CHECK (scope IN ('read', 'write')),
  tier TEXT NOT NULL CHECK (tier IN ('none', 'confirm', 'double-confirm')),
  confirmation_mode TEXT,
  input JSONB NOT NULL DEFAULT '{}',
  result JSONB,
  status TEXT NOT NULL CHECK (status IN ('ok', 'error', 'denied')),
  error_message TEXT,
  target_table TEXT,
  target_row_id UUID,
  thread_id UUID REFERENCES public.ai_threads(id) ON DELETE SET NULL,
  duration_ms INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_company_created ON public.audit_logs(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target          ON public.audit_logs(target_table, target_row_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_thread          ON public.audit_logs(thread_id);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Append-only from app code. SELECT scoped to company. No update, no delete.
CREATE POLICY "audit_logs_select_same_company" ON public.audit_logs
  FOR SELECT USING (company_id = public.current_company_id());
CREATE POLICY "audit_logs_insert_same_company" ON public.audit_logs
  FOR INSERT WITH CHECK (company_id = public.current_company_id());

COMMENT ON TABLE public.audit_logs IS 'Append-only log of every state-changing tool call. Source = ai|ui|api|system.';

COMMIT;
