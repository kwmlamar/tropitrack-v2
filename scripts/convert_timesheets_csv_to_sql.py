#!/usr/bin/env python3
"""
Convert timesheet CSV to SQL VALUES format for migration script.
Usage: python3 convert_timesheets_csv_to_sql.py <input.csv >output.sql
"""

import csv
import sys
from datetime import datetime

def escape_sql_string(value):
    """Escape single quotes and handle NULL values"""
    if value is None or value == '' or value == 'null':
        return 'NULL'
    # Escape single quotes by doubling them
    escaped = str(value).replace("'", "''")
    return f"'{escaped}'"

def format_time(value):
    """Format time value for SQL"""
    if not value or value == 'null' or value == '':
        return 'NULL::time'
    # Ensure time format is correct
    if ':' in str(value):
        return f"'{value}'::time"
    return 'NULL::time'

def format_date(value):
    """Format date value for SQL"""
    if not value or value == 'null' or value == '':
        return 'NULL::date'
    return f"'{value}'::date"

def format_timestamptz(value):
    """Format timestamp value for SQL"""
    if not value or value == 'null' or value == '':
        return 'NULL::timestamptz'
    return f"'{value}'::timestamptz"

def format_decimal(value):
    """Format decimal value for SQL"""
    if not value or value == 'null' or value == '':
        return '0.0'
    try:
        return str(float(value))
    except:
        return '0.0'

def format_integer(value):
    """Format integer value for SQL"""
    if not value or value == 'null' or value == '':
        return '0'
    try:
        return str(int(float(value)))
    except:
        return '0'

def main():
    input_file = '/Users/kwmlamar/Downloads/Supabase Snippet SQL Query.csv'
    
    with open(input_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        rows = list(reader)
    
    print("-- Converted from CSV to SQL VALUES format")
    print(f"-- Total rows: {len(rows)}\n")
    
    # Generate VALUES rows
    values_rows = []
    for i, row in enumerate(rows, 1):
        # Map CSV columns to SQL VALUES
        worker_name = escape_sql_string(row.get('worker_name_normalized') or row.get('worker_name_raw', ''))
        project_name = escape_sql_string(row.get('project_name_normalized') or row.get('project_name_raw', ''))
        date_val = format_date(row.get('date', ''))
        start_time = format_time(row.get('clock_in', ''))
        end_time = format_time(row.get('clock_out', ''))
        break_minutes = format_integer(row.get('break_duration_minutes', '0'))
        regular_hours = format_decimal(row.get('regular_hours', '0'))
        overtime_hours = format_decimal(row.get('overtime_hours', '0'))
        notes = escape_sql_string(row.get('notes') or row.get('task_description', ''))
        approved_at = format_timestamptz(row.get('approved_at', ''))
        # created_by is already a UUID, format it properly
        created_by_val = row.get('created_by', '').strip()
        if not created_by_val or created_by_val == 'null' or created_by_val == '':
            created_by_val = "'b4223396-ae61-46ca-aec9-34e3010e16a2'::uuid"
        else:
            created_by_val = f"'{created_by_val}'::uuid"
        created_at = format_timestamptz(row.get('created_at', ''))
        updated_at = format_timestamptz(row.get('updated_at', ''))
        
        # Build VALUES row
        values_row = f"    ({worker_name}, {project_name}, {date_val}, {start_time}, {end_time}, {break_minutes}, {regular_hours}, {overtime_hours}, {notes}, NULL, {approved_at}, {created_by_val}, {created_at}, {updated_at})"
        
        # Add comma except for last row
        if i < len(rows):
            values_row += ','
        
        values_rows.append(values_row)
    
    # Output all VALUES rows
    print('\n'.join(values_rows))

if __name__ == '__main__':
    main()
