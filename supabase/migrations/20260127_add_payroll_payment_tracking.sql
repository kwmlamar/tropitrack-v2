-- Add payment tracking columns to payroll_entries
-- This allows marking individual workers as paid within a pay period

ALTER TABLE public.payroll_entries
ADD COLUMN IF NOT EXISTS is_paid BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- Create index for filtering paid/unpaid entries
CREATE INDEX IF NOT EXISTS idx_payroll_entries_is_paid ON public.payroll_entries(is_paid);

-- Comment explaining the columns
COMMENT ON COLUMN public.payroll_entries.is_paid IS 'Whether this worker has been paid for this pay period';
COMMENT ON COLUMN public.payroll_entries.paid_at IS 'Timestamp when the payment was marked as complete';
