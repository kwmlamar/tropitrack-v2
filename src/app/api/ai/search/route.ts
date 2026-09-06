import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { openai, OPENAI_MODEL, MAX_DAILY_SEARCHES } from "@/lib/openai";
import { SMART_SEARCH_SYSTEM_PROMPT } from "@/lib/ai-prompts";
import { sanitizeSupabaseSelect } from "@/lib/utils";
import type { SearchResult, SmartSearchResponse } from "@/types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface ParsedQuery {
  intent: {
    entity_type: string;
    action: string;
    filters: Record<string, unknown>;
  };
  supabase_query: {
    table: string;
    select: string;
    filters: Array<{ column: string; operator: string; value: unknown }>;
    order?: { column: string; ascending: boolean };
    limit?: number;
  };
  summary: string;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Get auth token from request
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");

    // Admin client: auth.getUser, the rate-limit RPC and search history only.
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // User-scoped client: everything the MODEL chose runs through this, so RLS
    // applies as the caller. Nothing a language model picks touches the
    // service-role client.
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const userSupabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Verify the user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Get user's company for scoping queries
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", user.id)
      .single();

    const companyId = profile?.company_id ?? null;

    // Check rate limit
    const { data: searchCount } = await supabase.rpc("increment_search_count", {
      p_user_id: user.id,
    });

    if (searchCount && searchCount > MAX_DAILY_SEARCHES) {
      return NextResponse.json(
        {
          success: false,
          error: `Daily search limit reached (${MAX_DAILY_SEARCHES}). Try again tomorrow.`,
          query: "",
          summary: "",
          results: [],
          resultCount: 0,
          executionTimeMs: Date.now() - startTime,
        } as SmartSearchResponse,
        { status: 429 }
      );
    }

    const { query } = await request.json();

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { error: "Query is required" },
        { status: 400 }
      );
    }

    // Compute today and this week (Mon–Sun) for relative-date queries (use local date)
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const d = now.getDate();
    const today = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const day = now.getDay();
    const monOffset = day === 0 ? -6 : 1 - day;
    const mon = new Date(y, m, d + monOffset);
    const sun = new Date(mon);
    sun.setDate(sun.getDate() + 6);
    const thisWeekStart = `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, "0")}-${String(mon.getDate()).padStart(2, "0")}`;
    const thisWeekEnd = `${sun.getFullYear()}-${String(sun.getMonth() + 1).padStart(2, "0")}-${String(sun.getDate()).padStart(2, "0")}`;

    const dateContext = `Today is ${today}. This week (Mon–Sun) is ${thisWeekStart} to ${thisWeekEnd}.`;

    // Call OpenAI to parse the natural language query
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: SMART_SEARCH_SYSTEM_PROMPT },
        {
          role: "user",
          content: `${dateContext}\n\nParse this natural language query and return the JSON structure: "${query}"`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 1000,
    });

    const responseText = completion.choices[0]?.message?.content;
    if (!responseText) {
      throw new Error("No response from AI");
    }

    const parsed: ParsedQuery = JSON.parse(responseText);

    // Fallback: "calculate this week's payroll" / "this week's payroll" → query time_entries with this week's date range
    const q = query.toLowerCase();
    const isPayrollThisWeek = q.includes("this week") && q.includes("payroll");
    if (isPayrollThisWeek) {
      if (!parsed.supabase_query) parsed.supabase_query = { table: "time_entries", select: "*", filters: [] };
      parsed.supabase_query.table = "time_entries";
      parsed.supabase_query.select =
        "*, workers(first_name, last_name, hourly_rate, overtime_rate_multiplier)";
      if (!parsed.intent) parsed.intent = { entity_type: "time_entries", action: "list", filters: {} };
      parsed.intent.entity_type = "time_entries";
      const filters = parsed.supabase_query.filters ?? [];
      parsed.supabase_query.filters = filters;
      const hasDateFilter = filters.some((f: { column: string }) => f.column === "date");
      if (!hasDateFilter) {
        filters.push(
          { column: "date", operator: "gte", value: thisWeekStart },
          { column: "date", operator: "lte", value: thisWeekEnd }
        );
      }
    }

    // Execute the query against Supabase (with company scoping when available)
    const results = await executeSupabaseQuery(userSupabase, parsed, companyId);

    const executionTimeMs = Date.now() - startTime;

    let summary: string;
    let searchResults: SearchResult[];

    if (isPayrollThisWeek) {
      const payroll = computePayrollSummary(results as PayrollEntry[]);
      summary =
        payroll.workerCount === 0
          ? `No time entries this week. View payroll to add or adjust entries.`
          : `This week: ${payroll.totalHours.toFixed(1)} hours, BSD $${payroll.totalGross.toFixed(2)} gross across ${payroll.workerCount} worker${payroll.workerCount === 1 ? "" : "s"}. View full payroll →`;
      searchResults = [
        {
          id: "payroll-this-week",
          type: "payroll",
          title: "Payroll – This week",
          subtitle:
            payroll.workerCount === 0
              ? "0 hrs · BSD $0"
              : `${payroll.totalHours.toFixed(1)} hrs · BSD $${payroll.totalGross.toLocaleString()} gross`,
          url: "/payroll",
          metadata: payroll,
        },
      ];
    } else {
      summary = generateSummary(parsed, results);
      searchResults = transformResults(parsed.intent.entity_type, results);
    }

    // Save search to history
    await supabase.from("search_queries").insert({
      user_id: user.id,
      query_text: query,
      parsed_intent: parsed.intent,
      generated_sql: JSON.stringify(parsed.supabase_query),
      results_count: searchResults.length,
      successful: true,
      execution_time_ms: executionTimeMs,
    });

    const response: SmartSearchResponse = {
      success: true,
      query,
      summary,
      results: searchResults,
      resultCount: searchResults.length,
      executionTimeMs,
    };

    return NextResponse.json(response);
  } catch (error: unknown) {
    console.error("Smart search error:", error);

    const errorMessage =
      error instanceof Error ? error.message : "Search failed";

    return NextResponse.json(
      {
        success: false,
        query: "",
        summary: "",
        results: [],
        resultCount: 0,
        executionTimeMs: Date.now() - startTime,
        error: errorMessage,
      } as SmartSearchResponse,
      { status: 500 }
    );
  }
}

