/**
 * AI Agent Tool Definitions
 * Defines all function tools available to the AI agent for interacting with TropiTrack
 * Using OpenAI function calling format
 */

// ============================================
// PROJECT TOOLS
// ============================================

export const projectTools = [
  {
    name: "list_projects",
    description: "List all projects with optional filtering by status, date range, or budget",
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["all", "planning", "active", "on_hold", "completed", "cancelled"],
          description: "Filter by project status. Default is 'all'",
        },
        start_date: {
          type: "string",
          description: "Filter projects starting after this date (YYYY-MM-DD format)",
        },
        end_date: {
          type: "string",
          description: "Filter projects ending before this date (YYYY-MM-DD format)",
        },
        min_budget: {
          type: "number",
          description: "Filter projects with budget greater than or equal to this amount",
        },
        max_budget: {
          type: "number",
          description: "Filter projects with budget less than or equal to this amount",
        },
      },
    },
  },
  {
    name: "get_project_details",
    description: "Get detailed information about a specific project including costs, timeline, and team",
    parameters: {
      type: "object",
      properties: {
        project_id: {
          type: "string",
          description: "The UUID of the project",
        },
      },
      required: ["project_id"],
    },
  },
  {
    name: "create_project",
    description: "Create a new construction project",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Project name",
        },
        description: {
          type: "string",
          description: "Detailed project description",
        },
        client_id: {
          type: "string",
          description: "UUID of the client (if linking to existing client)",
        },
        client_name: {
          type: "string",
          description: "Client name (if not using client_id)",
        },
        client_email: {
          type: "string",
          description: "Client email",
        },
        client_phone: {
          type: "string",
          description: "Client phone number",
        },
        location: {
          type: "string",
          description: "Project location/address",
        },
        status: {
          type: "string",
          enum: ["planning", "active", "on_hold", "completed", "cancelled"],
          description: "Project status",
        },
        start_date: {
          type: "string",
          description: "Project start date (YYYY-MM-DD)",
        },
        estimated_end_date: {
          type: "string",
          description: "Estimated completion date (YYYY-MM-DD)",
        },
        budget: {
          type: "number",
          description: "Project budget in BSD",
        },
        contract_value: {
          type: "number",
          description: "Contract value in BSD",
        },
        project_manager_id: {
          type: "string",
          description: "UUID of the project manager (optional)",
        },
      },
      required: ["name", "location", "status", "start_date", "budget", "contract_value"],
    },
  },
  {
    name: "update_project",
    description: "Update an existing project's details",
    parameters: {
      type: "object",
      properties: {
        project_id: {
          type: "string",
          description: "The UUID of the project to update",
        },
        updates: {
          type: "object",
          description: "Fields to update (can include name, description, status, budget, etc.)",
        },
      },
      required: ["project_id", "updates"],
    },
  },
  {
    name: "delete_project",
    description: "Delete a project. IMPORTANT: This is destructive and cannot be undone. Always confirm with user first.",
    parameters: {
      type: "object",
      properties: {
        project_id: {
          type: "string",
          description: "The UUID of the project to delete",
        },
      },
      required: ["project_id"],
    },
  },
  {
    name: "get_project_costs",
    description: "Get detailed cost breakdown for a project including labor, materials, equipment, and overhead",
    parameters: {
      type: "object",
      properties: {
        project_id: {
          type: "string",
          description: "The UUID of the project",
        },
      },
      required: ["project_id"],
    },
  },
  {
    name: "get_project_profitability",
    description: "Calculate project profitability: contract value vs actual costs, profit margin, variance from budget",
    parameters: {
      type: "object",
      properties: {
        project_id: {
          type: "string",
          description: "The UUID of the project",
        },
      },
      required: ["project_id"],
    },
  },
];

// ============================================
// TIMESHEET TOOLS
// ============================================

