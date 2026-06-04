-- ============================================================
-- Issue #11: takeoff-level material lines per section
-- ============================================================
-- Adds a child table to estimate_sections so dad can enumerate every
-- physical material being purchased for a work section (135 CMU blocks,
-- 25 bags of cement, etc.) — matches the Excel "Materials Calcs" sheet.
--
-- Materials live at the SECTION grain, not the task grain. Dad's mental
-- model: "Entrance Gate needs X, Y, Z" — not "each task within the gate
-- needs its share of X." Tasks (estimate_line_items) still carry their
-- own material_cost on the builder for back-compat; this table is the
-- new home for the takeoff workflow on /estimates/[id]/materials.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.estimate_section_materials (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id      uuid NOT NULL REFERENCES public.estimate_sections(id) ON DELETE CASCADE,
  material_id     text REFERENCES public.materials(id) ON DELETE SET NULL,
  description     text NOT NULL,
  quantity        numeric(12, 3) NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  unit            text,
  unit_cost       numeric(12, 2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  markup_pct      numeric(5, 2) CHECK (markup_pct IS NULL OR markup_pct >= 0),
  is_equipment    boolean NOT NULL DEFAULT false,
  notes           text,
  order_index     integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_section_materials_section
  ON public.estimate_section_materials(section_id);
CREATE INDEX IF NOT EXISTS idx_section_materials_order
  ON public.estimate_section_materials(section_id, order_index);
CREATE INDEX IF NOT EXISTS idx_section_materials_material
  ON public.estimate_section_materials(material_id);

ALTER TABLE public.estimate_section_materials ENABLE ROW LEVEL SECURITY;

-- Visibility scoped via section → estimate → company.
CREATE POLICY "Users can view section materials for their company"
  ON public.estimate_section_materials FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.estimate_sections s
      JOIN public.estimates e ON e.id = s.estimate_id
      JOIN public.profiles p ON p.company_id = e.company_id
      WHERE s.id = estimate_section_materials.section_id AND p.id = auth.uid()
    )
  );

CREATE POLICY "Users can manage section materials for their company"
  ON public.estimate_section_materials FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.estimate_sections s
      JOIN public.estimates e ON e.id = s.estimate_id
      JOIN public.profiles p ON p.company_id = e.company_id
      WHERE s.id = estimate_section_materials.section_id AND p.id = auth.uid()
    )
  );

CREATE TRIGGER set_updated_at_section_materials
  BEFORE UPDATE ON public.estimate_section_materials
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

COMMENT ON TABLE public.estimate_section_materials IS
  'Takeoff-level material/equipment line items per section. Sell formula: qty * unit_cost * (1 + COALESCE(markup_pct, estimates.default_{material|equipment}_markup_pct) / 100).';

COMMENT ON COLUMN public.estimate_section_materials.is_equipment IS
  'true → equipment line (uses default_equipment_markup_pct). false → material line (uses default_material_markup_pct).';

COMMENT ON COLUMN public.estimate_section_materials.material_id IS
  'Optional FK to materials catalog. NULL = free-form entry. Description/unit/unit_cost are always snapshotted on insert; catalog price changes do NOT mutate this row.';
