-- Add flexible line item entry modes
-- Allows contractors to enter lump sum amounts without quantity × rate breakdown

-- Add entry_mode column to estimate_line_items
ALTER TABLE public.estimate_line_items
ADD COLUMN entry_mode VARCHAR(20) DEFAULT 'detailed'
  CHECK (entry_mode IN ('detailed', 'simple', 'lump_sum'));

-- Add manual_amount for lump sum entries
ALTER TABLE public.estimate_line_items
ADD COLUMN manual_amount DECIMAL(12, 2);

-- Make quantity, unit_rate nullable for lump sum mode
ALTER TABLE public.estimate_line_items
ALTER COLUMN quantity DROP NOT NULL,
ALTER COLUMN unit_rate DROP NOT NULL;

-- Add entry_mode column to invoice_line_items
ALTER TABLE public.invoice_line_items
ADD COLUMN entry_mode VARCHAR(20) DEFAULT 'detailed'
  CHECK (entry_mode IN ('detailed', 'simple', 'lump_sum'));

-- Add manual_amount for lump sum entries
ALTER TABLE public.invoice_line_items
ADD COLUMN manual_amount DECIMAL(12, 2);

-- Make quantity, unit_rate nullable for lump sum mode
ALTER TABLE public.invoice_line_items
ALTER COLUMN quantity DROP NOT NULL,
ALTER COLUMN unit_rate DROP NOT NULL;

-- Add indexes for performance
CREATE INDEX idx_estimate_items_entry_mode ON public.estimate_line_items(entry_mode);
CREATE INDEX idx_invoice_items_entry_mode ON public.invoice_line_items(entry_mode);

-- Add comment explaining entry modes
COMMENT ON COLUMN public.estimate_line_items.entry_mode IS
  'Entry mode: detailed (worker+qty+rate), simple (qty+rate), lump_sum (total only)';
COMMENT ON COLUMN public.invoice_line_items.entry_mode IS
  'Entry mode: detailed (worker+qty+rate), simple (qty+rate), lump_sum (total only)';
COMMENT ON COLUMN public.estimate_line_items.manual_amount IS
  'Manual amount for lump_sum entry mode';
COMMENT ON COLUMN public.invoice_line_items.manual_amount IS
  'Manual amount for lump_sum entry mode';
