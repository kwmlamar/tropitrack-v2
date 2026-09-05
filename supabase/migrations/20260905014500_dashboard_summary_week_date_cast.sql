-- Filing, retroactively, a fix that was applied directly to the live database
-- and never checked in: `supabase list_migrations` on this project shows a
-- migration named "dashboard_summary_week_date_cast" recorded at version
-- 20260905014500 (2026-09-05 01:45:00), with no corresponding file in this
-- repo — meaning migration history here did not reproduce production.
--
-- What the fix itself changed cannot be reconstructed from git: this file
-- has exactly one commit in its history (feat(dashboard): rebuild /dashboard
-- around decisions...), and that commit's content is already byte-for-byte
-- identical (function body) to what's live today — someone edited the
-- checked-in 20260904_dashboard_summary.sql in place to match the post-fix
-- state, rather than adding a second migration file for the fix. So there is
-- no "before" version left in git to diff against.
--
-- What this file does instead: re-declares the function, at the timestamp
-- the fix actually ran, with the exact body that is live today (identical
-- to 20260904_dashboard_summary.sql). CREATE OR REPLACE is a full
-- redeclaration, not a patch, so this is safe and idempotent regardless of
-- what the original bug was — replaying 20260904 → this file → this
-- branch's 20260905120200 (which adds check 10 on top) converges to the
-- same state production is in at each step. It does not independently prove
-- what "week_date_cast" fixed; it closes the gap in the migration ledger.

