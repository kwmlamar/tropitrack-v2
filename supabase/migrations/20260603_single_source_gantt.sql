-- ============================================================
-- Single-source estimate ↔ Gantt model
-- Phases live on estimate_sections (extended with scheduling fields).
-- One estimate per project, auto-created on project insert.
-- Deprecates: gantt_phases (data migrated to estimate_sections).
-- ============================================================

-- ─── 1. Extend estimate_sections with scheduling fields ──────────────────────
ALTER TABLE public.estimate_sections
  ADD COLUMN IF NOT EXISTS planned_start date,
  ADD COLUMN IF NOT EXISTS planned_end   date,
  ADD COLUMN IF NOT EXISTS actual_start  date,
  ADD COLUMN IF NOT EXISTS actual_end    date,
  ADD COLUMN IF NOT EXISTS progress      integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS crew_size     integer,
  ADD COLUMN IF NOT EXISTS notes         text,
  ADD COLUMN IF NOT EXISTS updated_by    uuid,
  ADD COLUMN IF NOT EXISTS updated_at    timestamptz NOT NULL DEFAULT now();

-- ─── 2. One estimate per project ─────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_estimates_unique_project
  ON public.estimates (project_id)
  WHERE project_id IS NOT NULL;

-- ─── 3. Trigger: auto-create blank estimate on project insert ────────────────
CREATE OR REPLACE FUNCTION public.ensure_project_estimate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.estimates (project_id, company_id, name, status, created_by)
  VALUES (
    NEW.id,
    NEW.company_id,
    COALESCE(NEW.name, 'Untitled') || ' — Estimate',
    'draft',
    NEW.created_by
  )
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_ensure_project_estimate ON public.projects;
CREATE TRIGGER trg_ensure_project_estimate
  AFTER INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.ensure_project_estimate();

-- ─── 4. Backfill: one estimate per existing project ──────────────────────────
INSERT INTO public.estimates (project_id, company_id, name, status, created_by)
SELECT p.id, p.company_id,
       COALESCE(p.name, 'Untitled') || ' — Estimate',
       'draft',
       p.created_by
FROM public.projects p
WHERE p.id NOT IN (SELECT project_id FROM public.estimates WHERE project_id IS NOT NULL);

-- ─── 5. Backfill: gantt_phases → estimate_sections ───────────────────────────
INSERT INTO public.estimate_sections
  (estimate_id, name, order_index,
   planned_start, planned_end, actual_start, actual_end,
   progress, crew_size, notes, updated_by, created_at, updated_at)
SELECT e.id, ph.name, ph.order_index,
       ph.planned_start, ph.planned_end, ph.actual_start, ph.actual_end,
       ph.progress, ph.crew_size, ph.notes, ph.updated_by, ph.created_at, ph.updated_at
FROM public.gantt_phases ph
JOIN public.estimates e ON e.project_id = ph.project_id;

-- ─── 6. Repoint gantt_tasks → section_tasks ──────────────────────────────────
ALTER TABLE public.gantt_tasks DROP CONSTRAINT IF EXISTS gantt_tasks_phase_id_fkey;
ALTER TABLE public.gantt_tasks RENAME COLUMN phase_id TO section_id;
ALTER TABLE public.gantt_tasks
  ADD CONSTRAINT gantt_tasks_section_id_fkey
  FOREIGN KEY (section_id) REFERENCES public.estimate_sections(id) ON DELETE CASCADE;
ALTER TABLE public.gantt_tasks RENAME TO section_tasks;

-- ─── 7. Drop gantt_phases ────────────────────────────────────────────────────
DROP TABLE public.gantt_phases;

-- ─── 8. Indexes + grants ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_estimate_sections_progress      ON public.estimate_sections(progress);
CREATE INDEX IF NOT EXISTS idx_estimate_sections_planned_start ON public.estimate_sections(planned_start);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.section_tasks       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.estimate_sections   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.estimates           TO authenticated;

NOTIFY pgrst, 'reload schema';
