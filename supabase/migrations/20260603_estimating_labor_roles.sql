-- ============================================================
-- Estimating: per-estimate labor rate cards + task scheduling
-- Labor rates are SELL prices set per estimate (never synced
-- from the workers table). Each estimate carries its own roles.
-- Tasks (line items) get their own dates so they can show as
-- sub-bars under their parent phase on the Gantt.
-- ============================================================

-- ─── 1. Labor roles on estimates ─────────────────────────────────────────────
ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS labor_roles jsonb NOT NULL DEFAULT '[
    {"id":"foreman","name":"Foreman","daily_rate":300},
    {"id":"skilled","name":"Skilled Trade","daily_rate":225},
    {"id":"general","name":"General Laborer","daily_rate":150}
  ]'::jsonb;

-- ─── 2. Task-level scheduling + role link + client visibility ────────────────
ALTER TABLE public.estimate_line_items
  ADD COLUMN IF NOT EXISTS planned_start  date,
  ADD COLUMN IF NOT EXISTS planned_end    date,
  ADD COLUMN IF NOT EXISTS role_id        text,
  ADD COLUMN IF NOT EXISTS show_to_client boolean NOT NULL DEFAULT true;

-- Phase visibility too (for hiding whole sections from client view)
ALTER TABLE public.estimate_sections
  ADD COLUMN IF NOT EXISTS show_to_client boolean NOT NULL DEFAULT true;

-- ─── 3. Indexes ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_estimate_line_items_section_order
  ON public.estimate_line_items(section_id, order_index);
CREATE INDEX IF NOT EXISTS idx_estimate_line_items_role
  ON public.estimate_line_items(role_id);

NOTIFY pgrst, 'reload schema';
