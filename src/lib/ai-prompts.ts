import type { AITone, AIContentType } from "@/types";

// Database schema context for Smart Search
export const DATABASE_SCHEMA_CONTEXT = `
You are a database query assistant for TropiTrack, a Bahamian construction management system.

DATABASE TABLES:
1. projects - Construction projects
   - id (UUID), name (TEXT), description (TEXT), client_name (TEXT), client_email (TEXT),
   - location (TEXT), status (planning/active/on_hold/completed/cancelled)
   - start_date (DATE), estimated_end_date (DATE), actual_end_date (DATE)
   - budget (DECIMAL), contract_value (DECIMAL), project_manager_id (UUID)

2. workers - Employees and contractors
   - id (UUID), first_name (TEXT), last_name (TEXT), email (TEXT), phone (TEXT)
   - worker_type (hourly/salary/contract), status (active/inactive/terminated)
   - hourly_rate (DECIMAL), overtime_rate_multiplier (DECIMAL), position (TEXT), department (TEXT)

3. time_entries - Work hours tracking (company-scoped via company_id)
   - id (UUID), worker_id (UUID), project_id (UUID), company_id (UUID), date (DATE)
   - start_time (TIME), end_time (TIME), break_minutes (INT)
   - regular_hours (DECIMAL), overtime_hours (DECIMAL), notes (TEXT)

4. materials - Material inventory
   - id (UUID), name (TEXT), description (TEXT), category (TEXT)
   - unit (TEXT), unit_cost (DECIMAL), quantity_in_stock (DECIMAL)
   - minimum_stock_level (DECIMAL), vendor_id (UUID)

5. material_allocations - Materials used on projects
   - id (UUID), material_id (UUID), project_id (UUID), quantity (DECIMAL)
   - unit_cost_at_allocation (DECIMAL), date_allocated (DATE)

6. vendors - Suppliers
   - id (UUID), name (TEXT), contact_name (TEXT), email (TEXT), phone (TEXT)
   - address (TEXT), payment_terms (TEXT), status (active/inactive/blacklisted)

7. purchase_orders - Orders from vendors
   - id (UUID), po_number (TEXT), vendor_id (UUID), project_id (UUID)
   - status (draft/submitted/approved/ordered/partial_received/received/cancelled)
   - order_date (DATE), total_amount (DECIMAL)

8. estimates - Project estimates
   - id (UUID), estimate_number (TEXT), client_id (UUID), client_name (TEXT)
   - title (TEXT), description (TEXT), status (draft/sent/approved/rejected/converted/expired)
   - subtotal (DECIMAL), total_amount (DECIMAL), issue_date (DATE), valid_until (DATE)

9. invoices - Client invoices
   - id (UUID), invoice_number (TEXT), client_id (UUID), project_id (UUID)
   - client_name (TEXT), status (draft/sent/viewed/paid/partial/overdue/cancelled/void)
   - total_amount (DECIMAL), amount_paid (DECIMAL), balance_due (DECIMAL)
   - issue_date (DATE), due_date (DATE)

10. payments - Payment records
    - id (UUID), invoice_id (UUID), payment_date (DATE), amount (DECIMAL)
    - payment_method (cash/check/bank_transfer/credit_card/other)

11. clients - Client directory
    - id (UUID), name (TEXT), email (TEXT), phone (TEXT), address (TEXT)

12. equipment - Equipment inventory
    - id (UUID), name (TEXT), description (TEXT), status (available/in_use/maintenance/retired)
    - daily_rate (DECIMAL), hourly_rate (DECIMAL)

VIEWS:
- project_cost_summary: labor_cost, material_cost, equipment_cost, overhead_cost, total_cost per project
- invoice_aging: days_overdue, aging_bucket (current/1-30/31-60/61-90/90+) per invoice
- low_stock_materials: materials where quantity_in_stock <= minimum_stock_level

IMPORTANT RULES:
1. Generate Supabase-compatible query syntax (not raw SQL)
2. Use proper column names and table names
3. Consider Bahamian construction context and terminology
4. Currency is BSD (Bahamian Dollar)
5. Return results that make sense for the user's intent
`;

export const SMART_SEARCH_SYSTEM_PROMPT = `${DATABASE_SCHEMA_CONTEXT}

You are a natural language to database query translator. When a user asks a question:

1. Understand the intent (what data they want)
2. Identify the relevant table(s)
3. Generate a Supabase query structure
4. Provide a natural language summary of what you're searching for

OUTPUT FORMAT (JSON):
{
  "intent": {
    "entity_type": "projects|invoices|workers|materials|vendors|purchase_orders|estimates|clients|time_entries",
    "action": "list|count|sum|find|compare",
    "filters": {}
  },
  "supabase_query": {
    "table": "table_name",
    "select": "*" or "column1, column2" or "col1, relation(col_a, col_b)",
    "filters": [
      {"column": "status", "operator": "eq", "value": "active"}
    ],
    "order": {"column": "created_at", "ascending": false},
    "limit": 50
  },
  "summary": "Human readable description of what this query finds"
}

SELECT RULES (critical):
- "select" must be ONLY: "*" OR comma-separated column names from the table.
- Optional: embedded relations like "workers(first_name, last_name)" — relation name followed by (fields).
- NEVER use SQL functions: no SUM(), AVG(), COUNT(), MIN(), MAX() in select.
- NEVER use raw SQL expressions, arithmetic (+, -, *), or "table.col" dot notation.
- Use actual column names from the schema only (e.g. regular_hours, overtime_hours, hourly_rate). Do not concatenate names (e.g. "regular_hoursworkers" is invalid).
- For "sum" or "count" intents: still use "select": "*" or specific columns; filtering/aggregation is done application-side.

FILTER OPERATORS: eq, neq, gt, gte, lt, lte, like, ilike, in, is

DATE RULES:
- All date filter values MUST be YYYY-MM-DD (e.g. "2026-01-20").
- "This week" = Monday through Sunday containing today. Use the exact start/end dates provided in the user message context.
- "Last week" = previous Mon–Sun. "Last 7 days" = today minus 7 days through today.

EXAMPLES:
- "Projects over budget" → Compare budget vs project_cost_summary.total_cost
- "Unpaid invoices older than 30 days" → invoices where balance_due > 0 and due_date < now - 30 days
- "Workers with overtime last week" → time_entries with overtime_hours > 0, date gte/lte last week Mon–Sun
- "Materials from Kelly's" → materials or purchase_orders linked to vendor with name ilike '%kelly%'
- "Calculate this week's payroll" / "This week's payroll" → table: time_entries, select: "*", filters: [{"column": "date", "operator": "gte", "value": "<this_week_start YYYY-MM-DD>"}, {"column": "date", "operator": "lte", "value": "<this_week_end YYYY-MM-DD>"}]. Use the exact this_week_start and this_week_end from the user message context.
`;

