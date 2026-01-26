-- ============================================
-- Document Templates System
-- Flexible estimate & invoice presentation
-- ============================================

-- Document Templates table
CREATE TABLE IF NOT EXISTS public.document_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('estimate', 'invoice')),
  is_default BOOLEAN DEFAULT false,

  -- Display settings
  show_quantities BOOLEAN DEFAULT true,
  show_rates BOOLEAN DEFAULT true,
  show_hours BOOLEAN DEFAULT true,
  show_unit_costs BOOLEAN DEFAULT true,
  show_subtotals BOOLEAN DEFAULT true,
  show_markup_percentage BOOLEAN DEFAULT false,
  show_profit_margin BOOLEAN DEFAULT false,
  show_line_item_descriptions BOOLEAN DEFAULT true,

  -- Grouping options
  group_by VARCHAR(50) DEFAULT 'category' CHECK (group_by IN ('category', 'phase', 'none', 'custom')),
  show_group_subtotals BOOLEAN DEFAULT true,

  -- Formatting
  line_item_format VARCHAR(50) DEFAULT 'detailed' CHECK (line_item_format IN ('detailed', 'summary', 'minimal')),
  total_format VARCHAR(50) DEFAULT 'standard' CHECK (total_format IN ('standard', 'minimal', 'detailed')),

  -- Custom settings (JSON for flexibility)
  custom_settings JSONB DEFAULT '{}'::jsonb,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Line Item Groups table
CREATE TABLE IF NOT EXISTS public.line_item_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  estimate_id UUID REFERENCES public.estimates(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  display_order INTEGER DEFAULT 0,
  show_subtotal BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure group belongs to either estimate or invoice, not both
  CHECK (
    (estimate_id IS NOT NULL AND invoice_id IS NULL) OR
    (estimate_id IS NULL AND invoice_id IS NOT NULL)
  )
);

-- Add template_id and custom_display_settings to estimates
ALTER TABLE public.estimates
ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES public.document_templates(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS custom_display_settings JSONB DEFAULT '{}'::jsonb;

-- Add template_id and custom_display_settings to invoices
ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES public.document_templates(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS custom_display_settings JSONB DEFAULT '{}'::jsonb;

-- Add grouping and display fields to estimate_line_items
ALTER TABLE public.estimate_line_items
ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES public.line_item_groups(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS display_format VARCHAR(50) DEFAULT 'standard' CHECK (display_format IN ('standard', 'lump_sum', 'hidden_rate')),
ADD COLUMN IF NOT EXISTS show_in_document BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS custom_label VARCHAR(255),
ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;

-- Add grouping and display fields to invoice_line_items
ALTER TABLE public.invoice_line_items
ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES public.line_item_groups(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS display_format VARCHAR(50) DEFAULT 'standard' CHECK (display_format IN ('standard', 'lump_sum', 'hidden_rate')),
ADD COLUMN IF NOT EXISTS show_in_document BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS custom_label VARCHAR(255),
ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_document_templates_company_id ON public.document_templates(company_id);
CREATE INDEX IF NOT EXISTS idx_document_templates_type ON public.document_templates(type);
CREATE INDEX IF NOT EXISTS idx_document_templates_default ON public.document_templates(company_id, is_default, type);
CREATE INDEX IF NOT EXISTS idx_line_item_groups_estimate_id ON public.line_item_groups(estimate_id);
CREATE INDEX IF NOT EXISTS idx_line_item_groups_invoice_id ON public.line_item_groups(invoice_id);
CREATE INDEX IF NOT EXISTS idx_estimate_line_items_group_id ON public.estimate_line_items(group_id);
CREATE INDEX IF NOT EXISTS idx_invoice_line_items_group_id ON public.invoice_line_items(group_id);

-- RLS Policies for document_templates
ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their company's templates"
  ON public.document_templates FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Admins and project managers can create templates"
  ON public.document_templates FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'project_manager')
    )
  );

CREATE POLICY "Admins and project managers can update templates"
  ON public.document_templates FOR UPDATE
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'project_manager')
    )
  );