CREATE OR REPLACE FUNCTION public.dashboard_summary(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_today        date := (now() AT TIME ZONE 'America/Nassau')::date;
  v_week_start   date;
  v_prev_start   date;
  v_month_start  date;
  v_last_workday date;

  v_money     jsonb := '{}'::jsonb;
  v_attention jsonb := '[]'::jsonb;
  v_jobs      jsonb := '[]'::jsonb;
  v_week      jsonb := '{}'::jsonb;

  v_owed_total     numeric;
  v_owed_count     int;
  v_oldest_issue   date;
  v_has_invoices   boolean;
  v_payments_exist boolean;
  v_month_in       numeric;
  v_month_out      numeric;
  v_payroll_out    numeric;
  v_receipts_out   numeric;
  v_po_out         numeric;

  v_period_id     uuid;
  v_period_start  date;
  v_period_end    date;
  v_period_labour numeric;
  v_other_open    int;

  v_n   int;
  v_sum numeric;
  v_dt  date;
BEGIN
  v_week_start  := v_today - (EXTRACT(isodow FROM v_today)::int - 1);
  v_prev_start  := v_week_start - 7;
  v_month_start := date_trunc('month', v_today)::date;

  SELECT max(te.date) INTO v_last_workday
  FROM time_entries te WHERE te.company_id = p_company_id;

  -- ── Band 1: money ────────────────────────────────────────────────────────
  SELECT count(*), coalesce(sum(i.balance_due), 0), min(i.issue_date)
    INTO v_owed_count, v_owed_total, v_oldest_issue
  FROM invoices i
  WHERE i.company_id = p_company_id
    AND coalesce(i.status, '') NOT IN ('paid', 'void', 'cancelled');

  SELECT EXISTS (SELECT 1 FROM invoices i WHERE i.company_id = p_company_id)
    INTO v_has_invoices;

  SELECT EXISTS (
    SELECT 1 FROM payments pm
    JOIN invoices i ON i.id = pm.invoice_id
    WHERE i.company_id = p_company_id
  ) INTO v_payments_exist;

  IF v_payments_exist THEN
    SELECT coalesce(sum(pm.amount), 0) INTO v_month_in
    FROM payments pm
    JOIN invoices i ON i.id = pm.invoice_id
    WHERE i.company_id = p_company_id
      AND pm.payment_date >= v_month_start;
  ELSE
    v_month_in := NULL;
  END IF;

  SELECT coalesce(sum(pe.total_paid), 0) INTO v_payroll_out
  FROM payroll_entries pe
  WHERE pe.company_id = p_company_id
    AND pe.voided_at IS NULL
    AND pe.paid_at >= v_month_start;

  SELECT coalesce(sum(r.total_amount), 0) INTO v_receipts_out
  FROM receipts r
  WHERE r.company_id = p_company_id AND r.receipt_date >= v_month_start;

  SELECT coalesce(sum(po.total_amount), 0) INTO v_po_out
  FROM purchase_orders po
  WHERE po.company_id = p_company_id AND po.order_date >= v_month_start;

  v_month_out := v_payroll_out + v_receipts_out + v_po_out;

  -- Current open pay period: the newest one still processing.
  SELECT pp.id, pp.start_date, pp.end_date
    INTO v_period_id, v_period_start, v_period_end
  FROM pay_periods pp
  WHERE pp.company_id = p_company_id AND pp.status = 'processing'
  ORDER BY pp.end_date DESC
  LIMIT 1;

  IF v_period_id IS NOT NULL THEN
    SELECT coalesce(sum(
             te.regular_hours * coalesce(w.hourly_rate, 0)
             + te.overtime_hours * coalesce(w.hourly_rate, 0)
               * coalesce(w.overtime_rate_multiplier, 1.5)
           ), 0)
      INTO v_period_labour
    FROM time_entries te
    JOIN workers w ON w.id = te.worker_id
    WHERE te.company_id = p_company_id
      AND te.date BETWEEN v_period_start AND v_period_end;

    SELECT count(*) INTO v_other_open
    FROM pay_periods pp
    WHERE pp.company_id = p_company_id
      AND pp.status = 'processing'
      AND pp.id <> v_period_id;
  END IF;

  v_money := jsonb_build_object(
    'owed', CASE WHEN v_has_invoices THEN jsonb_build_object(
        'total',         round(coalesce(v_owed_total, 0), 2),
        'invoice_count', v_owed_count,
        'oldest_days',   CASE WHEN v_oldest_issue IS NULL THEN NULL
                              ELSE (v_today - v_oldest_issue) END
      ) ELSE NULL END,
    'open_period', CASE WHEN v_period_id IS NOT NULL THEN jsonb_build_object(
        'id',            v_period_id,
        'start_date',    v_period_start,
        'end_date',      v_period_end,
        'labour_cost',   round(coalesce(v_period_labour, 0), 2),
        'days_to_close', (v_period_end - v_today),
        'other_open',    coalesce(v_other_open, 0)
      ) ELSE NULL END,
    'month', jsonb_build_object(
        'in',           CASE WHEN v_month_in IS NULL THEN NULL ELSE round(v_month_in, 2) END,
        'in_recorded',  v_payments_exist,
        'out',          round(coalesce(v_month_out, 0), 2),
        'out_payroll',  round(coalesce(v_payroll_out, 0), 2),
        'out_receipts', round(coalesce(v_receipts_out, 0), 2),
        'out_po',       round(coalesce(v_po_out, 0), 2)
      )
  );

  -- ── Band 2: needs attention ──────────────────────────────────────────────
  -- 1 — pay periods left processing more than a fortnight past their end date
  BEGIN
    SELECT count(*), min(pp.end_date) INTO v_n, v_dt
    FROM pay_periods pp
    WHERE pp.company_id = p_company_id
      AND pp.status = 'processing'
      AND pp.end_date < v_today - 14;
    IF coalesce(v_n, 0) > 0 THEN
      v_attention := v_attention || jsonb_build_object(
        'key', 'stale_pay_periods', 'severity', 'destructive',
        'count', v_n, 'date_ref', v_dt, 'href', '/payroll');
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- 2 — open invoices with nothing paid, issued over 30 days ago
  BEGIN
    SELECT count(*), coalesce(sum(i.balance_due), 0) INTO v_n, v_sum
    FROM invoices i
    WHERE i.company_id = p_company_id
      AND coalesce(i.status, '') NOT IN ('paid', 'void', 'cancelled')
      AND coalesce(i.amount_paid, 0) = 0
      AND i.issue_date < v_today - 30;
    IF coalesce(v_n, 0) > 0 THEN
      v_attention := v_attention || jsonb_build_object(
        'key', 'invoices_unpaid_30', 'severity', 'destructive',
        'count', v_n, 'amount', round(v_sum, 2), 'href', '/invoices');
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- 3 — receipts whose image_url is missing or is not a resolvable path.
  --     (Every row currently holds the literal string 'uploaded'.)
  BEGIN
    SELECT count(*) INTO v_n
    FROM receipts r
    WHERE r.company_id = p_company_id
      AND (r.image_url IS NULL OR btrim(r.image_url) = ''
           OR r.image_url !~ '^(https?://|/)');
    IF coalesce(v_n, 0) > 0 THEN
      v_attention := v_attention || jsonb_build_object(
        'key', 'receipts_no_image', 'severity', 'destructive',
        'count', v_n, 'href', '/receipts');
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- 4 — draft estimates still priced at zero
  BEGIN
    SELECT count(*) INTO v_n
    FROM estimates e
    WHERE e.company_id = p_company_id
      AND e.status = 'draft'
      AND coalesce(e.total_amount, 0) = 0;
    IF coalesce(v_n, 0) > 0 THEN
      v_attention := v_attention || jsonb_build_object(
        'key', 'estimates_unpriced', 'severity', 'warning',
        'count', v_n, 'href', '/estimates');
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- 5 — live jobs with no budget set
  BEGIN
    SELECT count(*) INTO v_n
    FROM projects p
    WHERE p.company_id = p_company_id
      AND p.status IN ('active', 'in_progress')
      AND coalesce(p.budget, 0) = 0;
    IF coalesce(v_n, 0) > 0 THEN
      v_attention := v_attention || jsonb_build_object(
        'key', 'jobs_no_budget', 'severity', 'warning',
        'count', v_n, 'href', '/projects');
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- 6 — jobs taking labour in the last fortnight with no estimate attached
  BEGIN
    SELECT count(*) INTO v_n
    FROM projects p
    WHERE p.company_id = p_company_id
      AND p.status IN ('active', 'in_progress')
      AND EXISTS (SELECT 1 FROM time_entries te
                  WHERE te.project_id = p.id AND te.date >= v_today - 14)
      AND NOT EXISTS (SELECT 1 FROM estimates e WHERE e.project_id = p.id);
    IF coalesce(v_n, 0) > 0 THEN
      v_attention := v_attention || jsonb_build_object(
        'key', 'jobs_no_estimate', 'severity', 'warning',
        'count', v_n, 'href', '/projects');
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- 7 — receipts never itemised
  BEGIN
    SELECT count(*) INTO v_n
    FROM receipts r
    WHERE r.company_id = p_company_id
      AND NOT EXISTS (SELECT 1 FROM receipt_line_items li WHERE li.receipt_id = r.id);
    IF coalesce(v_n, 0) > 0 THEN
      v_attention := v_attention || jsonb_build_object(
        'key', 'receipts_not_itemised', 'severity', 'warning',
        'count', v_n, 'href', '/receipts');
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- 8 — active crew with nothing logged on the most recent working day.
  --     Anchored to the last date that actually has entries, so a weekend or a
  --     public holiday does not flag the entire crew.
  BEGIN
    IF v_last_workday IS NOT NULL THEN
      SELECT count(*) INTO v_n
      FROM workers w
      WHERE w.company_id = p_company_id
        AND w.status = 'active'
        AND NOT EXISTS (SELECT 1 FROM time_entries te
                        WHERE te.worker_id = w.id AND te.date = v_last_workday);
      IF coalesce(v_n, 0) > 0 THEN
        v_attention := v_attention || jsonb_build_object(
          'key', 'crew_no_hours', 'severity', 'info',
          'count', v_n, 'date_ref', v_last_workday, 'href', '/time-tracking');
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- 9 — invoice numbers outside the INV-YYYY-NNN sequence
  BEGIN
    SELECT count(*) INTO v_n
    FROM invoices i
    WHERE i.company_id = p_company_id
      AND (i.invoice_number IS NULL OR i.invoice_number !~ '^INV-\d{4}-\d{3}$');
    IF coalesce(v_n, 0) > 0 THEN
      v_attention := v_attention || jsonb_build_object(
        'key', 'invoice_numbering', 'severity', 'info',
        'count', v_n, 'href', '/invoices');
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- ── Band 3: jobs by money ────────────────────────────────────────────────
  BEGIN
    SELECT coalesce(jsonb_agg(j ORDER BY j.has_budget ASC, j.spent_pct DESC NULLS LAST), '[]'::jsonb)
      INTO v_jobs
    FROM (
      SELECT
        p.id,
        p.name,
        coalesce(nullif(btrim(p.client_name), ''), c.name) AS client,
        round(coalesce(p.contract_value, 0), 2)            AS contract,
        round(coalesce(p.budget, 0), 2)                    AS budget,
        p.status,
        round(coalesce(lab.cost, 0), 2)                    AS labour,
        round(coalesce(po.total, 0) + coalesce(rc.total, 0), 2) AS materials,
        (coalesce(p.budget, 0) > 0)                        AS has_budget,
        CASE WHEN coalesce(p.budget, 0) > 0
             THEN round(((coalesce(lab.cost, 0) + coalesce(po.total, 0)
                          + coalesce(rc.total, 0)) / p.budget) * 100, 1)
             ELSE NULL END                                 AS spent_pct
      FROM projects p
      LEFT JOIN clients c ON c.id = p.client_id
      LEFT JOIN LATERAL (
        SELECT sum(te.regular_hours * coalesce(w.hourly_rate, 0)
                   + te.overtime_hours * coalesce(w.hourly_rate, 0)
                     * coalesce(w.overtime_rate_multiplier, 1.5)) AS cost
        FROM time_entries te
        JOIN workers w ON w.id = te.worker_id
        WHERE te.project_id = p.id
      ) lab ON true
      LEFT JOIN LATERAL (
        SELECT sum(po2.total_amount) AS total FROM purchase_orders po2
        WHERE po2.project_id = p.id AND coalesce(po2.status, '') <> 'cancelled'
      ) po ON true
      LEFT JOIN LATERAL (
        SELECT sum(r2.total_amount) AS total FROM receipts r2
        WHERE r2.project_id = p.id
      ) rc ON true
      WHERE p.company_id = p_company_id
        AND p.status IN ('active', 'in_progress')
    ) j;
  EXCEPTION WHEN OTHERS THEN v_jobs := '[]'::jsonb;
  END;

  -- ── Band 4: this week ────────────────────────────────────────────────────
  BEGIN
    SELECT jsonb_build_object(
      'week_start', v_week_start,
      'days', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
                 'date', d.day::date,
                 'hours', round(coalesce(h.hrs, 0), 2)
               ) ORDER BY d.day), '[]'::jsonb)
        FROM generate_series(v_week_start, v_week_start + 6, interval '1 day') AS d(day)
        LEFT JOIN LATERAL (
          SELECT sum(te.regular_hours + te.overtime_hours) AS hrs
          FROM time_entries te
          WHERE te.company_id = p_company_id AND te.date = d.day::date
        ) h ON true
      ),
      'hours_this_week', (
        SELECT round(coalesce(sum(te.regular_hours + te.overtime_hours), 0), 2)
        FROM time_entries te WHERE te.company_id = p_company_id
          AND te.date >= v_week_start AND te.date < v_week_start + 7),
      'hours_last_week', (
        SELECT round(coalesce(sum(te.regular_hours + te.overtime_hours), 0), 2)
        FROM time_entries te WHERE te.company_id = p_company_id
          AND te.date >= v_prev_start AND te.date < v_week_start),
      'crew_today', (
        SELECT count(DISTINCT te.worker_id) FROM time_entries te
        WHERE te.company_id = p_company_id AND te.date = v_today),
      'last_workday', v_last_workday,
      'today', v_today
    ) INTO v_week;
  EXCEPTION WHEN OTHERS THEN v_week := '{}'::jsonb;
  END;

  RETURN jsonb_build_object(
    'money', v_money,
    'attention', v_attention,
    'jobs', v_jobs,
    'week', v_week,
    'generated_at', now()
  );
END;
$function$;

COMMENT ON FUNCTION public.dashboard_summary(uuid) IS
  'Read-only aggregate payload for the Today dashboard. security invoker, so RLS applies as the caller. Dates anchored to America/Nassau. Money-in is NULL rather than 0 when no payment has ever been recorded, so the UI can distinguish "no data" from "zero received".';
