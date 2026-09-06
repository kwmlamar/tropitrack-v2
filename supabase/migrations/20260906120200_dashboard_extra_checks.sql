-- dashboard_extra_checks(company) — Needs Attention rows added AFTER the
-- original dashboard_summary shipped.
--
-- dashboard_summary is deliberately left untouched: the owner has ruled its
-- existing checks stay as they are, miscalibrations included. New checks live
-- here and the dashboard concatenates the two arrays. Same row shape:
--   { key, severity, count, date_ref?, amount?, href }
--
-- Check 1 — the assistant's API key is dead.
-- The feature died on 2026-08-31 when the Anthropic key ran out of credits.
-- The UI said nothing and the same question was asked into silence nine times
-- over six days. GET /api/ai/health writes an audit_logs row on every run
-- (tool_name 'ai_health_check', source 'system'). If the newest such row is a
-- failure and nothing has succeeded in 24 hours, that belongs on the dashboard
-- where somebody will see it.

CREATE OR REPLACE FUNCTION public.dashboard_extra_checks(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
DECLARE
  v_attention jsonb := '[]'::jsonb;
  v_last_status text;
  v_last_at     timestamptz;
  v_last_ok     timestamptz;
  v_reason      text;
BEGIN
  BEGIN
    SELECT a.status, a.created_at, a.error_message
      INTO v_last_status, v_last_at, v_reason
    FROM audit_logs a
    WHERE a.company_id = p_company_id
      AND a.tool_name = 'ai_health_check'
    ORDER BY a.created_at DESC
    LIMIT 1;

    SELECT max(a.created_at) INTO v_last_ok
    FROM audit_logs a
    WHERE a.company_id = p_company_id
      AND a.tool_name = 'ai_health_check'
      AND a.status = 'ok';

    -- Failing now, and no successful call in the last 24 hours.
    IF v_last_status = 'error'
       AND (v_last_ok IS NULL OR v_last_ok < now() - interval '24 hours') THEN
      v_attention := v_attention || jsonb_build_object(
        'key',      'ai_offline',
        'severity', 'destructive',
        'count',    1,
        'date_ref', coalesce(v_last_ok, v_last_at)::date,
        'href',     '/settings');
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN v_attention;
END;
$$;

COMMENT ON FUNCTION public.dashboard_extra_checks(uuid) IS
  'Needs Attention rows added after dashboard_summary shipped; that function is frozen by owner decision, so new checks are concatenated from here. Same row shape. Currently: the assistant''s API key has been failing for more than 24 hours.';

-- The health check reads the newest row and the newest success for one company.
CREATE INDEX IF NOT EXISTS idx_audit_logs_company_tool_created
  ON public.audit_logs(company_id, tool_name, created_at DESC);
