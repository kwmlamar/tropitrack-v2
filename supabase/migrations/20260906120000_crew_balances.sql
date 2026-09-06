-- crew_balances(company) — "how much do we owe everyone", answered once, in SQL.
--
-- This is two-thirds of every question ever asked of the in-app assistant, and
-- no screen in TropiTrack answered it. It was answered by a language model
-- adding up columns, which on 2026-08-21 produced two different totals for the
-- same question on the same day. This function is the single source: the
-- dashboard tile, the payroll panel and the assistant all call it, so they
-- cannot disagree.
--
-- Ported from the TypeScript in src/lib/ai-tools/list-unpaid-workers.ts and
-- src/lib/ai-tools/worker-unpaid.ts, with three deliberate changes from those:
--
--   1. Both bases are returned. The TS used gross_pay - total_paid; the payroll
--      screen pays against net_pay - total_paid. Only 2 of ~20 workers have
--      nib_enabled, so for those two gross overstates what is actually handed
--      over. This function returns balance_gross AND balance_net per worker and
--      flags the difference in basis_note. It does not pick one — that is an
--      owner decision, not a schema decision.
--   2. Entries sitting inside a period someone marked 'paid' are included. The
--      TS filtered pay_periods.status <> 'paid', which silently dropped a
--      part-paid entry the moment the period was closed. A balance is a balance.
--   3. Uncovered time is time_entries falling in NO non-voided pay period, not
--      simply time after the last period end. That is the shape of the hole
--      that hid $53,026.48 — a gap between periods, not a tail.
--
-- security invoker + stable, so RLS applies as the calling user. Every query
-- also filters p_company_id explicitly.
--
-- Dates anchor to America/Nassau. The database runs UTC, which after ~20:00
-- local is already tomorrow; using current_date here would date the answer
-- wrong on exactly the evenings payroll gets asked about.
--
-- Each section runs in its own exception block, so a dropped column degrades
-- one band instead of blanking the payload.

CREATE OR REPLACE FUNCTION public.crew_balances(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'America/Nassau')::date;

  v_workers    jsonb := '[]'::jsonb;
  v_terminated jsonb := '[]'::jsonb;
  v_totals     jsonb := '{}'::jsonb;
  v_notes      jsonb := '[]'::jsonb;

  -- roster totals (non-terminated)
  v_gross      numeric := 0;
  v_net        numeric := 0;
  v_paid       numeric := 0;
  v_bal_gross  numeric := 0;
  v_bal_net    numeric := 0;
  v_unc_value  numeric := 0;
  v_unc_reg    numeric := 0;
  v_unc_ot     numeric := 0;
  v_unc_since  date;
  v_entries    int     := 0;
  v_owed_count int     := 0;

  -- terminated totals
  v_term_gross numeric := 0;
  v_term_net   numeric := 0;
  v_term_count int     := 0;

  -- company-wide scratch
  v_periods    int;
  v_oldest     date;
  v_roster     int;
  v_nib_on     int;
  v_no_rate    int;
