-- ============================================================
-- Estimates register
--
-- ODS does not build estimates inside TropiTrack — Wallace and Omar author
-- them in Claude with a dedicated estimating skill. TropiTrack's job is to
-- be the REGISTER of what was quoted, to whom, when, how much, and whether
-- it was won — not to build the quote. This migration:
--
--   1. Adds `client_id` — the register's Client column needs a real FK, not
--      just the `client_name` text snapshot the old auto-create trigger left
--      behind. (clients/[id]/page.tsx already queries estimates by
--      client_id — that query has been silently returning nothing because
--      the column never existed.)
--   2. Adds `document_url` — a link/Dropbox path to the actual estimate
--      document, since the source of truth for an estimate's content now
--      lives outside TropiTrack.
--   3. Adds sent_at/approved_at/rejected_at/converted_at — the detail and
--      list pages already write these on every status change; the columns
--      just didn't exist, so every "Mark sent" / "Approve" / "Reject" click
--      has been failing silently.
--   4. Extends the status CHECK to include 'converted' (also already written
--      by existing code, also always failing) and adds a guard requiring
--      project_id whenever status = 'converted' — an estimate can't be
--      marked converted without saying which job it became.
--   5. Retires the "one blank estimate per project, auto-created on project
--      insert" trigger from the single-source Gantt experiment. That
--      trigger is exactly what produced the 21 empty $0 test estimates this
--      register work is cleaning up after, it would keep producing more of
--      them for every future project, and the Gantt page it served isn't
--      linked from navigation anywhere in the app. Existing estimate_sections
--      / estimate_line_items / estimate_section_materials data is untouched —
--      only the trigger that manufactured new blank header rows is removed.
--   6. Drops the one-estimate-per-project unique index that trigger relied
--      on — a register legitimately needs to allow more than one estimate
--      against the same project over time (revisions, repeat work).
-- ============================================================

-- ─── 1. client_id ─────────────────────────────────────────────────────────
ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_estimates_client_id ON public.estimates(client_id);

-- ─── 2. document_url ──────────────────────────────────────────────────────
ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS document_url TEXT;

COMMENT ON COLUMN public.estimates.document_url IS
  'Link to the source estimate document (e.g. a Dropbox path or share link) — the estimate itself is authored outside TropiTrack.';

-- ─── 3. Status lifecycle timestamps ───────────────────────────────────────
ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ;

-- ─── 4. Status CHECK: add 'converted', require a project when converted ───
ALTER TABLE public.estimates DROP CONSTRAINT IF EXISTS estimates_status_check;
ALTER TABLE public.estimates
  ADD CONSTRAINT estimates_status_check
  CHECK (status = ANY (ARRAY['draft'::text, 'sent'::text, 'approved'::text, 'rejected'::text, 'converted'::text]));

ALTER TABLE public.estimates DROP CONSTRAINT IF EXISTS estimates_converted_requires_project;
ALTER TABLE public.estimates
  ADD CONSTRAINT estimates_converted_requires_project
  CHECK (status <> 'converted' OR project_id IS NOT NULL);

-- ─── 5. Retire the auto-create-on-project-insert trigger ──────────────────
DROP TRIGGER IF EXISTS trg_ensure_project_estimate ON public.projects;
DROP FUNCTION IF EXISTS public.ensure_project_estimate();

-- ─── 6. Allow more than one estimate per project ──────────────────────────
DROP INDEX IF EXISTS public.idx_estimates_unique_project;

NOTIFY pgrst, 'reload schema';
