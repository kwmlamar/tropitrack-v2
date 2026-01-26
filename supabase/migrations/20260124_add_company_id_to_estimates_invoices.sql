-- Migration to add company_id to estimates and invoices tables
-- This ensures proper multi-tenant data isolation

-- Add company_id column to estimates if it doesn't exist
ALTER TABLE public.estimates 
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

-- Add company_id column to invoices if it doesn't exist
ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

-- Populate company_id from profiles (using created_by)
UPDATE public.estimates e
SET company_id = p.company_id
FROM public.profiles p
WHERE e.created_by = p.id 
  AND e.company_id IS NULL
  AND p.company_id IS NOT NULL;

UPDATE public.invoices i
SET company_id = p.company_id
FROM public.profiles p
WHERE i.created_by = p.id 
  AND i.company_id IS NULL
  AND p.company_id IS NOT NULL;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_estimates_company_id ON public.estimates(company_id);
CREATE INDEX IF NOT EXISTS idx_invoices_company_id ON public.invoices(company_id);

-- Update RLS policies to filter by company_id (if they don't already)
-- Note: We keep the existing policies but add company_id filtering for better security

-- For estimates - update SELECT policy to include company_id check
DROP POLICY IF EXISTS "Users can view estimates" ON public.estimates;
CREATE POLICY "Users can view estimates" ON public.estimates
    FOR SELECT USING (
        auth.role() = 'authenticated' 
        AND (
            company_id IS NULL  -- Allow viewing old records without company_id (backward compatibility)
            OR company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
        )
    );

-- For invoices - update SELECT policy to include company_id check
DROP POLICY IF EXISTS "Users can view invoices" ON public.invoices;
CREATE POLICY "Users can view invoices" ON public.invoices
    FOR SELECT USING (
        auth.role() = 'authenticated' 
        AND (
            company_id IS NULL  -- Allow viewing old records without company_id (backward compatibility)
            OR company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
        )
    );

-- Update INSERT policies to require company_id
-- First, drop any existing INSERT policies to avoid conflicts
DROP POLICY IF EXISTS "Users can create estimates" ON public.estimates;
DROP POLICY IF EXISTS "Users can create invoices" ON public.invoices;

-- Create new INSERT policies that check company_id matches user's company
CREATE POLICY "Users can create estimates" ON public.estimates
    FOR INSERT WITH CHECK (
        auth.role() = 'authenticated' 
        AND company_id IS NOT NULL
        AND company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
        AND (SELECT company_id FROM public.profiles WHERE id = auth.uid()) IS NOT NULL
    );

CREATE POLICY "Users can create invoices" ON public.invoices
    FOR INSERT WITH CHECK (
        auth.role() = 'authenticated' 
        AND company_id IS NOT NULL
        AND company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
        AND (SELECT company_id FROM public.profiles WHERE id = auth.uid()) IS NOT NULL
    );

-- Update UPDATE policies to include company_id check
DROP POLICY IF EXISTS "Users can update estimates" ON public.estimates;
CREATE POLICY "Users can update estimates" ON public.estimates
    FOR UPDATE USING (
        auth.role() = 'authenticated' 
        AND (
            company_id IS NULL  -- Allow updating old records
            OR company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
        )
    );

DROP POLICY IF EXISTS "Users can update invoices" ON public.invoices;
CREATE POLICY "Users can update invoices" ON public.invoices
    FOR UPDATE USING (
        auth.role() = 'authenticated' 
        AND (
            company_id IS NULL  -- Allow updating old records
            OR company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
        )
    );
