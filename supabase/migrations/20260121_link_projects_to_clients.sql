-- Migration: Link Projects to Clients
-- This migration adds a client_id foreign key to projects table
-- and makes the legacy text fields optional for backward compatibility

-- Step 1: Add client_id column (nullable for now during migration)
ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;

-- Step 2: Make the old text fields nullable (for projects that use client_id)
ALTER TABLE public.projects
ALTER COLUMN client_name DROP NOT NULL;

-- Step 3: Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_projects_client ON public.projects(client_id);

-- Step 4: Add a check constraint to ensure EITHER client_id OR client_name is provided
ALTER TABLE public.projects
ADD CONSTRAINT projects_must_have_client
CHECK (
    client_id IS NOT NULL OR
    (client_name IS NOT NULL AND client_name != '')
);

-- Step 5: Migration helper view to see projects with unlinked clients
CREATE OR REPLACE VIEW public.projects_with_unlinked_clients AS
SELECT
    p.id as project_id,
    p.name as project_name,
    p.client_name,
    p.client_email,
    p.client_phone,
    c.id as potential_client_id,
    c.name as existing_client_name
FROM public.projects p
LEFT JOIN public.clients c ON LOWER(TRIM(p.client_name)) = LOWER(TRIM(c.name))
WHERE p.client_id IS NULL AND p.client_name IS NOT NULL;

COMMENT ON VIEW public.projects_with_unlinked_clients IS
'Shows projects that are still using text-based client data and could potentially be linked to existing clients';

-- Step 6: Function to help migrate existing projects to use client_id
CREATE OR REPLACE FUNCTION public.link_project_to_existing_client(
    p_project_id UUID,
    p_client_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE public.projects
    SET client_id = p_client_id
    WHERE id = p_project_id;

    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.link_project_to_existing_client IS
'Helper function to link an existing project to a client. This is useful for migrating from text-based client data to relational data.';

-- Step 7: Function to create client from project data and link them
CREATE OR REPLACE FUNCTION public.convert_project_client_to_linked_client(
    p_project_id UUID
)
RETURNS UUID AS $$
DECLARE
    v_client_id UUID;
    v_project public.projects%ROWTYPE;
    v_existing_client_id UUID;
BEGIN
    -- Get project details
    SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Project not found';
    END IF;

    -- Check if project already has a client_id
    IF v_project.client_id IS NOT NULL THEN
        RETURN v_project.client_id;
    END IF;

    -- Check if a client with this name already exists
    SELECT id INTO v_existing_client_id
    FROM public.clients
    WHERE LOWER(TRIM(name)) = LOWER(TRIM(v_project.client_name))
    LIMIT 1;

    IF v_existing_client_id IS NOT NULL THEN
        -- Link to existing client
        UPDATE public.projects
        SET client_id = v_existing_client_id
        WHERE id = p_project_id;

        RETURN v_existing_client_id;
    ELSE
        -- Create new client
        INSERT INTO public.clients (name, email, phone)
        VALUES (v_project.client_name, v_project.client_email, v_project.client_phone)
        RETURNING id INTO v_client_id;

        -- Link project to new client
        UPDATE public.projects
        SET client_id = v_client_id
        WHERE id = p_project_id;

        RETURN v_client_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.convert_project_client_to_linked_client IS
'Converts a project using text-based client data to use a linked client. Creates a new client if one does not exist, or links to existing client if found by name.';

-- Step 8: Updated view for projects with client data (handles both old and new approach)
CREATE OR REPLACE VIEW public.projects_with_client_info AS
SELECT
    p.*,
    COALESCE(c.name, p.client_name) as client_display_name,
    COALESCE(c.email, p.client_email) as client_display_email,
    COALESCE(c.phone, p.client_phone) as client_display_phone,
    COALESCE(c.address, '') as client_display_address,
    COALESCE(c.city, '') as client_display_city,
    c.id IS NOT NULL as is_linked_client
FROM public.projects p
LEFT JOIN public.clients c ON p.client_id = c.id;

COMMENT ON VIEW public.projects_with_client_info IS
'Unified view showing all projects with their client information, whether stored as text (legacy) or linked via client_id (new approach)';

-- Grant permissions for the view
GRANT SELECT ON public.projects_with_client_info TO authenticated;
GRANT SELECT ON public.projects_with_unlinked_clients TO authenticated;
