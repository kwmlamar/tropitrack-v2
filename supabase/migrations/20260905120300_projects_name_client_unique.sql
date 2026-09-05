-- Backs the idempotency guarantee of POST /api/projects: a job identified by
-- the same (company, client, name) can only ever mint one projects row, even
-- under a concurrent double-call, because the database — not just the
-- application check — refuses the second insert.
--
-- Verified no existing rows would violate this (checked live data: zero
-- company/client/name collisions among linked-client projects), so this is
-- a plain additive index, no data changes.
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_company_client_name_unique
  ON public.projects (company_id, client_id, lower(btrim(name)))
  WHERE client_id IS NOT NULL;
