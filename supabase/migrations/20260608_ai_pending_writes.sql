-- Pending writes: server-staged proposals waiting on user confirmation.
-- Lifecycle: pending -> (confirmed | cancelled | expired). Resolution logs to audit_logs.

CREATE TABLE IF NOT EXISTS public.ai_pending_writes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  thread_id UUID NOT NULL REFERENCES public.ai_threads(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  tool_version INT NOT NULL DEFAULT 1,
  tier TEXT NOT NULL CHECK (tier IN ('confirm', 'double-confirm')),
  input JSONB NOT NULL,
  summary TEXT NOT NULL,
  double_confirm_answer TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'expired')),
  result JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '15 minutes')
);

CREATE INDEX IF NOT EXISTS idx_pending_writes_thread_status ON public.ai_pending_writes(thread_id, status);
CREATE INDEX IF NOT EXISTS idx_pending_writes_company       ON public.ai_pending_writes(company_id, created_at DESC);

ALTER TABLE public.ai_pending_writes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pending_writes_select_own" ON public.ai_pending_writes
  FOR SELECT USING (user_id = auth.uid() AND company_id = public.current_company_id());
CREATE POLICY "pending_writes_insert_own" ON public.ai_pending_writes
  FOR INSERT WITH CHECK (user_id = auth.uid() AND company_id = public.current_company_id());
CREATE POLICY "pending_writes_update_own" ON public.ai_pending_writes
  FOR UPDATE USING (user_id = auth.uid() AND company_id = public.current_company_id());

COMMENT ON TABLE public.ai_pending_writes IS 'Tool calls staged for user confirmation. Resolved into audit_logs on confirm/cancel.';
