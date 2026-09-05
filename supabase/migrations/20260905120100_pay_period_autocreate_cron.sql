-- Schedule the weekly self-healing pay-period job.
--
-- The actual period-creation logic lives in the edge function
-- supabase/functions/autocreate-pay-periods (deploy separately with
-- `supabase functions deploy autocreate-pay-periods` — migrations don't
-- deploy function code). This migration only wires pg_cron to call it.
--
-- Per company, the function walks forward from the latest non-voided
-- period's end_date to today, creating one 'open' pay_periods row per week
-- with no payroll_entries — so a lapse self-heals on the very next run
-- instead of accumulating. It never reaches backward past the latest
-- period, so it will never backfill the four historical gaps documented in
-- docs/FINDINGS-labour-payroll-reconciliation.md §2.1 — those remain a
-- deliberate, unautomated decision for the owner.
--
-- ── One-time manual setup (cannot be done from a migration file) ──────────
-- Run once in the Supabase SQL editor for this project, using the anon/
-- publishable key (this is deliberately the low-privilege key — it just
-- authenticates the HTTP call into the edge function; the function itself
-- uses its own SUPABASE_SERVICE_ROLE_KEY, injected automatically by the
-- edge runtime, to do the actual cross-company writes):
--
--   select vault.create_secret('https://rrqpwtggiirexptnhyqy.supabase.co', 'project_url');
--   select vault.create_secret('<anon-or-publishable-key-from-project-settings>', 'publishable_key');
--
-- These aren't set here because they're environment-specific runtime
-- config (like a Vercel env var), not schema — the same reason no API key
-- ever lives in a migration file.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'autocreate-pay-periods') THEN
    PERFORM cron.unschedule('autocreate-pay-periods');
  END IF;
END $$;

-- Saturdays at 06:00 UTC — periods run Sat→Fri, so this creates the new
-- week's period right as it opens, and catches up any lapse at the same time.
SELECT cron.schedule(
  'autocreate-pay-periods',
  '0 6 * * 6',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url')
           || '/functions/v1/autocreate-pay-periods',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'publishable_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
