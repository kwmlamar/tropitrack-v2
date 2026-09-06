-- project_labor_cost(project) — "labour on [job]", answered once, in SQL.
--
-- The second of the two questions that make up two-thirds of all assistant
-- usage. Same rule as crew_balances: the job page and the assistant call this
-- function, so a labour figure quoted in chat is the figure on the screen.
--
-- Rates are workers.hourly_rate. These are crew wage rates and this is a COST
-- figure, not a client price: no ODS rate card, no markup, no O&P. Pricing work
-- is authored outside this app, where the rate card and the house formats live.
--
-- Overtime uses the same rule as /payroll and dashboard_summary:
-- regular_hours × rate + overtime_hours × rate × overtime_rate_multiplier (1.5).
--
-- security invoker + stable: RLS on projects, time_entries and workers scopes
-- this to the caller's company. The function takes a project id rather than a
-- company id and deliberately does not re-filter on company — a caller who
-- cannot see the project gets an empty payload from RLS, not a leak.

CREATE OR REPLACE FUNCTION public.project_labor_cost(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'America/Nassau')::date;

  v_project jsonb;
  v_workers jsonb := '[]'::jsonb;
  v_totals  jsonb := '{}'::jsonb;
  v_notes   jsonb := '[]'::jsonb;

  v_name        text;
  v_budget      numeric;
  v_contract    numeric;
  v_no_contract boolean;

  v_cost      numeric := 0;
  v_reg       numeric := 0;
  v_ot        numeric := 0;
  v_days      int     := 0;
  v_entries   int     := 0;
  v_zero      int     := 0;
  v_headcount int     := 0;
  v_first     date;
  v_last      date;
  v_no_rate   int     := 0;
