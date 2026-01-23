-- Migration to import clients and projects from TropiTrack v1 to v2
-- This script imports client and project data from the v1 structure

-- Step 1: Add company_id columns if they don't exist
ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

-- Step 2: Import clients first
INSERT INTO public.clients (
    id,
    company_id,
    name,
    email,
    phone,
    address,
    city,
    tax_id,
    notes,
    created_at,
    updated_at
)
SELECT
    id,
    '4ee41a41-7790-4e26-8d3c-e8ce66ab38a3'::uuid as company_id,
    name,
    NULLIF(email, '') as email,
    NULLIF(phone, '') as phone,
    NULL as address,
    NULL as city,
    NULL as tax_id,
    -- Store contact_person in notes if available
    CASE 
        WHEN contact_person IS NOT NULL AND contact_person != '' THEN 
            'Contact Person: ' || contact_person
        ELSE NULL
    END as notes,
    created_at,
    updated_at
FROM (
    VALUES
    -- Client 1: David & Michelle Wockenfuss
    (
        '656251af-49c8-4f51-b68e-e93ec126694f'::uuid,
        'David & Michelle Wockenfuss',
        NULL,
        '',
        NULL,
        true,
        '2025-06-09 01:03:44.02917+00'::timestamptz,
        '2025-06-09 01:03:44.02917+00'::timestamptz
    ),
    -- Client 2: Sineus
    (
        '3a9421a7-a970-4d2b-88d6-cdbd27ee001a'::uuid,
        'Sineus',
        NULL,
        '',
        NULL,
        true,
        '2025-06-13 15:03:10.203872+00'::timestamptz,
        '2025-06-13 15:03:10.203872+00'::timestamptz
    ),
    -- Client 3: George Damianos
    (
        'c95ab617-9f70-4c22-9692-5ee1da658a97'::uuid,
        'George Damianos',
        NULL,
        NULL,
        NULL,
        true,
        '2025-06-30 18:14:02.53493+00'::timestamptz,
        '2025-06-30 18:14:02.53493+00'::timestamptz
    ),
    -- Client 4: Brent Fox
    (
        '0a5f011d-2197-467d-95f3-079479dcf3f5'::uuid,
        'Brent Fox',
        'anne@paradisebahamas.com',
        '16084360557',
        'Anne Bethel',
        true,
        '2025-07-09 10:11:46.418964+00'::timestamptz,
        '2025-07-09 10:11:46.418964+00'::timestamptz
    ),
    -- Client 5: Eric
    (
        '73382fc3-c594-4e42-857f-c7d2d6a9d93e'::uuid,
        'Eric',
        NULL,
        NULL,
        NULL,
        true,
        '2025-09-22 18:04:04.428631+00'::timestamptz,
        '2025-09-22 18:04:04.428631+00'::timestamptz
    ),
    -- Client 6: Crhis
    (
        '574bbfad-ebfe-416c-9586-402c912d3346'::uuid,
        'Crhis',
        NULL,
        NULL,
        NULL,
        true,
        '2025-11-29 18:44:11.401232+00'::timestamptz,
        '2025-11-29 18:44:11.401232+00'::timestamptz
    )
) AS v1_clients (
    id,
    name,
    email,
    phone,
    contact_person,
    is_active,
    created_at,
    updated_at
)
ON CONFLICT (id) DO UPDATE SET
    company_id = EXCLUDED.company_id,
    name = EXCLUDED.name,
    email = EXCLUDED.email,
    phone = EXCLUDED.phone,
    notes = EXCLUDED.notes,
    updated_at = EXCLUDED.updated_at;

-- Step 3: Import projects
-- Note: We need a default user for created_by. Using the same user ID from workers migration
-- If this user doesn't exist, you'll need to update it to an existing user ID
INSERT INTO public.projects (
    id,
    company_id,
    name,
    description,
    client_id,
    client_name,
    client_email,
    client_phone,
    location,
    status,
    start_date,
    estimated_end_date,
    actual_end_date,
    budget,
    contract_value,
    project_manager_id,
    created_by,
    created_at,
    updated_at
)
SELECT
    id,
    '4ee41a41-7790-4e26-8d3c-e8ce66ab38a3'::uuid as company_id,
    name,
    NULL as description,
    client_id,
    -- Get client name from clients table (required field, so use COALESCE with a fallback)
    COALESCE(
        (SELECT name FROM public.clients WHERE id = client_id),
        'Unknown Client'
    ) as client_name,
    -- Get client email from clients table
    (SELECT email FROM public.clients WHERE id = client_id) as client_email,
    -- Get client phone from clients table
    (SELECT phone FROM public.clients WHERE id = client_id) as client_phone,
    -- Default location since v1 doesn't have this field
    'Nassau, Bahamas' as location,
    -- Map v1 status to v2 status
    CASE 
        WHEN status = 'in_progress' THEN 'active'
        WHEN status = 'not_started' THEN 'planning'
        WHEN status = 'completed' THEN 'completed'
        ELSE 'planning'
    END as status,
    start_date,
    NULL as estimated_end_date,
    end_date as actual_end_date,
    COALESCE(budget, 0)::numeric as budget,
    COALESCE(budget, 0)::numeric as contract_value,
    project_manager_id,
    -- Use project_manager_id if available, otherwise try to get an admin user, 
    -- or fall back to the first available user, or use a known user ID from workers migration
    COALESCE(
        project_manager_id,
        (SELECT id FROM public.profiles WHERE role = 'admin' LIMIT 1),
        (SELECT id FROM public.profiles LIMIT 1),
        'b4223396-ae61-46ca-aec9-34e3010e16a2'::uuid
    ) as created_by,
    created_at,
    updated_at