export const timesheetTools = [
  {
    name: "create_timesheet_entry",
    description: "Create a single time entry for a worker on a project. Automatically calculates pay including overtime and NIB deductions.",
    parameters: {
      type: "object",
      properties: {
        worker_id: {
          type: "string",
          description: "UUID of the worker",
        },
        project_id: {
          type: "string",
          description: "UUID of the project",
        },
        work_date: {
          type: "string",
          description: "Date of work (YYYY-MM-DD)",
        },
        start_time: {
          type: "string",
          description: "Start time (HH:MM format, 24-hour)",
        },
        end_time: {
          type: "string",
          description: "End time (HH:MM format, 24-hour)",
        },
        break_duration_minutes: {
          type: "number",
          description: "Break duration in minutes (default 0)",
          default: 0,
        },
        notes: {
          type: "string",
          description: "Optional notes about the work performed",
        },
      },
      required: ["worker_id", "project_id", "work_date", "start_time", "end_time"],
    },
  },
  {
    name: "bulk_create_timesheets",
    description: "Create multiple time entries at once for the same date (useful for daily crew timesheets)",
    parameters: {
      type: "object",
      properties: {
        work_date: {
          type: "string",
          description: "Date of work (YYYY-MM-DD)",
        },
        project_id: {
          type: "string",
          description: "UUID of the project (if all entries are for same project)",
        },
        entries: {
          type: "array",
          description: "Array of time entry objects",
          items: {
            type: "object",
            properties: {
              worker_id: { type: "string" },
              project_id: { type: "string", description: "Overrides the main project_id if provided" },
              start_time: { type: "string" },
              end_time: { type: "string" },
              break_duration_minutes: { type: "number", default: 0 },
              notes: { type: "string" },
            },
            required: ["worker_id", "start_time", "end_time"],
          },
        },
      },
      required: ["work_date", "entries"],
    },
  },
  {
    name: "get_timesheets",
    description: "Get time entries with filtering by worker, project, or date range",
    parameters: {
      type: "object",
      properties: {
        worker_id: {
          type: "string",
          description: "Filter by worker UUID",
        },
        project_id: {
          type: "string",
          description: "Filter by project UUID",
        },
        start_date: {
          type: "string",
          description: "Start of date range (YYYY-MM-DD)",
        },
        end_date: {
          type: "string",
          description: "End of date range (YYYY-MM-DD)",
        },
        approved_only: {
          type: "boolean",
          description: "Only show approved timesheets",
          default: false,
        },
      },
    },
  },
  {
    name: "update_timesheet",
    description: "Update an existing time entry",
    parameters: {
      type: "object",
      properties: {
        timesheet_id: {
          type: "string",
          description: "UUID of the time entry to update",
        },
        updates: {
          type: "object",
          description: "Fields to update (start_time, end_time, break_duration_minutes, notes, etc.)",
        },
      },
      required: ["timesheet_id", "updates"],
    },
  },
  {
    name: "delete_timesheet",
    description: "Delete a time entry. IMPORTANT: This is destructive. Always confirm with user first.",
    parameters: {
      type: "object",
      properties: {
        timesheet_id: {
          type: "string",
          description: "UUID of the time entry to delete",
        },
      },
      required: ["timesheet_id"],
    },
  },
];

// ============================================
// WORKER TOOLS
// ============================================

export const workerTools = [
  {
    name: "list_workers",
    description: "List all workers with optional filtering by status or type",
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["all", "active", "inactive", "terminated"],
          description: "Filter by worker status",
          default: "active",
        },
        worker_type: {
          type: "string",
          enum: ["all", "hourly", "salary", "contract"],
          description: "Filter by worker type",
        },
      },
    },
  },
  {
    name: "get_worker_details",
    description: "Get detailed information about a specific worker including rates, contact info, and employment details",
    parameters: {
      type: "object",
      properties: {
        worker_id: {
          type: "string",
          description: "UUID of the worker",
        },
      },
      required: ["worker_id"],
    },
  },
  {
    name: "create_worker",
    description: "Add a new worker to the system",
    parameters: {
      type: "object",
      properties: {
        first_name: { type: "string" },
        last_name: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        address: { type: "string" },
        national_insurance_number: { type: "string", description: "NIB number" },
        worker_type: {
          type: "string",
          enum: ["hourly", "salary", "contract"],
        },
        hourly_rate: {
          type: "number",
          description: "Hourly rate in BSD (required if worker_type is hourly)",
        },
        salary_amount: {
          type: "number",
          description: "Annual salary in BSD (required if worker_type is salary)",
        },
        overtime_rate_multiplier: {
          type: "number",
          description: "Overtime multiplier (default 1.5 for time-and-a-half)",
          default: 1.5,
        },
        status: {
          type: "string",
          enum: ["active", "inactive", "terminated"],
          default: "active",
        },
        hire_date: {
          type: "string",
          description: "Hire date (YYYY-MM-DD)",
        },
        emergency_contact_name: { type: "string" },
        emergency_contact_phone: { type: "string" },
        nib_enabled: {
          type: "boolean",
          description: "Whether to deduct NIB contributions",
          default: true,
        },
        nib_number: { type: "string" },
        notes: { type: "string" },
      },
      required: ["first_name", "last_name", "worker_type", "hire_date"],
    },
  },
  {
    name: "update_worker",
    description: "Update worker information including rates, status, or contact details",
    parameters: {
      type: "object",
      properties: {
        worker_id: {
          type: "string",
          description: "UUID of the worker to update",
        },
        updates: {
          type: "object",
          description: "Fields to update",
        },
      },
      required: ["worker_id", "updates"],
    },
  },
  {
    name: "get_worker_hours",
    description: "Get total hours worked by a worker within a date range, broken down by regular and overtime",
    parameters: {
      type: "object",
      properties: {
        worker_id: {
          type: "string",
          description: "UUID of the worker",
        },
        start_date: {
          type: "string",
          description: "Start date (YYYY-MM-DD)",
        },
        end_date: {
          type: "string",
          description: "End date (YYYY-MM-DD)",
        },
        by_project: {
          type: "boolean",
          description: "Break down hours by project",
          default: false,
        },
      },
      required: ["worker_id", "start_date", "end_date"],
    },
  },
];