BEGIN
  SELECT jsonb_build_object(
           'id',              p.id,
           'name',            p.name,
           'client',          coalesce(nullif(btrim(p.client_name), ''), c.name),
           'location',        p.location,
           'status',          p.status,
           'budget',          round(coalesce(p.budget, 0), 2),
           'contract_value',  round(coalesce(p.contract_value, 0), 2),
           'no_fixed_contract', coalesce(p.no_fixed_contract, false),
           'start_date',      p.start_date,
           'estimated_end_date', p.estimated_end_date
         ),
         p.name, coalesce(p.budget, 0), coalesce(p.contract_value, 0),
         coalesce(p.no_fixed_contract, false)
    INTO v_project, v_name, v_budget, v_contract, v_no_contract
  FROM projects p
  LEFT JOIN clients c ON c.id = p.client_id
  WHERE p.id = p_project_id;

  IF v_project IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'project not found, or not visible to this user',
      'as_of', v_today,
      'generated_at', now());
  END IF;

  -- ── Per-worker labour on this job ────────────────────────────────────────
  BEGIN
    SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.cost DESC), '[]'::jsonb)
      INTO v_workers
    FROM (
      SELECT
        w.id                                      AS worker_id,
        btrim(w.first_name || ' ' || w.last_name) AS name,
        w.hourly_rate,
        coalesce(w.overtime_rate_multiplier, 1.5) AS overtime_multiplier,
        -- Days = dates that actually carry hours. A zero-hour entry is counted
        -- separately below rather than inflating the day count.
        count(DISTINCT te.date) FILTER (
          WHERE te.regular_hours + coalesce(te.overtime_hours, 0) > 0)      AS days,
        count(*)                                                            AS entries,
        count(*) FILTER (
          WHERE te.regular_hours + coalesce(te.overtime_hours, 0) = 0)      AS zero_hour_entries,
        round(sum(te.regular_hours), 2)                                     AS regular_hours,
        round(sum(coalesce(te.overtime_hours, 0)), 2)                       AS overtime_hours,
        round(sum(te.regular_hours * coalesce(w.hourly_rate, 0)
                  + coalesce(te.overtime_hours, 0) * coalesce(w.hourly_rate, 0)
                    * coalesce(w.overtime_rate_multiplier, 1.5)), 2)        AS cost,
        min(te.date)                                                        AS first_date,
        max(te.date)                                                        AS last_date
      FROM time_entries te
      JOIN workers w ON w.id = te.worker_id
      WHERE te.project_id = p_project_id
      GROUP BY w.id, w.first_name, w.last_name, w.hourly_rate, w.overtime_rate_multiplier
    ) x;
  EXCEPTION WHEN OTHERS THEN
    v_workers := '[]'::jsonb;
    v_notes := v_notes || to_jsonb('per-worker labour could not be computed'::text);
  END;

  -- ── Totals, summed from the same rows the table shows ────────────────────
  BEGIN
    SELECT
      coalesce(sum((e ->> 'cost')::numeric), 0),
      coalesce(sum((e ->> 'regular_hours')::numeric), 0),
      coalesce(sum((e ->> 'overtime_hours')::numeric), 0),
      coalesce(sum((e ->> 'entries')::int), 0),
      coalesce(sum((e ->> 'zero_hour_entries')::int), 0),
      count(*),
      min((e ->> 'first_date')::date),
      max((e ->> 'last_date')::date),
      count(*) FILTER (WHERE coalesce((e ->> 'hourly_rate')::numeric, 0) = 0)
      INTO v_cost, v_reg, v_ot, v_entries, v_zero, v_headcount, v_first, v_last, v_no_rate
    FROM jsonb_array_elements(v_workers) e;

    SELECT count(DISTINCT te.date) INTO v_days
    FROM time_entries te
    WHERE te.project_id = p_project_id
      AND te.regular_hours + coalesce(te.overtime_hours, 0) > 0;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- ── Notes the caller must render ─────────────────────────────────────────
  v_notes := v_notes || to_jsonb(
    'Cost is crew wage rates (workers.hourly_rate) — not a client price. No markup, overhead or profit is applied.'::text);

  v_notes := v_notes || to_jsonb(
    'Hours are valued at each worker''s CURRENT hourly rate. There is no historical rate table, so any rate changed since the work was done makes older figures approximate.'::text);

  IF v_zero > 0 THEN
    v_notes := v_notes || to_jsonb(format(
      '%s time entr%s on this job carry zero hours. They are counted in the entry count but contribute nothing to cost.',
      v_zero, CASE WHEN v_zero = 1 THEN 'y' ELSE 'ies' END)::text);
  END IF;

  IF v_no_rate > 0 THEN
    v_notes := v_notes || to_jsonb(format(
      '%s worker(s) on this job have no hourly_rate on file; their hours cost zero here and the total is understated.',
      v_no_rate)::text);
  END IF;

  IF v_budget = 0 THEN
    v_notes := v_notes || to_jsonb(
      'This job has no budget set, so labour cannot be reported as a share of budget.'::text);
  END IF;

  v_totals := jsonb_build_object(
    'labour_cost',        round(v_cost, 2),
    'regular_hours',      round(v_reg, 2),
    'overtime_hours',     round(v_ot, 2),
    'total_hours',        round(v_reg + v_ot, 2),
    'workers',            v_headcount,
    'crew_days',          coalesce(v_days, 0),
    'entries',            v_entries,
    'zero_hour_entries',  v_zero,
    'first_date',         v_first,
    'last_date',          v_last
  );

  RETURN jsonb_build_object(
    'ok',       true,
    'as_of',    v_today,
    'currency', 'BSD',
    'project',  v_project,
    'workers',  v_workers,
    'totals',   v_totals,
    'against_budget', jsonb_build_object(
      'budget',    round(v_budget, 2),
      'has_budget', v_budget > 0,
      'labour_pct', CASE WHEN v_budget > 0
                         THEN round((v_cost / v_budget) * 100, 1) ELSE NULL END,
      'remaining',  CASE WHEN v_budget > 0
                         THEN round(v_budget - v_cost, 2) ELSE NULL END
    ),
    'against_contract', jsonb_build_object(
      'contract_value',    round(v_contract, 2),
      'no_fixed_contract', v_no_contract,
      'labour_pct',        CASE WHEN v_contract > 0 AND NOT v_no_contract
                                THEN round((v_cost / v_contract) * 100, 1) ELSE NULL END
    ),
    'notes',        v_notes,
    'generated_at', now()
  );
END;
$$;

COMMENT ON FUNCTION public.project_labor_cost(uuid) IS
  'Read-only per-worker and total labour cost for one job, plus cost against budget and contract. security invoker, so RLS scopes it to the caller''s company. Uses crew wage rates — a cost figure, never a client price. Zero-hour entries are counted but excluded from cost. The job page and the AI tool both call this, so their numbers cannot disagree.';

-- The per-project group-by scan. idx_time_entries_project exists for the
-- project filter; this one lets the date aggregates come off the same index.
CREATE INDEX IF NOT EXISTS idx_time_entries_project_worker_date
  ON public.time_entries(project_id, worker_id, date);
