-- ============================================================
-- Issue #13: client-facing label override (two-layer estimate model)
-- ============================================================
-- Dad's mental model has two layers:
--   - Internal: trade cost groups (Flatwork, Framing, Plumbing) — how ODS
--     plans, sources, schedules.
--   - Client: deliverables ("the pump system," "the concrete pad") — how
--     the client and dad talked about the job.
--
-- This migration adds the second layer: a nullable `client_name` column on
-- each estimate child table. The client preview resolves the label via
-- COALESCE(client_name, name | description); editor + internal summary
-- continue showing the internal name.
-- ============================================================

alter table public.estimate_sections          add column if not exists client_name text;
alter table public.estimate_line_items        add column if not exists client_name text;
alter table public.estimate_section_materials add column if not exists client_name text;

comment on column public.estimate_sections.client_name is
  'Optional client-facing label override. NULL = render `name` in client preview.';
comment on column public.estimate_line_items.client_name is
  'Optional client-facing label override. NULL = render `description` in client preview.';
comment on column public.estimate_section_materials.client_name is
  'Optional client-facing label override. NULL = render `description` in client preview.';

notify pgrst, 'reload schema';