// ============================================
// INVOICE TOOLS
// ============================================

export const invoiceTools = [
  {
    name: "list_invoices",
    description: "List invoices with optional filtering by status, client, project, or date range",
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["all", "draft", "sent", "viewed", "paid", "partial", "overdue", "cancelled", "void"],
        },
        client_id: { type: "string" },
        project_id: { type: "string" },
        start_date: { type: "string", description: "Filter by issue_date >= start_date" },
        end_date: { type: "string", description: "Filter by issue_date <= end_date" },
        min_amount: { type: "number" },
        max_amount: { type: "number" },
      },
    },
  },
  {
    name: "get_invoice_details",
    description: "Get complete invoice details including line items and payment history",
    parameters: {
      type: "object",
      properties: {
        invoice_id: {
          type: "string",
          description: "UUID of the invoice",
        },
      },
      required: ["invoice_id"],
    },
  },
  {
    name: "create_invoice",
    description: "Create a new invoice for a client/project",
    parameters: {
      type: "object",
      properties: {
        client_id: { type: "string" },
        project_id: { type: "string" },
        client_name: { type: "string" },
        client_email: { type: "string" },
        client_phone: { type: "string" },
        client_address: { type: "string" },
        invoice_type: {
          type: "string",
          enum: ["progress", "time_and_materials", "fixed_price", "final"],
        },
        issue_date: { type: "string", description: "YYYY-MM-DD" },
        due_date: { type: "string", description: "YYYY-MM-DD" },
        line_items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              category: { type: "string", enum: ["labor", "material", "equipment", "overhead", "other"] },
              description: { type: "string" },
              quantity: { type: "number" },
              unit: { type: "string" },
              unit_rate: { type: "number" },
            },
            required: ["description", "quantity", "unit_rate"],
          },
        },
        tax_rate: { type: "number", description: "Tax rate as decimal (e.g., 0.10 for 10%)", default: 0.10 },
        notes: { type: "string" },
        terms: { type: "string" },
      },
      required: ["invoice_type", "issue_date", "due_date", "line_items"],
    },
  },
  {
    name: "update_invoice",
    description: "Update invoice details. Cannot update if status is 'paid' or 'void'.",
    parameters: {
      type: "object",
      properties: {
        invoice_id: { type: "string" },
        updates: { type: "object" },
      },
      required: ["invoice_id", "updates"],
    },
  },
  {
    name: "mark_invoice_paid",
    description: "Mark an invoice as fully paid by recording a payment",
    parameters: {
      type: "object",
      properties: {
        invoice_id: { type: "string" },
        payment_date: { type: "string", description: "YYYY-MM-DD" },
        payment_method: {
          type: "string",
          enum: ["cash", "check", "bank_transfer", "credit_card", "other"],
        },
        reference_number: { type: "string", description: "Check number, transaction ID, etc." },
        notes: { type: "string" },
      },
      required: ["invoice_id", "payment_date", "payment_method"],
    },
  },
  {
    name: "send_invoice",
    description: "Send invoice to client via email (marks status as 'sent')",
    parameters: {
      type: "object",
      properties: {
        invoice_id: { type: "string" },
        email_to: { type: "string", description: "Override client email if needed" },
        email_message: { type: "string", description: "Custom message to include" },
      },
      required: ["invoice_id"],
    },
  },
  {
    name: "generate_invoice_pdf",
    description: "Generate PDF for an invoice (returns URL)",
    parameters: {
      type: "object",
      properties: {
        invoice_id: { type: "string" },
      },
      required: ["invoice_id"],
    },
  },
];

// ============================================
// ESTIMATE TOOLS
// ============================================

