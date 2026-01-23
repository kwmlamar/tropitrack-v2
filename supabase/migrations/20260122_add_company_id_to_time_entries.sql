-- Migration to add company_id to time_entries table
-- This ensures proper multi-tenant data isolation

-- Add company_id column
ALTER TABLE public.time_entries 
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

-- Populate company_id from workers (since workers already have company_id)
UPDATE public.time_entries te
SET company_id = w.company_id
FROM public.workers w
WHERE te.worker_id = w.id 
  AND te.company_id IS NULL;

-- Set NOT NULL constraint after populating
ALTER TABLE public.time_entries 
ALTER COLUMN company_id SET NOT NULL;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_time_entries_company_id ON public.time_entries(company_id);

-- Update RLS policies to filter by company_id
DROP POLICY IF EXISTS "Users can view time entries" ON public.time_entries;
CREATE POLICY "Users can view time entries" ON public.time_entries
    FOR SELECT USING (
        auth.role() = 'authenticated' 
        AND company_id IN (
            SELECT company_id FROM public.profiles WHERE id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can create time entries" ON public.time_entries;
CREATE POLICY "Users can create time entries" ON public.time_entries
    FOR INSERT WITH CHECK (
        auth.role() = 'authenticated' 
        AND company_id IN (
            SELECT company_id FROM public.profiles WHERE id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can update time entries" ON public.time_entries;
CREATE POLICY "Users can update time entries" ON public.time_entries
    FOR UPDATE USING (
        auth.role() = 'authenticated' 
        AND company_id IN (
            SELECT company_id FROM public.profiles WHERE id = auth.uid()
        )
    );

-- Keep the delete policy as is (admins only)
-- The existing policy already checks for admin role
