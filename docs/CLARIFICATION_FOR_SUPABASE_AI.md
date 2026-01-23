# Clarification for Supabase AI: Database Separation

## The Situation

I am currently connected to the **TropiTrack v1 database**. This is a **separate database** from TropiTrack v2.

### v1 Database (where we are now)
- Workers table has a single `name` column (e.g., "John Smith")
- This is the OLD database with the original schema

### v2 Database (separate, not currently connected)
- Workers table has `first_name` and `last_name` columns (e.g., first_name="John", last_name="Smith")
- This is the NEW database where workers have already been imported
- Workers were imported from v1, but got new UUIDs in v2
- Projects were also imported from v1 with their original names

## What I Need

I need a SQL query that extracts timesheet data from the **v1 database** (where you are connected). The query should include:
- Worker names (from v1's single `name` field)
- Project names
- All time entry details

This data will be exported and used to create a migration script that runs in the **v2 database** (separate connection). The migration script will:
- Match workers by name: v1 `workers.name` → v2 `workers.first_name || ' ' || workers.last_name`
- Match projects by name: v1 `projects.name` → v2 `projects.name`
- Insert into v2's `time_entries` table

## You Don't Need To

- Create mapping tables in v1 database
- Join to v2 database (it's separate)
- Worry about matching logic (that will be in the migration script)

## You Just Need To

1. Find the timesheet/time entry table in the v1 database
2. Create a query that extracts all timesheet data with:
   - Worker name (from v1 workers table)
   - Project name (from v1 projects table)
   - All time entry fields (date, start_time, end_time, hours, etc.)
3. Provide sample output

The migration script will handle the name-based matching when it runs in v2.