FROM (
    VALUES
    -- Project 1: Laundromat
    (
        '966a8c73-bfd9-4996-9c99-68422667df90'::uuid,
        'Laundromat',
        '3a9421a7-a970-4d2b-88d6-cdbd27ee001a'::uuid,
        'in_progress',
        '2025-06-01'::date,
        NULL::date,
        NULL::numeric,
        NULL::uuid,
        true,
        '2025-06-13 15:05:10.115228+00'::timestamptz,
        '2025-06-13 15:05:10.115228+00'::timestamptz
    ),
    -- Project 2: Twin Coves Beach, Lot#27
    (
        '0192fec1-64f4-4f5a-8b84-8be73dfbbd28'::uuid,
        'Twin Coves Beach, Lot#27',
        '656251af-49c8-4f51-b68e-e93ec126694f'::uuid,
        'in_progress',
        '2025-05-12'::date,
        NULL::date,
        847270.00::numeric,
        NULL::uuid,
        true,
        '2025-06-13 15:14:12.762261+00'::timestamptz,
        '2025-06-13 15:14:12.762261+00'::timestamptz
    ),
    -- Project 3: Window Replacement, Gate Construction
    (
        '497fa0a9-661c-42c0-886c-02dc0dfde1c5'::uuid,
        'Window Replacement, Gate Construction',
        '73382fc3-c594-4e42-857f-c7d2d6a9d93e'::uuid,
        'in_progress',
        '2025-09-17'::date,
        NULL::date,
        NULL::numeric,
        NULL::uuid,
        true,
        '2025-09-22 18:05:42.465672+00'::timestamptz,
        '2025-09-28 10:48:27.147696+00'::timestamptz
    ),
    -- Project 4: Chris Property
    (
        '3cccf944-ac51-42c3-8c83-428fd87fd71e'::uuid,
        'Chris Property',
        '574bbfad-ebfe-416c-9586-402c912d3346'::uuid,
        'not_started',
        '2025-11-09'::date,
        NULL::date,
        NULL::numeric,
        NULL::uuid,
        true,
        '2025-11-29 18:44:45.314642+00'::timestamptz,
        '2025-11-29 18:44:45.314642+00'::timestamptz
    ),
    -- Project 5: Office Doors Replacement
    (
        'a18864b0-5968-4eb0-be46-3f321678ba63'::uuid,
        'Office Doors Replacement',
        'c95ab617-9f70-4c22-9692-5ee1da658a97'::uuid,
        'completed',
        '2025-06-28'::date,
        '2025-06-30'::date,
        NULL::numeric,
        NULL::uuid,
        true,
        '2025-06-30 18:15:47.483987+00'::timestamptz,
        '2025-07-04 16:37:57.732016+00'::timestamptz
    ),
    -- Project 6: Beam & column repair
    (
        'a1db3898-0294-4030-855b-fdd8cdb3c166'::uuid,
        'Beam & column repair',
        '0a5f011d-2197-467d-95f3-079479dcf3f5'::uuid,
        'completed',
        '2025-06-30'::date,
        NULL::date,
        NULL::numeric,
        NULL::uuid,
        true,
        '2025-07-11 17:08:48.236463+00'::timestamptz,
        '2025-07-24 08:57:21.1041+00'::timestamptz
    ),
    -- Project 7: Masonry Repairs
    (
        '9ed3ad00-3d4d-4872-a1f9-2e593daf0525'::uuid,
        'Masonry Repairs',
        '0a5f011d-2197-467d-95f3-079479dcf3f5'::uuid,
        'completed',
        '2025-07-03'::date,
        NULL::date,
        NULL::numeric,
        NULL::uuid,
        true,
        '2025-07-09 10:14:15.524961+00'::timestamptz,
        '2025-07-24 08:57:47.697937+00'::timestamptz
    )
) AS v1_projects (
    id,
    name,
    client_id,
    status,
    start_date,
    end_date,
    budget,
    project_manager_id,
    is_active,
    created_at,
    updated_at
)
ON CONFLICT (id) DO UPDATE SET
    company_id = EXCLUDED.company_id,
    name = EXCLUDED.name,
    client_id = EXCLUDED.client_id,
    client_name = EXCLUDED.client_name,
    client_email = EXCLUDED.client_email,
    client_phone = EXCLUDED.client_phone,
    status = EXCLUDED.status,
    start_date = EXCLUDED.start_date,
    actual_end_date = EXCLUDED.actual_end_date,
    budget = EXCLUDED.budget,
    contract_value = EXCLUDED.contract_value,
    updated_at = EXCLUDED.updated_at;