/**
 * The ONLY tables a model-chosen query may touch.
 *
 * This used to be a "which tables get company scoping" list, applied over a
 * service-role client. Anything outside it — payroll_entries, receipts,
 * profiles, companies, all named in the schema prompt the model was given —
 * ran unscoped with RLS off. ODS is effectively the only tenant today, so it
 * was latent rather than exploited, but it was a hole.
 *
 * Two changes close it. The query now runs on the caller's own client, so RLS
 * applies whatever the model picks; and a table outside this list is REJECTED
 * rather than quietly run without a company filter.
 */
const ALLOWED_TABLES = new Set([
  "time_entries",
  "workers",
  "projects",
  "invoices",
  "estimates",
  "materials",
  "clients",
  "vendors",
]);

/** Of the allowlist, those carrying company_id get an explicit filter on top of RLS. */
const TABLES_WITH_COMPANY_ID = new Set([
  "time_entries",
  "workers",
  "projects",
  "invoices",
  "estimates",
  "materials",
  "clients",
  "vendors",
]);

async function executeSupabaseQuery(
  supabase: any,
  parsed: ParsedQuery,
  companyId: string | null
): Promise<unknown[]> {
  const { table, select, filters, order, limit } = parsed.supabase_query;

  // Refuse rather than un-scope. A model that picks payroll_entries gets an
  // error, not a query that happens to run without a company filter.
  if (!ALLOWED_TABLES.has(table)) {
    throw new Error(
      `Search cannot read "${table}". Ask the assistant instead — it has audited tools for payroll, receipts and time.`
    );
  }

  const safeSelect = sanitizeSupabaseSelect(select);

  let query = supabase.from(table).select(safeSelect);

  // Belt and braces: RLS already scopes this client to the caller's company,
  // and this filter states the same intent in the query.
  if (companyId && TABLES_WITH_COMPANY_ID.has(table)) {
    query = query.eq("company_id", companyId);
  }

  // Apply filters
  for (const filter of filters || []) {
    const { column, operator, value } = filter;

    switch (operator) {
      case "eq":
        query = query.eq(column, value);
        break;
      case "neq":
        query = query.neq(column, value);
        break;
      case "gt":
        query = query.gt(column, value);
        break;
      case "gte":
        query = query.gte(column, value);
        break;
      case "lt":
        query = query.lt(column, value);
        break;
      case "lte":
        query = query.lte(column, value);
        break;
      case "like":
        query = query.like(column, value as string);
        break;
      case "ilike":
        query = query.ilike(column, value as string);
        break;
      case "in":
        query = query.in(column, value as unknown[]);
        break;
      case "is":
        query = query.is(column, value);
        break;
      default:
        break;
    }
  }

  // Apply ordering
  if (order) {
    query = query.order(order.column, { ascending: order.ascending });
  }

  // Apply limit
  query = query.limit(limit || 50);

  const { data, error } = await query;

  if (error) {
    console.error("Supabase query error:", error);
    throw new Error(`Database query failed: ${error.message}`);
  }

  return data || [];
}

type PayrollEntry = {
  worker_id: string;
  regular_hours: number | string;
  overtime_hours: number | string;
  workers?: {
    first_name?: string;
    last_name?: string;
    hourly_rate?: number | string;
    overtime_rate_multiplier?: number | string;
  } | null;
};