CREATE POLICY "Admins can delete templates"
  ON public.document_templates FOR DELETE
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- RLS Policies for line_item_groups
ALTER TABLE public.line_item_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view groups for their company's documents"
  ON public.line_item_groups FOR SELECT
  USING (
    (estimate_id IN (
      SELECT id FROM public.estimates WHERE company_id IN (
        SELECT company_id FROM public.profiles WHERE id = auth.uid()
      )
    )) OR
    (invoice_id IN (
      SELECT id FROM public.invoices WHERE company_id IN (
        SELECT company_id FROM public.profiles WHERE id = auth.uid()
      )
    ))
  );

CREATE POLICY "Users can create groups for their company's documents"
  ON public.line_item_groups FOR INSERT
  WITH CHECK (
    (estimate_id IN (
      SELECT id FROM public.estimates WHERE company_id IN (
        SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'project_manager')
      )
    )) OR
    (invoice_id IN (
      SELECT id FROM public.invoices WHERE company_id IN (
        SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'project_manager')
      )
    ))
  );

CREATE POLICY "Users can update groups for their company's documents"
  ON public.line_item_groups FOR UPDATE
  USING (
    (estimate_id IN (
      SELECT id FROM public.estimates WHERE company_id IN (
        SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'project_manager')
      )
    )) OR
    (invoice_id IN (
      SELECT id FROM public.invoices WHERE company_id IN (
        SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'project_manager')
      )
    ))
  );

CREATE POLICY "Users can delete groups for their company's documents"
  ON public.line_item_groups FOR DELETE
  USING (
    (estimate_id IN (
      SELECT id FROM public.estimates WHERE company_id IN (
        SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'project_manager')
      )
    )) OR
    (invoice_id IN (
      SELECT id FROM public.invoices WHERE company_id IN (
        SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'project_manager')
      )
    ))
  );

-- Function to ensure only one default template per type per company
CREATE OR REPLACE FUNCTION public.ensure_single_default_template()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default = true THEN
    -- Unset is_default for all other templates of same type in same company
    UPDATE public.document_templates
    SET is_default = false
    WHERE company_id = NEW.company_id
      AND type = NEW.type
      AND id != NEW.id
      AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_ensure_single_default_template
  AFTER INSERT OR UPDATE ON public.document_templates
  FOR EACH ROW
  WHEN (NEW.is_default = true)
  EXECUTE FUNCTION public.ensure_single_default_template();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_document_template_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_document_template_timestamp
  BEFORE UPDATE ON public.document_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_document_template_timestamp();

