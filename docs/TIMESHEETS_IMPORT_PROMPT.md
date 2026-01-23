# Prompt for Supabase AI: Import Timesheets from TropiTrack v1 to v2

## Important Context - Two Separate Databases

**CRITICAL**: TropiTrack v1 and v2 are **TWO SEPARATE DATABASES**. 

### Database Separation
- **v1 Database** (where you are now): Contains the original data with workers having a single `name` field
- **v2 Database** (separate): Contains the new schema where workers have `first_name` and `last_name` fields

### Current Situation
- **You are connected to the v1 database** - this is where we need to extract timesheet data from
- **The v2 database** (separate connection) already has:
  - Workers imported with `first_name` and `last_name` (split from v1's single `name` field)
  - Projects imported with their original names
  - All linked to company_id `'4ee41a41-7790-4e26-8d3c-e8ce66ab38a3'`

### What We Need
1. **From v1 database** (where you are): Extract all timesheet data with worker names and project names
2. **Later in v2 database**: Create a migration script that matches workers/projects by name and inserts the time entries

### Why Name Matching?
- Workers and projects were imported from v1 to v2, but they got new UUIDs in v2
- We cannot match by ID because the IDs are different between databases
- We must match by name: v1 `workers.name` → v2 `workers.first_name || ' ' || workers.last_name`

## Migration Goal
I need to migrate timesheet/time entry data from TropiTrack v1 database to TropiTrack v2 database. Since workers/projects have already been imported to v2 with new UUIDs, we need to match records by name rather than by ID when creating the migration script.

## V2 Database Structure

### Target Table: `public.time_entries`
```sql
CREATE TABLE public.time_entries (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    worker_id UUID REFERENCES public.workers(id) ON DELETE CASCADE NOT NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    break_duration_minutes INTEGER DEFAULT 0,
    regular_hours DECIMAL(5, 2) NOT NULL,
    overtime_hours DECIMAL(5, 2) DEFAULT 0,
    notes TEXT,
    approved_by UUID REFERENCES public.profiles(id),
    approved_at TIMESTAMPTZ,
    created_by UUID REFERENCES public.profiles(id) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

## What I Need from V1 Database

**You are working in the v1 database.** Please provide a SQL query that will fetch all timesheet/time entry records from the v1 database. The query should return the following information for each time entry:

1. **Worker Information** (to match with v2 workers):
   - Worker name (full name or first_name + last_name)
   - Worker ID from v1 (for reference, but we'll match by name)

2. **Project Information** (to match with v2 projects):
   - Project name
   - Project ID from v1 (for reference, but we'll match by name)

3. **Time Entry Details**:
   - Date of the time entry
   - Start time
   - End time
   - Break duration (if available, in minutes)
   - Regular hours worked
   - Overtime hours worked (if available)
   - Notes/comments
   - Approval status and who approved (if available)
   - Approval timestamp (if available)
   - Created timestamp
   - Updated timestamp

## Important Notes

1. **Worker Matching Strategy**: 
   - In v1: Workers have a single `name` field (e.g., "John Smith")
   - In v2: Workers have `first_name` and `last_name` fields (e.g., first_name="John", last_name="Smith")
   - Matching will be done by comparing v1 `workers.name` with v2 `workers.first_name || ' ' || workers.last_name`
   - Use case-insensitive matching
   - Handle name variations (extra spaces, etc.)
   - The migration script will be run in v2 database and will match by name

2. **Project Matching Strategy**: 
   - Projects in v2 have been imported with their original names from v1
   - Match projects by exact name match (case-insensitive)
   - Handle any name variations

3. **Company Context**: 
   - All imported time entries will be associated with company_id `'4ee41a41-7790-4e26-8d3c-e8ce66ab38a3'`
   - This is the same company that all workers and projects are linked to in v2

4. **Database Separation**:
   - The query you provide will be run in the **v1 database** to extract data
   - The resulting data will be used to create a migration script that runs in the **v2 database**
   - The migration script will match workers/projects by name and insert into v2's `time_entries` table

4. **Required Fields**: 
   - `worker_id`: Must be matched from v2 workers table
   - `project_id`: Must be matched from v2 projects table
   - `date`: Required
   - `start_time`: Required (if not available, we may need to derive from hours)
   - `end_time`: Required (if not available, we may need to derive from hours)
   - `regular_hours`: Required
   - `created_by`: Required - use a default user ID or match from profiles

5. **Optional Fields**:
   - `break_duration_minutes`: Default to 0 if not available
   - `overtime_hours`: Default to 0 if not available
   - `notes`: Can be NULL
   - `approved_by`: Can be NULL
   - `approved_at`: Can be NULL

## Expected Output Format

Please provide:
1. **A SQL query to extract all time entry data from the v1 database** (the database you're currently connected to)
2. **Sample output** showing the structure of the data (first 5-10 rows)
3. **Data export format**: The query results will be used to create VALUES rows in a migration script
4. **Any notes about**:
   - Field name differences between v1 and v2
   - Data format differences (e.g., time formats, date formats)
   - Missing fields that might need defaults
   - Any special cases or edge cases to handle

## Output Requirements

The query should return data in a format that can be easily converted to SQL VALUES rows. For example:
- Dates should be in DATE format or ISO string format
- Times should be in TIME format or HH:MM:SS string format
- All fields should be clearly named
- Include worker name and project name (not just IDs) for matching purposes

## Example Query Structure (if helpful)

Since you're in the v1 database, the query should look something like this (adjust table/column names to match v1 schema):
```sql
SELECT 
    te.id as v1_time_entry_id,
    w.name as worker_name,  -- This is the single name field from v1
    w.id as v1_worker_id,   -- For reference only, won't be used in v2
    p.name as project_name, -- Project name for matching in v2
    p.id as v1_project_id,   -- For reference only, won't be used in v2
    te.date,
    te.start_time,
    te.end_time,
    te.break_duration_minutes,
    te.regular_hours,
    te.overtime_hours,
    te.notes,
    te.approved_by as v1_approved_by_id,  -- May need to join to get email/name
    te.approved_at,
    te.created_by as v1_created_by_id,    -- May need to join to get email/name
    te.created_at,
    te.updated_at
FROM public.time_entries te  -- or whatever the table is called in v1
JOIN public.workers w ON te.worker_id = w.id
JOIN public.projects p ON te.project_id = p.id
WHERE w.company_id = '4ee41a41-7790-4e26-8d3c-e8ce66ab38a3'  -- Filter by company
ORDER BY te.date DESC, te.created_at DESC;
```

**Note**: Adjust table names, column names, and join conditions to match your actual v1 schema.

## Questions to Answer

1. What is the exact table name for time entries in v1? (e.g., `time_entries`, `timesheets`, `time_logs`, etc.)
2. What are the exact column names in v1?
3. How are workers referenced in v1 time entries? (worker_id, worker_name, etc.)
4. How are projects referenced in v1 time entries? (project_id, project_name, etc.)
5. What is the format for time fields? (TIME, TIMESTAMP, VARCHAR, etc.)
6. How are regular hours and overtime hours calculated/stored?
7. Is there an approval workflow in v1? If so, what fields track it?
8. Are there any other related tables I should be aware of? (e.g., timesheet submissions, approvals, etc.)
9. If `start_time` and `end_time` are not available, how are hours stored? (total hours, duration, etc.)
10. What is the default `created_by` user ID or email I should use if the original creator cannot be matched?

## Final Output Needed

Please provide:
1. **The complete SQL query** that extracts all timesheet data from v1
2. **Run the query** and provide the first 10-20 rows of actual data
3. **Column descriptions** explaining what each field represents
4. **Data format notes** (e.g., "dates are in YYYY-MM-DD format", "times are in HH:MM:SS format")

This data will be used to create a migration script that runs in the v2 database and matches workers/projects by name.