BEGIN
  -- ── Per-worker balances ──────────────────────────────────────────────────
  -- Built once and split by termination status, so a terminated worker still
  -- carrying a balance is reported rather than filtered into nonexistence.
  BEGIN
    SELECT
      coalesce(jsonb_agg(to_jsonb(x) - 'is_terminated'
                         ORDER BY x.total_owed_gross DESC)
               FILTER (WHERE NOT x.is_terminated), '[]'::jsonb),
      coalesce(jsonb_agg(to_jsonb(x) - 'is_terminated'
                         ORDER BY x.total_owed_gross DESC)
               FILTER (WHERE x.is_terminated), '[]'::jsonb)
      INTO v_workers, v_terminated
    FROM (
      SELECT
        w.id                                        AS worker_id,
        btrim(w.first_name || ' ' || w.last_name)   AS name,
        w.hourly_rate,
        coalesce(w.overtime_rate_multiplier, 1.5)   AS overtime_multiplier,
        w.status,
        coalesce(w.nib_enabled, false)              AS nib_enabled,
        (w.status = 'terminated')                   AS is_terminated,
        jsonb_build_object(
          'entries',             coalesce(op.entries, 0),
          'gross_pay',           round(coalesce(op.gross_pay, 0), 2),
          'total_paid',          round(coalesce(op.total_paid, 0), 2),
          'balance_gross',       round(coalesce(op.bal_gross, 0), 2),
          'balance_net',         round(coalesce(op.bal_net, 0), 2),
          'oldest_period_start', op.oldest_start,
          'in_closed_periods',   coalesce(op.in_closed, 0)
        )                                           AS outstanding,
        jsonb_build_object(
          'since',           ut.since,
          'regular_hours',   round(coalesce(ut.reg, 0), 2),
          'overtime_hours',  round(coalesce(ut.ot, 0), 2),
          'entries',         coalesce(ut.entries, 0),
          'value',           round(coalesce(ut.value, 0), 2)
        )                                           AS uncovered_time,
        round(coalesce(op.bal_gross, 0) + coalesce(ut.value, 0), 2) AS total_owed_gross,
        round(coalesce(op.bal_net, 0)   + coalesce(ut.value, 0), 2) AS total_owed_net
      FROM workers w
      LEFT JOIN LATERAL (
        -- Non-voided entries with money still on them, in any non-voided period.
        -- Period status is deliberately NOT filtered — see note 2 above.
        SELECT count(*)                                              AS entries,
               sum(pe.gross_pay)                                     AS gross_pay,
               sum(coalesce(pe.total_paid, 0))                       AS total_paid,
               sum(pe.gross_pay - coalesce(pe.total_paid, 0))        AS bal_gross,
               sum(pe.net_pay   - coalesce(pe.total_paid, 0))        AS bal_net,
               min(pp.start_date)                                    AS oldest_start,
               count(*) FILTER (WHERE pp.status = 'paid')            AS in_closed
        FROM payroll_entries pe
        JOIN pay_periods pp ON pp.id = pe.pay_period_id
        WHERE pe.worker_id = w.id
          AND pe.company_id = p_company_id
          AND pe.voided_at IS NULL
          AND pp.voided_at IS NULL
          AND pe.payment_status IN ('unpaid', 'partial')
          AND pe.gross_pay - coalesce(pe.total_paid, 0) > 0
      ) op ON true
      LEFT JOIN LATERAL (
        -- Hours logged into a gap: no non-voided pay period covers the date, so
        -- no payroll entry was ever generated from them. Valued at the worker's
        -- CURRENT rate — there is no historical rate table (see notes).
        SELECT min(te.date)                                          AS since,
               count(*)                                              AS entries,
               sum(te.regular_hours)                                 AS reg,
               sum(coalesce(te.overtime_hours, 0))                   AS ot,
               sum(te.regular_hours * coalesce(w.hourly_rate, 0)
                   + coalesce(te.overtime_hours, 0) * coalesce(w.hourly_rate, 0)
                     * coalesce(w.overtime_rate_multiplier, 1.5))    AS value
        FROM time_entries te
        WHERE te.worker_id = w.id
          AND te.company_id = p_company_id
          AND NOT EXISTS (
            SELECT 1 FROM pay_periods pp
            WHERE pp.company_id = p_company_id
              AND pp.voided_at IS NULL
              AND te.date BETWEEN pp.start_date AND pp.end_date)
      ) ut ON true
      WHERE w.company_id = p_company_id
        AND (coalesce(op.bal_gross, 0) > 0 OR coalesce(ut.value, 0) > 0)
    ) x;
  EXCEPTION WHEN OTHERS THEN
    v_workers := '[]'::jsonb;
    v_terminated := '[]'::jsonb;
    v_notes := v_notes || to_jsonb('per-worker balances could not be computed'::text);
  END;

  -- ── Totals ───────────────────────────────────────────────────────────────
  -- Summed from the same rows the list shows, so the headline and the table
  -- can never drift apart.
  BEGIN
    SELECT
      coalesce(sum((e -> 'outstanding' ->> 'gross_pay')::numeric), 0),
      coalesce(sum((e -> 'outstanding' ->> 'total_paid')::numeric), 0),
      coalesce(sum((e -> 'outstanding' ->> 'balance_gross')::numeric), 0),
      coalesce(sum((e -> 'outstanding' ->> 'balance_net')::numeric), 0),
      coalesce(sum((e -> 'outstanding' ->> 'entries')::int), 0),
      coalesce(sum((e -> 'uncovered_time' ->> 'value')::numeric), 0),
      coalesce(sum((e -> 'uncovered_time' ->> 'regular_hours')::numeric), 0),
      coalesce(sum((e -> 'uncovered_time' ->> 'overtime_hours')::numeric), 0),
      min((e -> 'uncovered_time' ->> 'since')::date),
      count(*)
      INTO v_gross, v_paid, v_bal_gross, v_bal_net, v_entries,
           v_unc_value, v_unc_reg, v_unc_ot, v_unc_since, v_owed_count
    FROM jsonb_array_elements(v_workers) e;

    v_net := v_gross - (v_bal_gross - v_bal_net);

    SELECT
      coalesce(sum((e ->> 'total_owed_gross')::numeric), 0),
      coalesce(sum((e ->> 'total_owed_net')::numeric), 0),
      count(*)
      INTO v_term_gross, v_term_net, v_term_count
    FROM jsonb_array_elements(v_terminated) e;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- Company-wide context: how many periods carry the balance and how far back.
  BEGIN
    SELECT count(DISTINCT pe.pay_period_id), min(pp.start_date)
      INTO v_periods, v_oldest
    FROM payroll_entries pe
    JOIN pay_periods pp ON pp.id = pe.pay_period_id
    WHERE pe.company_id = p_company_id
      AND pe.voided_at IS NULL
      AND pp.voided_at IS NULL
      AND pe.payment_status IN ('unpaid', 'partial')
      AND pe.gross_pay - coalesce(pe.total_paid, 0) > 0;

    SELECT count(*) FILTER (WHERE w.status <> 'terminated'),
           count(*) FILTER (WHERE coalesce(w.nib_enabled, false)
                              AND w.status <> 'terminated'),
           count(*) FILTER (WHERE coalesce(w.hourly_rate, 0) = 0
                              AND w.status <> 'terminated')
      INTO v_roster, v_nib_on, v_no_rate
    FROM workers w WHERE w.company_id = p_company_id;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- ── Notes the caller must render, not swallow ────────────────────────────
  IF v_unc_value > 0 THEN
    v_notes := v_notes || to_jsonb(format(
      'BSD $%s of logged time falls in no pay period (since %s). It has never reached payroll — it is owed, but no payroll entry exists for it.',
      to_char(v_unc_value, 'FM999,999,990.00'), coalesce(v_unc_since::text, 'unknown'))::text);
  END IF;

  IF v_no_rate > 0 THEN
    v_notes := v_notes || to_jsonb(format(
      '%s active worker(s) have no hourly_rate on file; their uncovered time is valued at zero and is understated.',
      v_no_rate)::text);
  END IF;

  v_notes := v_notes || to_jsonb(
    'Uncovered time is valued at each worker''s CURRENT hourly rate. There is no historical rate table, so a rate changed since the work was done makes older figures approximate.'::text);

  -- ── Payload ──────────────────────────────────────────────────────────────
  v_totals := jsonb_build_object(
    'outstanding_payroll_gross', round(v_bal_gross, 2),
    'outstanding_payroll_net',   round(v_bal_net, 2),
    'gross_pay',                 round(v_gross, 2),
    'total_paid',                round(v_paid, 2),
    'entry_count',               v_entries,
    'period_count',              coalesce(v_periods, 0),
    'oldest_unpaid_period_start', v_oldest,
    'uncovered_time_value',      round(v_unc_value, 2),
    'uncovered_regular_hours',   round(v_unc_reg, 2),
    'uncovered_overtime_hours',  round(v_unc_ot, 2),
    'uncovered_since',           v_unc_since,
    'total_owed_gross',          round(v_bal_gross + v_unc_value, 2),
    'total_owed_net',            round(v_bal_net + v_unc_value, 2),
    'workers_owed',              v_owed_count,
    'roster_size',               coalesce(v_roster, 0),
    'terminated_owed_count',     v_term_count,
    'terminated_owed_gross',     round(v_term_gross, 2),
    'terminated_owed_net',       round(v_term_net, 2),
    'grand_total_gross',         round(v_bal_gross + v_unc_value + v_term_gross, 2),
    'grand_total_net',           round(v_bal_net + v_unc_value + v_term_net, 2)
  );

  RETURN jsonb_build_object(
    'as_of',   v_today,
    'currency', 'BSD',
    'totals',  v_totals,
    'workers', v_workers,
    'terminated_with_balance', v_terminated,
    -- The basis question, stated rather than resolved. Whoever renders this
    -- must show which number they picked.
    'basis', jsonb_build_object(
      'gross_minus_paid', round(v_bal_gross, 2),
      'net_minus_paid',   round(v_bal_net, 2),
      'difference',       round(v_bal_gross - v_bal_net, 2),
      'nib_workers',      coalesce(v_nib_on, 0)
    ),
    'basis_note', format(
      'Two bases. Gross basis (gross_pay - total_paid) is BSD $%s; net basis (net_pay - total_paid, after NIB) is BSD $%s — a difference of BSD $%s across %s worker(s) with NIB enabled. The payroll screen pays on the net basis; the AI tools historically reported gross. Which one is "owed" is an owner decision and is not made here.',
      to_char(v_bal_gross, 'FM999,999,990.00'),
      to_char(v_bal_net, 'FM999,999,990.00'),
      to_char(v_bal_gross - v_bal_net, 'FM999,999,990.00'),
      coalesce(v_nib_on, 0)),
    'notes', v_notes,
    'generated_at', now()
  );
END;
$$;

COMMENT ON FUNCTION public.crew_balances(uuid) IS
  'Read-only per-worker and company-wide "what do we owe the crew" payload: outstanding payroll balances plus time logged into gaps between pay periods. security invoker, so RLS applies as the caller. Returns BOTH gross and net bases and flags the difference rather than choosing one. Dates anchored to America/Nassau. The dashboard tile, the payroll panel and the AI tool all call this, so their numbers cannot disagree.';

-- Covers the per-worker lateral: entries for one worker, filtered by status,
-- with the balance predicate. The existing company_id index does not help a
-- per-worker lookup.
CREATE INDEX IF NOT EXISTS idx_payroll_entries_worker_unpaid
  ON public.payroll_entries(worker_id, payment_status)
  WHERE voided_at IS NULL;

-- Covers the uncovered-time lateral, which probes time_entries per worker
-- across the whole date range.
CREATE INDEX IF NOT EXISTS idx_time_entries_worker_date
  ON public.time_entries(worker_id, date);