-- Function to seed default templates for a company
CREATE OR REPLACE FUNCTION public.seed_default_templates(p_company_id UUID)
RETURNS VOID AS $$
BEGIN
  -- Only seed if no templates exist for this company
  IF NOT EXISTS (SELECT 1 FROM public.document_templates WHERE company_id = p_company_id) THEN

    -- 1. Detailed Breakdown (Default for Estimates)
    INSERT INTO public.document_templates (
      company_id, name, type, is_default,
      show_quantities, show_rates, show_hours, show_unit_costs, show_subtotals,
      show_markup_percentage, show_profit_margin, show_line_item_descriptions,
      group_by, show_group_subtotals, line_item_format, total_format
    ) VALUES (
      p_company_id, 'Detailed Breakdown', 'estimate', true,
      true, true, true, true, true,
      true, true, true,
      'category', true, 'detailed', 'detailed'
    );

    -- 2. Summary View
    INSERT INTO public.document_templates (
      company_id, name, type, is_default,
      show_quantities, show_rates, show_hours, show_unit_costs, show_subtotals,
      show_markup_percentage, show_profit_margin, show_line_item_descriptions,
      group_by, show_group_subtotals, line_item_format, total_format
    ) VALUES (
      p_company_id, 'Summary View', 'estimate', false,
      false, false, false, false, true,
      false, false, false,
      'category', true, 'summary', 'standard'
    );

    -- 3. Lump Sum
    INSERT INTO public.document_templates (
      company_id, name, type, is_default,
      show_quantities, show_rates, show_hours, show_unit_costs, show_subtotals,
      show_markup_percentage, show_profit_margin, show_line_item_descriptions,
      group_by, show_group_subtotals, line_item_format, total_format
    ) VALUES (
      p_company_id, 'Lump Sum', 'estimate', false,
      false, false, false, false, false,
      false, false, true,
      'none', false, 'minimal', 'minimal'
    );

    -- 4. Phase-Based
    INSERT INTO public.document_templates (
      company_id, name, type, is_default,
      show_quantities, show_rates, show_hours, show_unit_costs, show_subtotals,
      show_markup_percentage, show_profit_margin, show_line_item_descriptions,
      group_by, show_group_subtotals, line_item_format, total_format
    ) VALUES (
      p_company_id, 'Phase-Based', 'estimate', false,
      false, false, false, false, true,
      false, false, true,
      'phase', true, 'summary', 'standard'
    );

    -- 5. Competitive Bid
    INSERT INTO public.document_templates (
      company_id, name, type, is_default,
      show_quantities, show_rates, show_hours, show_unit_costs, show_subtotals,
      show_markup_percentage, show_profit_margin, show_line_item_descriptions,
      group_by, show_group_subtotals, line_item_format, total_format
    ) VALUES (
      p_company_id, 'Competitive Bid', 'estimate', false,
      false, false, false, false, true,
      false, false, true,
      'category', false, 'summary', 'standard'
    );

    -- Invoice templates (similar to estimate templates)

    -- 1. Detailed Invoice (Default for Invoices)
    INSERT INTO public.document_templates (
      company_id, name, type, is_default,
      show_quantities, show_rates, show_hours, show_unit_costs, show_subtotals,
      show_markup_percentage, show_profit_margin, show_line_item_descriptions,
      group_by, show_group_subtotals, line_item_format, total_format
    ) VALUES (
      p_company_id, 'Detailed Invoice', 'invoice', true,
      true, true, true, true, true,
      false, false, true,
      'category', true, 'detailed', 'detailed'
    );

    -- 2. Summary Invoice
    INSERT INTO public.document_templates (
      company_id, name, type, is_default,
      show_quantities, show_rates, show_hours, show_unit_costs, show_subtotals,
      show_markup_percentage, show_profit_margin, show_line_item_descriptions,
      group_by, show_group_subtotals, line_item_format, total_format
    ) VALUES (
      p_company_id, 'Summary Invoice', 'invoice', false,
      false, false, false, false, true,
      false, false, false,
      'category', true, 'summary', 'standard'
    );

    -- 3. Simple Invoice
    INSERT INTO public.document_templates (
      company_id, name, type, is_default,
      show_quantities, show_rates, show_hours, show_unit_costs, show_subtotals,
      show_markup_percentage, show_profit_margin, show_line_item_descriptions,
      group_by, show_group_subtotals, line_item_format, total_format
    ) VALUES (
      p_company_id, 'Simple Invoice', 'invoice', false,
      false, false, false, false, false,
      false, false, true,
      'none', false, 'minimal', 'minimal'
    );

  END IF;
END;
$$ LANGUAGE plpgsql;

-- Trigger to seed templates when a new company is created
CREATE OR REPLACE FUNCTION public.seed_templates_for_new_company()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM public.seed_default_templates(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_seed_templates_for_new_company
  AFTER INSERT ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_templates_for_new_company();

-- Seed templates for existing companies
DO $$
DECLARE
  company_record RECORD;
BEGIN
  FOR company_record IN SELECT id FROM public.companies LOOP
    PERFORM public.seed_default_templates(company_record.id);
  END LOOP;
END;
$$;
