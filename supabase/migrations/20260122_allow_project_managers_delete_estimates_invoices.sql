-- ============================================
-- ALLOW PROJECT MANAGERS TO DELETE ESTIMATES AND INVOICES
-- Migration to update RLS policies for estimate and invoice deletion
-- Date: January 22, 2026
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can delete estimates" ON public.estimates;
DROP POLICY IF EXISTS "Admins can delete invoices" ON public.invoices;

-- Create new policy for estimates that allows both admins and project managers
CREATE POLICY "Admins and project managers can delete estimates" ON public.estimates
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() 
            AND role IN ('admin', 'project_manager')
        )
    );

-- Create new policy for invoices that allows both admins and project managers
CREATE POLICY "Admins and project managers can delete invoices" ON public.invoices
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() 
            AND role IN ('admin', 'project_manager')
        )
    );
