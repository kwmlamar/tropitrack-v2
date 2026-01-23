-- ============================================
-- ALLOW PROJECT MANAGERS TO DELETE PROJECTS AND VENDORS
-- Migration to update RLS policies for project and vendor deletion
-- Date: January 22, 2026
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can delete projects" ON public.projects;
DROP POLICY IF EXISTS "Admins can delete vendors" ON public.vendors;

-- Create new policy for projects that allows both admins and project managers
CREATE POLICY "Admins and project managers can delete projects" ON public.projects
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() 
            AND role IN ('admin', 'project_manager')
        )
    );

-- Create new policy for vendors that allows both admins and project managers
CREATE POLICY "Admins and project managers can delete vendors" ON public.vendors
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() 
            AND role IN ('admin', 'project_manager')
        )
    );
