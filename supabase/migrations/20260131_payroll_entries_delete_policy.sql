-- ============================================
-- FIX: Add DELETE policy for payroll_entries
-- Required for the "Reopen" functionality to work
-- ============================================

-- Drop if exists, then recreate
DROP POLICY IF EXISTS "Admins can delete payroll entries" ON public.payroll_entries;

-- Allow admins and project managers to delete payroll entries
-- This is needed when reopening a pay period for corrections
CREATE POLICY "Admins can delete payroll entries" ON public.payroll_entries
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'project_manager')
        )
    );