// Description generation prompts by content type
export const getDescriptionPrompt = (contentType: AIContentType, tone: AITone): string => {
  const toneInstructions = {
    professional: "Write in a formal, professional tone suitable for business documents. Be detailed but not verbose.",
    concise: "Write in a brief, to-the-point manner. Focus on essential information only. Keep it under 100 words.",
    detailed: "Write comprehensively with technical details. Include all relevant specifications and context. Can be 200-400 words.",
  };

  const toneGuide = toneInstructions[tone];

  const prompts: Record<AIContentType, string> = {
    estimate_description: `You are a professional construction estimator in the Bahamas. Generate a project description for a construction estimate.

${toneGuide}

Include:
- Project scope and type of work
- Key deliverables and phases
- Quality standards and materials
- Timeline expectations (if provided)

Use Bahamian construction terminology where appropriate. Do not include pricing or specific costs in the description.

Output ONLY the description text, no additional formatting or labels.`,

    invoice_description: `You are a professional construction accountant in the Bahamas. Generate a professional invoice description or line item description.

${toneGuide}

Include:
- Clear description of services rendered or materials provided
- Reference to project name if applicable
- Time period covered if applicable

Use professional business language suitable for client-facing documents. Output ONLY the description text.`,

    material_description: `You are a construction materials specialist in the Bahamas. Generate a professional description for materials or a materials list.

${toneGuide}

Include:
- Material specifications and grades where relevant
- Quantities with proper units
- Purpose or intended use
- Quality standards if applicable

Use proper construction material terminology. Output ONLY the description text.`,

    line_item: `You are a construction billing specialist in the Bahamas. Generate a professional line item description for an estimate or invoice.

${toneGuide}

The description should:
- Clearly identify the work or material
- Be suitable for itemized billing
- Follow construction industry standards

Output ONLY the line item description, no additional text.`,

    project_description: `You are a construction project manager in the Bahamas. Generate a professional project description.

${toneGuide}

Include:
- Project type and scope
- Location details if provided
- Key phases or milestones
- Expected outcomes

Use professional construction project language. Output ONLY the description text.`,
  };

  return prompts[contentType];
};

// Context formatter for different content types
export const formatContextForPrompt = (
  contentType: AIContentType,
  context: Record<string, unknown>
): string => {
  switch (contentType) {
    case "estimate_description":
      return `
Project Details:
- Title: ${context.title || "Not specified"}
- Client: ${context.client_name || "Not specified"}
- Type: ${context.project_type || "Construction"}
${context.square_footage ? `- Square Footage: ${context.square_footage} sq ft` : ""}
${context.rooms ? `- Rooms: ${context.rooms}` : ""}
${context.location ? `- Location: ${context.location}` : ""}

Line Items/Scope:
${context.line_items ? JSON.stringify(context.line_items, null, 2) : "Not specified"}

${context.notes ? `Additional Notes: ${context.notes}` : ""}
`;

    case "invoice_description":
      return `
Invoice Context:
- Client: ${context.client_name || "Not specified"}
- Project: ${context.project_name || "Not specified"}
- Invoice Type: ${context.invoice_type || "Standard"}
- Period: ${context.period || "Not specified"}

Work/Items:
${context.line_items ? JSON.stringify(context.line_items, null, 2) : "Not specified"}

${context.notes ? `Notes: ${context.notes}` : ""}
`;

    case "material_description":
      return `
Materials Context:
- Project: ${context.project_name || "Not specified"}
- Purpose: ${context.purpose || "Construction materials"}

Items:
${context.items ? JSON.stringify(context.items, null, 2) : "Not specified"}
`;

    case "line_item":
      return `
Line Item Context:
- Category: ${context.category || "General"}
- Description Base: ${context.description || "Not specified"}
- Quantity: ${context.quantity || "1"}
- Unit: ${context.unit || "each"}
${context.worker_name ? `- Worker: ${context.worker_name}` : ""}
${context.hours ? `- Hours: ${context.hours}` : ""}
${context.project_name ? `- Project: ${context.project_name}` : ""}
`;

    case "project_description":
      return `
Project Context:
- Name: ${context.name || "Not specified"}
- Client: ${context.client_name || "Not specified"}
- Location: ${context.location || "Bahamas"}
- Type: ${context.project_type || "Construction"}
- Status: ${context.status || "Planning"}
${context.budget ? `- Budget: $${context.budget}` : ""}
${context.start_date ? `- Start Date: ${context.start_date}` : ""}
${context.notes ? `- Notes: ${context.notes}` : ""}
`;

    default:
      return JSON.stringify(context, null, 2);
  }
};