export const estimateTools = [
  {
    name: "list_estimates",
    description: "List estimates with optional filtering",
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["all", "draft", "sent", "approved", "rejected", "converted", "expired"],
        },
        client_id: { type: "string" },
        start_date: { type: "string" },
        end_date: { type: "string" },
      },
    },
  },
  {
    name: "create_estimate",
    description: "Create a new project estimate/quote for a client",
    parameters: {
      type: "object",
      properties: {
        client_id: { type: "string" },
        client_name: { type: "string" },
        client_email: { type: "string" },
        client_phone: { type: "string" },
        client_address: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        issue_date: { type: "string", description: "YYYY-MM-DD" },
        valid_until: { type: "string", description: "YYYY-MM-DD" },
        line_items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              category: { type: "string", enum: ["labor", "material", "equipment", "subcontractor", "other"] },
              description: { type: "string" },
              quantity: { type: "number" },
              unit: { type: "string" },
              unit_rate: { type: "number" },
            },
          },
        },
        overhead_markup_percent: { type: "number", default: 15 },
        profit_margin_percent: { type: "number", default: 10 },
        tax_rate: { type: "number", default: 0.10 },
        notes: { type: "string" },
        terms_and_conditions: { type: "string" },
      },
      required: ["title", "issue_date", "line_items"],
    },
  },
  {
    name: "convert_estimate_to_project",
    description: "Convert an approved estimate into an actual project",
    parameters: {
      type: "object",
      properties: {
        estimate_id: { type: "string" },
        project_start_date: { type: "string", description: "YYYY-MM-DD" },
        project_manager_id: { type: "string", description: "Optional PM assignment" },
      },
      required: ["estimate_id", "project_start_date"],
    },
  },
  {
    name: "send_estimate",
    description: "Send estimate to client via email",
    parameters: {
      type: "object",
      properties: {
        estimate_id: { type: "string" },
        email_to: { type: "string" },
        email_message: { type: "string" },
      },
      required: ["estimate_id"],
    },
  },
];

// ============================================
// MATERIAL TOOLS
// ============================================

export const materialTools = [
  {
    name: "list_materials",
    description: "List materials inventory with optional filters",
    parameters: {
      type: "object",
      properties: {
        category: { type: "string" },
        low_stock_only: { type: "boolean", description: "Only show items at or below minimum stock level" },
        vendor_id: { type: "string" },
      },
    },
  },
  {
    name: "create_purchase_order",
    description: "Create a purchase order for materials from a vendor",
    parameters: {
      type: "object",
      properties: {
        vendor_id: { type: "string" },
        project_id: { type: "string", description: "Optional project to charge to" },
        order_date: { type: "string", description: "YYYY-MM-DD" },
        expected_delivery_date: { type: "string", description: "YYYY-MM-DD" },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              material_id: { type: "string" },
              description: { type: "string" },
              quantity: { type: "number" },
              unit_price: { type: "number" },
            },
          },
        },
        notes: { type: "string" },
      },
      required: ["vendor_id", "items"],
    },
  },
  {
    name: "allocate_materials_to_project",
    description: "Record materials used on a project (deducts from inventory)",
    parameters: {
      type: "object",
      properties: {
        project_id: { type: "string" },
        allocations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              material_id: { type: "string" },
              quantity: { type: "number" },
              notes: { type: "string" },
            },
            required: ["material_id", "quantity"],
          },
        },
        allocation_date: { type: "string", description: "YYYY-MM-DD" },
      },
      required: ["project_id", "allocations"],
    },
  },
];

// ============================================
// PAYROLL TOOLS
// ============================================

export const payrollTools = [
  {
    name: "calculate_payroll",
    description: "Calculate payroll for workers within a date range. Includes gross pay, NIB deductions, and net pay.",
    parameters: {
      type: "object",
      properties: {
        start_date: { type: "string", description: "YYYY-MM-DD" },
        end_date: { type: "string", description: "YYYY-MM-DD" },
        worker_ids: {
          type: "array",
          items: { type: "string" },
          description: "Optional: calculate only for specific workers",
        },
        by_project: { type: "boolean", description: "Break down by project", default: false },
      },
      required: ["start_date", "end_date"],
    },
  },
  {
    name: "get_nib_summary",
    description: "Get NIB (National Insurance Board) deduction summary for reporting",
    parameters: {
      type: "object",
      properties: {
        start_date: { type: "string", description: "YYYY-MM-DD" },
        end_date: { type: "string", description: "YYYY-MM-DD" },
      },
      required: ["start_date", "end_date"],
    },
  },
  {
    name: "get_financial_summary",
    description: "Get financial summary: total revenue, total costs, profit for a date range",
    parameters: {
      type: "object",
      properties: {
        start_date: { type: "string", description: "YYYY-MM-DD" },
        end_date: { type: "string", description: "YYYY-MM-DD" },
        by_project: { type: "boolean", default: false },
      },
      required: ["start_date", "end_date"],
    },
  },
];

