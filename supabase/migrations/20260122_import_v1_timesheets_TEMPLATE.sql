-- Migration to import timesheets/time entries from TropiTrack v1 to v2
-- This script imports time entry data from the v1 structure
-- 
-- IMPORTANT: This is a TEMPLATE. You need to:
-- 1. Get the actual v1 data structure using the prompt in docs/TIMESHEETS_IMPORT_PROMPT.md
-- 2. Update the VALUES section with actual v1 data
-- 3. Adjust field mappings based on v1 schema
-- 4. Test with a small subset first

-- Step 1: Import time entries
-- Note: Workers and projects must already be imported and matched by name
INSERT INTO public.time_entries (
    worker_id,
    project_id,
    date,
    start_time,
    end_time,
    break_duration_minutes,
    regular_hours,
    overtime_hours,
    notes,
    approved_by,
    approved_at,
    created_by,
    created_at,
    updated_at
)
SELECT
    -- Match worker by name (v1 name vs v2 first_name + last_name)
    w2.id as worker_id,
    -- Match project by name
    p2.id as project_id,
    v1_entries.date,
    v1_entries.start_time,
    v1_entries.end_time,
    COALESCE(v1_entries.break_duration_minutes, 0) as break_duration_minutes,
    v1_entries.regular_hours,
    COALESCE(v1_entries.overtime_hours, 0) as overtime_hours,
    NULLIF(v1_entries.notes, '') as notes,
    -- Match approved_by user if available (may need to match by email or use default)
    COALESCE(
        (SELECT id FROM public.profiles WHERE email = v1_entries.approved_by_email LIMIT 1),
        (SELECT id FROM public.profiles WHERE role = 'admin' LIMIT 1),
        'b4223396-ae61-46ca-aec9-34e3010e16a2'::uuid
    ) as approved_by,
    v1_entries.approved_at,
    -- Match created_by user (may need to match by email or use default)
    COALESCE(
        (SELECT id FROM public.profiles WHERE email = v1_entries.created_by_email LIMIT 1),
        (SELECT id FROM public.profiles WHERE role = 'admin' LIMIT 1),
        'b4223396-ae61-46ca-aec9-34e3010e16a2'::uuid
    ) as created_by,
    v1_entries.created_at,
    v1_entries.updated_at
FROM (
    VALUES
    -- TODO: Replace with actual v1 data
    -- Example structure (adjust based on actual v1 schema):
    (
        'Worker Name from v1',  -- v1_worker_name
        'Project Name from v1',  -- v1_project_name
        '2025-06-01'::date,      -- date
        '08:00:00'::time,        -- start_time
        '17:00:00'::time,        -- end_time
        60,                      -- break_duration_minutes
        8.0,                     -- regular_hours
        0.0,                     -- overtime_hours
        'Worked on foundation',  -- notes
        NULL,                    -- approved_by_email (or user identifier)
        NULL::timestamptz,       -- approved_at
        'user@example.com',      -- created_by_email (or user identifier)
        '2025-06-01 18:00:00+00'::timestamptz,  -- created_at
        '2025-06-01 18:00:00+00'::timestamptz   -- updated_at
    )
    -- Add more rows here...
) AS v1_entries (
    v1_worker_name,
    v1_project_name,
    date,
    start_time,
    end_time,
    break_duration_minutes,
    regular_hours,
    overtime_hours,
    notes,
    approved_by_email,
    approved_at,
    created_by_email,
    created_at,
    updated_at
)
-- Match worker by name (handle both single name field and split names)
LEFT JOIN public.workers w2 ON (
    -- Try exact match first
    LOWER(TRIM(v1_entries.v1_worker_name)) = LOWER(TRIM(w2.first_name || ' ' || w2.last_name))
    OR
    -- Try matching just first name if v1 only has first name
    LOWER(TRIM(v1_entries.v1_worker_name)) = LOWER(TRIM(w2.first_name))
    OR
    -- Try matching last name if v1 only has last name
    LOWER(TRIM(v1_entries.v1_worker_name)) = LOWER(TRIM(w2.last_name))
)
AND w2.company_id = '4ee41a41-7790-4e26-8d3c-e8ce66ab38a3'::uuid
-- Match project by name
LEFT JOIN public.projects p2 ON (
    LOWER(TRIM(v1_entries.v1_project_name)) = LOWER(TRIM(p2.name))
)
AND p2.company_id = '4ee41a41-7790-4e26-8d3c-e8ce66ab38a3'::uuid
-- Only insert if both worker and project are found
WHERE w2.id IS NOT NULL AND p2.id IS NOT NULL
ON CONFLICT DO NOTHING;  -- Adjust conflict resolution as needed

-- Step 2: Report on unmatched records (for debugging)
-- This will help identify workers/projects that couldn't be matched
-- Uncomment and run separately to see what didn't match:
/*
SELECT 
    v1_worker_name,
    v1_project_name,
    date,
    CASE 
        WHEN w2.id IS NULL THEN 'Worker not found'
        WHEN p2.id IS NULL THEN 'Project not found'
        ELSE 'Matched'
    END as match_status
FROM (
    VALUES
    -- Same VALUES as above
) AS v1_entries (...)
LEFT JOIN public.workers w2 ON (...)
LEFT JOIN public.projects p2 ON (...)
WHERE w2.id IS NULL OR p2.id IS NULL;
*/

-- Note: If v1 stores time differently (e.g., total hours instead of start/end times),
-- you may need to calculate start_time and end_time from the hours worked.
-- Example calculation (assuming 8-hour workday starting at 8 AM):
-- start_time = '08:00:00'::time
-- end_time = (start_time + (regular_hours || ' hours')::interval + (break_duration_minutes || ' minutes')::interval)::time
