import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { openai, OPENAI_MODEL, MAX_DAILY_SEARCHES } from "@/lib/openai";
import { SMART_SEARCH_SYSTEM_PROMPT } from "@/lib/ai-prompts";
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

    // Create authenticated Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify the user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

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

    // Call OpenAI to parse the natural language query
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: SMART_SEARCH_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Parse this natural language query and return the JSON structure: "${query}"`,
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

    // Execute the query against Supabase
    const results = await executeSupabaseQuery(supabase, parsed);

    // Generate natural language summary
    const summary = generateSummary(parsed, results);

    // Transform results to SearchResult format
    const searchResults = transformResults(parsed.intent.entity_type, results);

    const executionTimeMs = Date.now() - startTime;

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

async function executeSupabaseQuery(
  supabase: any,
  parsed: ParsedQuery
): Promise<unknown[]> {
  const { table, select, filters, order, limit } = parsed.supabase_query;

  // Start building the query
  let query = supabase.from(table).select(select || "*");

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
