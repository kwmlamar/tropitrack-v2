-- Allow authenticated users in the same company to delete time entries
-- (previously only admins could delete, so deletes appeared to succeed in UI but did nothing in DB)
DROP POLICY IF EXISTS "Admins can delete time entries" ON public.time_entries;
CREATE POLICY "Users can delete time entries in their company" ON public.time_entries
    FOR DELETE USING (
        auth.role() = 'authenticated'
        AND company_id IN (
            SELECT company_id FROM public.profiles WHERE id = auth.uid()
        )
    );