function computePayrollSummary(entries: PayrollEntry[]): {
  totalHours: number;
  totalGross: number;
  workerCount: number;
  byWorker: Array<{ name: string; hours: number; gross: number }>;
} {
  const byWorker: Record<
    string,
    { reg: number; ot: number; rate: number; mult: number; name: string }
  > = {};

  for (const e of entries) {
    const reg = Number(e.regular_hours) || 0;
    const ot = Number(e.overtime_hours) || 0;
    const rate = Number(e.workers?.hourly_rate) || 0;
    const mult = Number(e.workers?.overtime_rate_multiplier) || 1.5;
    const name = [e.workers?.first_name, e.workers?.last_name].filter(Boolean).join(" ") || "Unknown";

    if (!byWorker[e.worker_id]) {
      byWorker[e.worker_id] = { reg: 0, ot: 0, rate, mult, name };
    }
    byWorker[e.worker_id].reg += reg;
    byWorker[e.worker_id].ot += ot;
  }

  let totalHours = 0;
  let totalGross = 0;
  const list: Array<{ name: string; hours: number; gross: number }> = [];

  for (const w of Object.values(byWorker)) {
    const hours = w.reg + w.ot;
    const gross = w.reg * w.rate + w.ot * w.rate * w.mult;
    totalHours += hours;
    totalGross += gross;
    list.push({ name: w.name, hours, gross });
  }

  return { totalHours, totalGross, workerCount: list.length, byWorker: list };
}

function generateSummary(parsed: ParsedQuery, results: unknown[]): string {
  const count = results.length;
  const entityType = parsed.intent.entity_type;

  if (count === 0) {
    return `No ${entityType} found matching your search.`;
  }

  // Use the AI-generated summary as base
  let summary = parsed.summary || `Found ${count} ${entityType}.`;

  // Add specific details based on results
  if (entityType === "projects" && count > 0) {
    const projects = results as Array<{ name: string; status: string }>;
    const names = projects.slice(0, 3).map((p) => p.name);
    summary = `Found ${count} project${count > 1 ? "s" : ""}: ${names.join(", ")}${count > 3 ? ` and ${count - 3} more` : ""}.`;
  } else if (entityType === "invoices" && count > 0) {
    const invoices = results as Array<{
      invoice_number: string;
      balance_due: number;
    }>;
    const totalDue = invoices.reduce((sum, inv) => sum + (inv.balance_due || 0), 0);
    summary = `Found ${count} invoice${count > 1 ? "s" : ""} with BSD ${totalDue.toLocaleString()} total outstanding.`;
  } else if (entityType === "workers" && count > 0) {
    const workers = results as Array<{
      first_name: string;
      last_name: string;
    }>;
    const names = workers.slice(0, 3).map((w) => `${w.first_name} ${w.last_name}`);
    summary = `Found ${count} worker${count > 1 ? "s" : ""}: ${names.join(", ")}${count > 3 ? ` and ${count - 3} more` : ""}.`;
  } else if (entityType === "time_entries" && count > 0) {
    const entries = results as Array<{ regular_hours?: number; overtime_hours?: number }>;
    const totalHours = entries.reduce(
      (sum, e) => sum + (Number(e.regular_hours) || 0) + (Number(e.overtime_hours) || 0),
      0
    );
    summary = `Found ${count} time entr${count === 1 ? "y" : "ies"} totaling ${totalHours.toFixed(1)} hours.`;
  }

  return summary;
}

function transformResults(
  entityType: string,
  results: unknown[]
): SearchResult[] {
  const urlMap: Record<string, string> = {
    projects: "/projects",
    invoices: "/invoices",
    estimates: "/estimates",
    workers: "/workers",
    materials: "/materials",
    vendors: "/vendors",
    purchase_orders: "/vendors",
    clients: "/clients",
    time_entries: "/time-tracking",
  };

  const baseUrl = urlMap[entityType] || "/dashboard";

  return results.slice(0, 20).map((item: unknown) => {
    const record = item as Record<string, unknown>;
    const id = record.id as string;

    let title = "";
    let subtitle = "";

    switch (entityType) {
      case "projects":
        title = record.name as string;
        subtitle = `${record.client_name} • ${record.status}`;
        break;
      case "invoices":
        title = `Invoice ${record.invoice_number}`;
        subtitle = `${record.client_name} • BSD ${(record.balance_due as number)?.toLocaleString()}`;
        break;
      case "estimates":
        title = `Estimate ${record.estimate_number}`;
        subtitle = `${record.client_name} • ${record.status}`;
        break;
      case "workers":
        title = `${record.first_name} ${record.last_name}`;
        subtitle = `${record.position || record.worker_type} • ${record.status}`;
        break;
      case "materials":
        title = record.name as string;
        subtitle = `Stock: ${record.quantity_in_stock} ${record.unit}`;
        break;
      case "vendors":
        title = record.name as string;
        subtitle = record.contact_name as string || record.phone as string || "";
        break;
      case "clients":
        title = record.name as string;
        subtitle = record.email as string || record.phone as string || "";
        break;
      case "time_entries":
        title = `Time entry ${new Date(record.date as string).toLocaleDateString()}`;
        subtitle = `${(Number(record.regular_hours) || 0) + (Number(record.overtime_hours) || 0)} hrs`;
        break;
      default:
        title = (record.name as string) || (record.id as string);
        subtitle = "";
    }

    return {
      id,
      type: entityType as SearchResult["type"],
      title,
      subtitle,
      url: `${baseUrl}/${id}`,
      metadata: record,
    };
  });
}