// ============================================
// REPORT TOOLS
// ============================================

export const reportTools = [
  {
    name: "generate_project_report",
    description: "Generate comprehensive project report with costs, timeline, and progress",
    parameters: {
      type: "object",
      properties: {
        project_id: { type: "string" },
        include_financials: { type: "boolean", default: true },
        include_timeline: { type: "boolean", default: true },
        include_labor: { type: "boolean", default: true },
        include_materials: { type: "boolean", default: true },
      },
      required: ["project_id"],
    },
  },
  {
    name: "generate_payroll_report",
    description: "Generate detailed payroll report for a pay period",
    parameters: {
      type: "object",
      properties: {
        start_date: { type: "string", description: "YYYY-MM-DD" },
        end_date: { type: "string", description: "YYYY-MM-DD" },
        worker_id: { type: "string", description: "Optional: report for single worker" },
      },
      required: ["start_date", "end_date"],
    },
  },
  {
    name: "get_overdue_invoices",
    description: "Get all overdue invoices with aging analysis",
    parameters: {
      type: "object",
      properties: {
        include_partial_payments: { type: "boolean", default: true },
      },
    },
  },
  {
    name: "compare_budget_vs_actual",
    description: "Compare budgeted amounts vs actual costs for projects",
    parameters: {
      type: "object",
      properties: {
        project_id: { type: "string", description: "Optional: specific project, otherwise all active projects" },
        category: { type: "string", enum: ["labor", "materials", "equipment", "overhead", "all"], default: "all" },
      },
    },
  },
];

// ============================================
// SEARCH TOOLS
// ============================================

export const searchTools = [
  {
    name: "search_all",
    description: "Search across all entities (projects, invoices, workers, materials, etc.) using natural language",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Natural language search query",
        },
        entity_types: {
          type: "array",
          items: { type: "string" },
          description: "Optional: limit search to specific types (project, invoice, worker, material, vendor, client)",
        },
        limit: { type: "number", default: 20, description: "Max results to return" },
      },
      required: ["query"],
    },
  },
  {
    name: "smart_filter",
    description: "Apply intelligent filtering based on natural language (e.g., 'projects over budget', 'workers with overtime last week')",
    parameters: {
      type: "object",
      properties: {
        filter_description: {
          type: "string",
          description: "Natural language description of what to filter",
        },
      },
      required: ["filter_description"],
    },
  },
];

// ============================================
// SETTINGS TOOLS
// ============================================

export const settingsTools = [
  {
    name: "update_company_info",
    description: "Update company information (name, address, contact details, tax IDs)",
    parameters: {
      type: "object",
      properties: {
        updates: {
          type: "object",
          description: "Company fields to update",
        },
      },
      required: ["updates"],
    },
  },
  {
    name: "update_payment_instructions",
    description: "Update payment instructions shown on invoices (bank details, mobile money, etc.)",
    parameters: {
      type: "object",
      properties: {
        payment_bank_name: { type: "string" },
        payment_account_name: { type: "string" },
        payment_account_number: { type: "string" },
        payment_routing_number: { type: "string" },
        payment_swift_code: { type: "string" },
        payment_mobile_money: { type: "string" },
        payment_instructions: { type: "string" },
        payment_notes: { type: "string" },
      },
    },
  },
  {
    name: "update_nib_settings",
    description: "Update NIB (National Insurance Board) deduction settings for payroll",
    parameters: {
      type: "object",
      properties: {
        employee_rate: { type: "number", description: "Employee NIB rate as decimal (default 0.0465 for 4.65%)" },
        employer_rate: { type: "number", description: "Employer NIB rate as decimal (default 0.0665 for 6.65%)" },
        weekly_cap: { type: "number", description: "Weekly insurable wage cap in BSD (default 550)" },
      },
    },
  },
];

// ============================================
// COMBINED TOOL ARRAY
// ============================================

export const ALL_TOOLS = [
  ...projectTools,
  ...timesheetTools,
  ...workerTools,
  ...invoiceTools,
  ...estimateTools,
  ...materialTools,
  ...payrollTools,
  ...reportTools,
  ...searchTools,
  ...settingsTools,
];
