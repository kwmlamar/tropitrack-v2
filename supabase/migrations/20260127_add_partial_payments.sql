-- Add partial payment support to payroll
-- This allows tracking partial payments and payment history

-- Add payment tracking columns to payroll_entries
ALTER TABLE public.payroll_entries
ADD COLUMN IF NOT EXISTS total_paid DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'partial', 'paid'));

-- Create payment transactions table for audit trail
CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_entry_id UUID NOT NULL REFERENCES public.payroll_entries(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
  payment_method TEXT DEFAULT 'cash' CHECK (payment_method IN ('cash', 'check', 'bank_transfer', 'other')),
  reference_number TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_payment_transactions_entry ON public.payment_transactions(payroll_entry_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_created ON public.payment_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_payroll_entries_payment_status ON public.payroll_entries(payment_status);

-- Enable RLS
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

-- RLS policy for payment_transactions (inherit from payroll_entries access)
CREATE POLICY "Users can view payment transactions for their company's payroll"
  ON public.payment_transactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.payroll_entries pe
      JOIN public.workers w ON pe.worker_id = w.id
      JOIN public.profiles p ON w.company_id = p.company_id
      WHERE pe.id = payment_transactions.payroll_entry_id
      AND p.id = auth.uid()
    )
  );

CREATE POLICY "Users can insert payment transactions for their company's payroll"
  ON public.payment_transactions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.payroll_entries pe
      JOIN public.workers w ON pe.worker_id = w.id
      JOIN public.profiles p ON w.company_id = p.company_id
      WHERE pe.id = payroll_entry_id
      AND p.id = auth.uid()
    )
  );

-- Function to update payroll_entry payment status after transaction
CREATE OR REPLACE FUNCTION update_payroll_payment_status()
RETURNS TRIGGER AS $$
DECLARE
  entry_total_paid DECIMAL(10,2);
  entry_net_pay DECIMAL(10,2);
BEGIN
  -- Calculate total paid for this entry
  SELECT COALESCE(SUM(amount), 0) INTO entry_total_paid
  FROM public.payment_transactions
  WHERE payroll_entry_id = NEW.payroll_entry_id;

  -- Get net pay for comparison
  SELECT net_pay INTO entry_net_pay
  FROM public.payroll_entries
  WHERE id = NEW.payroll_entry_id;

  -- Update the payroll entry
  UPDATE public.payroll_entries
  SET
    total_paid = entry_total_paid,
    is_paid = (entry_total_paid >= entry_net_pay),
    paid_at = CASE WHEN entry_total_paid >= entry_net_pay THEN now() ELSE paid_at END,
    payment_status = CASE
      WHEN entry_total_paid >= entry_net_pay THEN 'paid'
      WHEN entry_total_paid > 0 THEN 'partial'
      ELSE 'unpaid'
    END
  WHERE id = NEW.payroll_entry_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_update_payment_status ON public.payment_transactions;
CREATE TRIGGER trigger_update_payment_status
  AFTER INSERT ON public.payment_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_payroll_payment_status();

-- Comments
COMMENT ON TABLE public.payment_transactions IS 'Tracks individual payments made against payroll entries';
COMMENT ON COLUMN public.payroll_entries.total_paid IS 'Running total of all payments made';
COMMENT ON COLUMN public.payroll_entries.payment_status IS 'Current payment status: unpaid, partial, or paid';
