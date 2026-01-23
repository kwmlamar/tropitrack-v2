-- ============================================
-- ALLOW PROJECT MANAGERS TO DELETE WORKERS
-- Migration to update RLS policy for worker deletion
-- Date: January 22, 2026
-- ============================================

-- Drop the existing policy
DROP POLICY IF EXISTS "Admins can delete workers" ON public.workers;

-- Create new policy that allows both admins and project managers
CREATE POLICY "Admins and project managers can delete workers" ON public.workers
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() 
            AND role IN ('admin', 'project_manager')
        )
    );
