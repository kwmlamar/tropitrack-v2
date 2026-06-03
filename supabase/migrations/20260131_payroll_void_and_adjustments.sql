-- ============================================
-- PAYROLL IMPROVEMENTS: Void Fields, Adjustments Table, and Restricted Deletion
-- ============================================

-- 1. Add void fields to pay_periods table
ALTER TABLE public.pay_periods
ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS voided_by UUID REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS void_reason TEXT;

-- 2. Add reopened tracking fields
ALTER TABLE public.pay_periods
ADD COLUMN IF NOT EXISTS reopened_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS reopened_by UUID REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS reopen_reason TEXT;

-- 3. Create payroll_adjustments table for post-payment corrections
CREATE TABLE IF NOT EXISTS public.payroll_adjustments (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    original_entry_id UUID REFERENCES public.payroll_entries(id) ON DELETE SET NULL,
    pay_period_id UUID REFERENCES public.pay_periods(id) ON DELETE CASCADE NOT NULL,
    worker_id UUID REFERENCES public.workers(id) ON DELETE CASCADE NOT NULL,
    adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('correction', 'bonus', 'deduction', 'reversal', 'hours_correction')),
    hours_adjustment DECIMAL(6,2) DEFAULT 0,
    amount_adjustment DECIMAL(10,2) DEFAULT 0,
    reason TEXT NOT NULL,
    applied_in_period_id UUID REFERENCES public.pay_periods(id) ON DELETE SET NULL,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on payroll_adjustments
ALTER TABLE public.payroll_adjustments ENABLE ROW LEVEL SECURITY;

-- Policies for payroll_adjustments
CREATE POLICY "Users can view payroll adjustments" ON public.payroll_adjustments
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can create payroll adjustments" ON public.payroll_adjustments
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'project_manager'))
    );

CREATE POLICY "Admins can update payroll adjustments" ON public.payroll_adjustments
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'project_manager'))
    );

-- No delete policy for adjustments - they should be immutable for audit trail

-- 4. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_payroll_adjustments_pay_period ON public.payroll_adjustments(pay_period_id);
CREATE INDEX IF NOT EXISTS idx_payroll_adjustments_worker ON public.payroll_adjustments(worker_id);
CREATE INDEX IF NOT EXISTS idx_payroll_adjustments_original_entry ON public.payroll_adjustments(original_entry_id);
CREATE INDEX IF NOT EXISTS idx_payroll_adjustments_created_at ON public.payroll_adjustments(created_at);

-- 5. Drop the old unrestricted delete policy for pay_periods
DROP POLICY IF EXISTS "Admins can manage pay periods" ON public.pay_periods;

-- 6. Create new restricted delete policy - only allow deletion of 'open' status periods
CREATE POLICY "Admins can delete only open pay periods" ON public.pay_periods
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
        AND status = 'open'
    );

-- 7. Create policy for admins to update any pay period (for status changes, voiding, etc)
CREATE POLICY "Admins can update pay periods" ON public.pay_periods
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'project_manager'))
    );

-- 8. Create policy for admins to insert pay periods
CREATE POLICY "Admins can insert pay periods" ON public.pay_periods
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'project_manager'))
    );

-- 9. Add comment explaining the void workflow
COMMENT ON COLUMN public.pay_periods.voided_at IS 'Timestamp when the pay period was voided. A voided period is kept for audit but not editable.';
COMMENT ON COLUMN public.pay_periods.void_reason IS 'Reason for voiding the pay period (required when voiding).';
COMMENT ON COLUMN public.pay_periods.reopened_at IS 'Timestamp when a processing period was reopened for corrections.';
COMMENT ON COLUMN public.pay_periods.reopen_reason IS 'Reason for reopening the pay period.';

COMMENT ON TABLE public.payroll_adjustments IS 'Stores corrections and adjustments to payroll entries. Used for post-payment fixes without deleting original records.';
