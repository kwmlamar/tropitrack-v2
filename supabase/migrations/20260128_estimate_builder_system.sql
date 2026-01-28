-- ============================================
-- PROFESSIONAL ESTIMATE BUILDER SYSTEM
-- Buildertrend-style cost codes, catalog, categories, and dual pricing
-- ============================================

-- 1. COST CODES (Trade/Category Organization)
CREATE TABLE IF NOT EXISTS public.cost_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  parent_code_id UUID REFERENCES public.cost_codes(id) ON DELETE SET NULL,
  is_template BOOLEAN DEFAULT false,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cost_codes_company ON public.cost_codes(company_id);
CREATE INDEX IF NOT EXISTS idx_cost_codes_parent ON public.cost_codes(parent_code_id);
CREATE INDEX IF NOT EXISTS idx_cost_codes_code ON public.cost_codes(code);

ALTER TABLE public.cost_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their company cost codes and templates"
  ON public.cost_codes FOR SELECT
  USING (is_template = true OR company_id IN (
    SELECT company_id FROM public.profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Users can manage their company cost codes"
  ON public.cost_codes FOR ALL
  USING (company_id IN (
    SELECT company_id FROM public.profiles WHERE id = auth.uid()
  ));

-- Seed template cost codes
INSERT INTO public.cost_codes (is_template, code, name, display_order) VALUES
(true, '1000', 'General Conditions & Preliminaries', 1),
(true, '2000', 'Site Work & Excavation', 2),
(true, '2100', 'Footings & Foundation', 3),
(true, '2200', 'Waterproofing', 4),
(true, '3000', 'Concrete', 5),
(true, '4000', 'Masonry', 6),
(true, '5000', 'Metals & Structural Steel', 7),
(true, '6000', 'Wood & Plastics', 8),
(true, '6100', 'Rough Carpentry', 9),
(true, '6200', 'Finish Carpentry & Millwork', 10),
(true, '7000', 'Thermal & Moisture Protection', 11),
(true, '7100', 'Insulation', 12),
(true, '7200', 'Roofing', 13),
(true, '8000', 'Doors & Windows', 14),
(true, '9000', 'Finishes', 15),
(true, '9100', 'Drywall', 16),
(true, '9200', 'Tile & Stone', 17),
(true, '9300', 'Flooring', 18),
(true, '9400', 'Painting', 19),
(true, '10000', 'Specialties', 20),
(true, '11000', 'Equipment', 21),
(true, '15000', 'Mechanical / HVAC', 22),
(true, '15100', 'Plumbing', 23),
(true, '16000', 'Electrical', 24),
(true, '16500', 'Landscaping', 25),
(true, '17000', 'Cleanup & Final', 26);


-- 2. COST CATALOG (Reusable Item Library)
CREATE TABLE IF NOT EXISTS public.cost_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  cost_code_id UUID REFERENCES public.cost_codes(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  cost_type VARCHAR(50) DEFAULT 'material' CHECK (cost_type IN ('material', 'labor', 'equipment', 'subcontractor', 'other')),
  unit_cost DECIMAL(10,2) NOT NULL DEFAULT 0,
  unit VARCHAR(50) DEFAULT 'EACH',
  default_markup_percent DECIMAL(5,2) DEFAULT 25,
  is_template BOOLEAN DEFAULT false,
  times_used INTEGER DEFAULT 0,
  last_used_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cost_catalog_company ON public.cost_catalog(company_id);
CREATE INDEX IF NOT EXISTS idx_cost_catalog_cost_code ON public.cost_catalog(cost_code_id);

ALTER TABLE public.cost_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their company catalog and templates"
  ON public.cost_catalog FOR SELECT
  USING (is_template = true OR company_id IN (
    SELECT company_id FROM public.profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Users can manage their company catalog"
  ON public.cost_catalog FOR ALL
  USING (company_id IN (
    SELECT company_id FROM public.profiles WHERE id = auth.uid()
  ));

-- Seed template catalog items (Caribbean construction focused)
INSERT INTO public.cost_catalog (is_template, cost_code_id, title, description, cost_type, unit_cost, unit, default_markup_percent)
SELECT true, cc.id, v.title, v.description, v.cost_type::varchar, v.unit_cost, v.unit, v.markup
FROM (VALUES
  ('2000', 'Site Clearing - Residential', 'Clear and grade residential lot', 'labor', 18.00, 'sqft', 15.0),
  ('2000', 'Excavation - Trench', 'Trench excavation for footings', 'labor', 25.00, 'lnft', 15.0),
  ('2100', 'Concrete - Foundation Pour', 'Ready-mix concrete for foundation', 'material', 185.00, 'CU YD', 20.0),
  ('2100', 'Rebar - #4 Bar', 'Reinforcement bar 1/2 inch', 'material', 2.75, 'lnft', 20.0),
  ('2100', 'Footing Labor', 'Form, pour, and finish footings', 'labor', 9.00, 'sqft', 15.0),
  ('2100', 'Poured Wall - 9ft', '9-foot poured concrete wall', 'material', 145.00, 'lnft', 20.0),
  ('3000', 'Concrete Block - 8 inch', 'Standard 8-inch CMU block', 'material', 3.25, 'EACH', 25.0),
  ('3000', 'Block Laying Labor', 'Labor to lay concrete block', 'labor', 4.50, 'EACH', 15.0),
  ('6100', 'Framing Lumber - 2x4x8', 'SPF stud grade lumber', 'material', 4.50, 'EACH', 25.0),
  ('6100', 'Framing Lumber - 2x6x12', '2x6 joist/rafter lumber', 'material', 8.50, 'EACH', 25.0),
  ('6100', 'Plywood - 3/4 CDX 4x8', 'Structural sheathing plywood', 'material', 52.00, 'sheet', 25.0),
  ('6100', 'Framing Labor', 'Rough framing labor', 'labor', 9.00, 'sqft', 15.0),
  ('6200', 'Interior Trim - Base', 'Base molding installed', 'material', 4.50, 'lnft', 30.0),
  ('6200', 'Interior Trim - Crown', 'Crown molding installed', 'material', 7.00, 'lnft', 30.0),
  ('7200', 'Asphalt Shingle Roof', '30-year architectural shingles', 'material', 4.25, 'sqft', 30.0),
  ('7200', 'Metal Roof - Standing Seam', 'Standing seam metal roof panel', 'material', 8.50, 'sqft', 25.0),
  ('7200', 'Roofing Labor', 'Roof installation labor', 'labor', 3.75, 'sqft', 15.0),
  ('8000', 'Exterior Door - Entry', 'Fiberglass entry door installed', 'material', 650.00, 'EACH', 30.0),
  ('8000', 'Interior Door - Hollow Core', 'Pre-hung hollow core door', 'material', 185.00, 'EACH', 30.0),
  ('8000', 'Window - Single Hung', 'Vinyl single hung window', 'material', 350.00, 'EACH', 25.0),
  ('8000', 'Sliding Glass Door', 'Standard sliding patio door', 'material', 1200.00, 'EACH', 25.0),
  ('9100', 'Drywall - Hang & Finish', 'Hang, tape, and finish drywall', 'labor', 2.00, 'sqft', 20.0),
  ('9100', 'Drywall Material', '1/2 inch drywall sheets & compound', 'material', 0.85, 'sqft', 25.0),
  ('9200', 'Ceramic Floor Tile', 'Standard ceramic tile installed', 'material', 8.00, 'sqft', 30.0),
  ('9200', 'Porcelain Tile', 'Porcelain tile installed', 'material', 12.00, 'sqft', 30.0),
  ('9300', 'Vinyl Plank Flooring', 'Luxury vinyl plank installed', 'material', 6.50, 'sqft', 30.0),
  ('9300', 'Hardwood Flooring', 'Engineered hardwood installed', 'material', 10.00, 'sqft', 25.0),
  ('9400', 'Interior Paint', 'Two coats latex paint', 'labor', 2.50, 'sqft', 20.0),
  ('9400', 'Exterior Paint', 'Two coats exterior paint', 'labor', 3.25, 'sqft', 20.0),
  ('15000', 'HVAC System - 2 Ton', 'Mini-split AC system installed', 'material', 3800.00, 'EACH', 15.0),
  ('15000', 'HVAC System - 3 Ton', 'Central AC system installed', 'material', 5500.00, 'EACH', 15.0),
  ('15100', 'Toilet - Standard', 'Standard residential toilet', 'material', 220.00, 'EACH', 35.0),
  ('15100', 'Bathroom Vanity', 'Vanity with sink and faucet', 'material', 450.00, 'EACH', 30.0),
  ('15100', 'Plumbing Rough-in', 'Rough plumbing per fixture', 'labor', 350.00, 'EACH', 15.0),
  ('16000', 'Electrical Outlet', 'Standard duplex outlet installed', 'labor', 85.00, 'EACH', 20.0),
  ('16000', 'Light Fixture Install', 'Standard light fixture installed', 'labor', 120.00, 'EACH', 20.0),
  ('16000', 'Electrical Panel - 200A', '200 amp main panel installed', 'material', 2200.00, 'EACH', 15.0),
  ('16500', 'Sod Installation', 'Sod installed with soil prep', 'material', 1.50, 'sqft', 25.0),
  ('16500', 'Landscape Planting', 'Trees and shrubs installed', 'material', 250.00, 'EACH', 25.0)
) AS v(code, title, description, cost_type, unit_cost, unit, markup)
JOIN public.cost_codes cc ON cc.code = v.code AND cc.is_template = true;


-- 3. ESTIMATE CATEGORIES (Groups within an estimate, organized by cost code)
CREATE TABLE IF NOT EXISTS public.estimate_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id UUID NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  cost_code_id UUID REFERENCES public.cost_codes(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  display_order INTEGER DEFAULT 0,
  builder_cost DECIMAL(12,2) DEFAULT 0,
  client_price DECIMAL(12,2) DEFAULT 0,
  profit DECIMAL(12,2) DEFAULT 0,
  is_expanded BOOLEAN DEFAULT true,
  show_to_client BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_estimate_categories_estimate ON public.estimate_categories(estimate_id);

ALTER TABLE public.estimate_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view estimate categories for their company estimates"
  ON public.estimate_categories FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.estimates e
      JOIN public.profiles p ON e.company_id = p.company_id
      WHERE e.id = estimate_categories.estimate_id AND p.id = auth.uid()
    )
  );

CREATE POLICY "Users can manage estimate categories for their company estimates"
  ON public.estimate_categories FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.estimates e
      JOIN public.profiles p ON e.company_id = p.company_id
      WHERE e.id = estimate_categories.estimate_id AND p.id = auth.uid()
    )
  );


-- 4. ENHANCE EXISTING TABLES

-- Add new columns to estimates
ALTER TABLE public.estimates
ADD COLUMN IF NOT EXISTS builder_cost DECIMAL(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS client_price DECIMAL(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS estimated_profit DECIMAL(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS markup_strategy VARCHAR(50) DEFAULT 'item' CHECK (markup_strategy IN ('item', 'category', 'global')),
ADD COLUMN IF NOT EXISTS global_markup_percent DECIMAL(5,2) DEFAULT 20,
ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS sent_to_client BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS client_approved BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS client_approved_at TIMESTAMPTZ;

-- Add new columns to estimate_line_items
ALTER TABLE public.estimate_line_items
ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.estimate_categories(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS cost_catalog_id UUID REFERENCES public.cost_catalog(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS cost_code VARCHAR(50),
ADD COLUMN IF NOT EXISTS title VARCHAR(255),
ADD COLUMN IF NOT EXISTS cost_type VARCHAR(50) DEFAULT 'material',
ADD COLUMN IF NOT EXISTS unit_cost DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS builder_cost DECIMAL(12,2),
ADD COLUMN IF NOT EXISTS markup_percent DECIMAL(5,2) DEFAULT 25,
ADD COLUMN IF NOT EXISTS markup_amount DECIMAL(12,2),
ADD COLUMN IF NOT EXISTS client_price DECIMAL(12,2),
ADD COLUMN IF NOT EXISTS profit DECIMAL(12,2),
ADD COLUMN IF NOT EXISTS show_to_client BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS save_to_catalog BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_estimate_line_items_category ON public.estimate_line_items(category_id);

-- Comments
COMMENT ON TABLE public.cost_codes IS 'CSI-style trade categories for organizing estimates';
COMMENT ON TABLE public.cost_catalog IS 'Reusable library of common cost items with default pricing';
COMMENT ON TABLE public.estimate_categories IS 'Cost code groups within a single estimate for hierarchical organization';
