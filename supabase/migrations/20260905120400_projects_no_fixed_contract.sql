-- A required contract_value cannot just mean "must be > 0" — ODS runs a
-- property-management line billed as a flat monthly fee with no contract
-- value at all (Sotheby's Caretaking Properties, the Laundromat, Capricorn,
-- and the Tropical Impulse ceilings job are all active at $0 today). Forcing
-- a positive number there just trades a legitimate blank for a fake number,
-- which is worse. This column lets $0 be a deliberate choice instead of an
-- unconsidered one: the app now requires either contract_value > 0 or this
-- flag set, not just contract_value > 0.
--
-- Defaults false for all existing rows — this is a new, additive column,
-- not a backfill of any existing project's data. Whether any of the current
-- zero-contract_value projects should be flagged true is for the owner to
-- decide when they next touch that record, not something this migration
-- guesses at.
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS no_fixed_contract BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.projects.no_fixed_contract IS
  'True for jobs billed on a flat monthly fee / T&M basis with no fixed contract_value — e.g. property-management retainers. Lets contract_value legitimately be 0 without that being mistaken for a blank left by accident.';
