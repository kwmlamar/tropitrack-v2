-- Migration to add company_id to vendors and purchase_orders tables
-- This ensures proper multi-tenant data isolation

-- Add company_id column to vendors if it doesn't exist
ALTER TABLE public.vendors 
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_vendors_company_id ON public.vendors(company_id);

-- Note: We cannot backfill vendors.company_id automatically because vendors table
-- doesn't have a created_by field. Existing vendors will need to be manually assigned
-- or will remain NULL (which the SELECT policy will allow for backward compatibility)

-- Add company_id column to purchase_orders if it doesn't exist
ALTER TABLE public.purchase_orders 
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_purchase_orders_company_id ON public.purchase_orders(company_id);

-- Populate company_id from profiles (using created_by)
UPDATE public.purchase_orders po
SET company_id = p.company_id
FROM public.profiles p
WHERE po.created_by = p.id 
  AND po.company_id IS NULL
  AND p.company_id IS NOT NULL;

-- Update RLS policies to filter by company_id

-- Update SELECT policy to include company_id check
DROP POLICY IF EXISTS "Users can view vendors" ON public.vendors;
CREATE POLICY "Users can view vendors" ON public.vendors
    FOR SELECT USING (
        auth.role() = 'authenticated' 
        AND (
            company_id IS NULL  -- Allow viewing old records without company_id (backward compatibility)
            OR company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
        )
    );

-- Update INSERT policy to require company_id
DROP POLICY IF EXISTS "Users can create vendors" ON public.vendors;
CREATE POLICY "Users can create vendors" ON public.vendors
    FOR INSERT WITH CHECK (
        auth.role() = 'authenticated' 
        AND company_id IS NOT NULL
        AND company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
        AND (SELECT company_id FROM public.profiles WHERE id = auth.uid()) IS NOT NULL
    );

-- Update UPDATE policy to include company_id check
DROP POLICY IF EXISTS "Users can update vendors" ON public.vendors;
CREATE POLICY "Users can update vendors" ON public.vendors
    FOR UPDATE USING (
        auth.role() = 'authenticated' 
        AND (
            company_id IS NULL  -- Allow updating old records
            OR company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
        )
    );

-- Update purchase_orders RLS policies to filter by company_id

-- Update SELECT policy to include company_id check
DROP POLICY IF EXISTS "Users can view POs" ON public.purchase_orders;
CREATE POLICY "Users can view POs" ON public.purchase_orders
    FOR SELECT USING (
        auth.role() = 'authenticated' 
        AND (
            company_id IS NULL  -- Allow viewing old records without company_id (backward compatibility)
            OR company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
        )
    );

-- Update INSERT policy to require company_id
DROP POLICY IF EXISTS "Users can create POs" ON public.purchase_orders;
CREATE POLICY "Users can create POs" ON public.purchase_orders
    FOR INSERT WITH CHECK (
        auth.role() = 'authenticated' 
        AND company_id IS NOT NULL
        AND company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
        AND (SELECT company_id FROM public.profiles WHERE id = auth.uid()) IS NOT NULL
    );

-- Update UPDATE policy to include company_id check
DROP POLICY IF EXISTS "Users can update POs" ON public.purchase_orders;
CREATE POLICY "Users can update POs" ON public.purchase_orders
    FOR UPDATE USING (
        auth.role() = 'authenticated' 
        AND (
            company_id IS NULL  -- Allow updating old records
            OR company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
        )
    );

-- Update DELETE policy to allow users to delete POs from their company
DROP POLICY IF EXISTS "Admins can delete POs" ON public.purchase_orders;
CREATE POLICY "Users can delete POs" ON public.purchase_orders
    FOR DELETE USING (
        auth.role() = 'authenticated' 
        AND (
            -- Allow admins to delete any PO
            EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
            -- OR allow users to delete POs from their company
            OR company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
        )
    );
