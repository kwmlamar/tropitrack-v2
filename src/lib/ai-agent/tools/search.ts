/**
 * Search Tools for AI Agent
 * Uses the same smart search functionality as the Command K search bar
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { openai, OPENAI_MODEL } from "@/lib/openai";
import { SMART_SEARCH_SYSTEM_PROMPT } from "@/lib/ai-prompts";
import { sanitizeSupabaseSelect } from "@/lib/utils";
import type { SearchResult } from "@/types";

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

export class SearchTools {
  constructor(
    private supabase: SupabaseClient,
    private companyId: string,
    private userId: string
  ) {}

  /**
   * Smart search using natural language - same as Command K
   * Calls OpenAI to parse query, then executes against Supabase
   */
  async searchAll(params: any) {
    try {
      const query = params.query;

      // Call OpenAI to parse the natural language query (same as Command K search)
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

      // Filter by entity types if specified
      if (params.entity_types && params.entity_types.length > 0) {
        if (!params.entity_types.includes(parsed.intent.entity_type)) {
          return {
            success: true,
            results: [],
            count: 0,
            message: `No results found for "${query}" in the specified entity types`,
            summary: `Searching for ${params.entity_types.join(", ")} but query matched ${parsed.intent.entity_type}`,
          };
        }
      }

      // Execute the query against Supabase
      const results = await this.executeSupabaseQuery(parsed);

      // Generate natural language summary
      const summary = this.generateSummary(parsed, results);

      // Transform results to SearchResult format
      const searchResults = this.transformResults(parsed.intent.entity_type, results);

      // Apply limit if specified
      const limitedResults = params.limit
        ? searchResults.slice(0, params.limit)
        : searchResults;

      return {
        success: true,
        query,
        intent: parsed.intent,
        results: limitedResults,
        count: limitedResults.length,
        total_found: searchResults.length,
        summary,
        message: `${summary}`,
      };
    } catch (error: any) {
      console.error("Smart search error:", error);
      return {
        success: false,
        error: error.message || "Search failed",
        results: [],
        count: 0,
      };
    }
  }

  /**
   * Smart filter - same as searchAll but optimized for filtering
   */
  async smartFilter(params: any) {
    // Use the same smart search functionality
    return await this.searchAll({
      query: params.filter_description,
      limit: 50,
    });
  }

  /**
   * Execute Supabase query - same logic as Command K search
   */
  private async executeSupabaseQuery(parsed: ParsedQuery): Promise<unknown[]> {
    const { table, select, filters, order, limit } = parsed.supabase_query;
    const safeSelect = sanitizeSupabaseSelect(select);

    // Start building the query
    let query = this.supabase.from(table).select(safeSelect);

    // IMPORTANT: Always filter by company_id for security
    query = query.eq("company_id", this.companyId);

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

  /**
   * Generate natural language summary - same as Command K search
   */
  private generateSummary(parsed: ParsedQuery, results: unknown[]): string {
    const count = results.length;
    const entityType = parsed.intent.entity_type;

    if (count === 0) {
      return `No ${entityType} found matching your search.`;
    }

    // Use the AI-generated summary as base
    let summary = parsed.summary || `Found ${count} ${entityType}.`;

    // Add specific details based on results
    if (entityType === "projects" && count > 0) {
      const projects = results as Array<{ name: string; status: string; budget?: number }>;
      const names = projects.slice(0, 3).map((p) => p.name);
      const totalBudget = projects.reduce((sum, p) => sum + (p.budget || 0), 0);
      summary = `Found ${count} project${count > 1 ? "s" : ""}: ${names.join(", ")}${count > 3 ? ` and ${count - 3} more` : ""}. Total budget: BSD $${totalBudget.toLocaleString()}.`;
    } else if (entityType === "invoices" && count > 0) {
      const invoices = results as Array<{
        invoice_number: string;
        balance_due: number;
      }>;
      const totalDue = invoices.reduce((sum, inv) => sum + (inv.balance_due || 0), 0);
      summary = `Found ${count} invoice${count > 1 ? "s" : ""} with BSD $${totalDue.toLocaleString()} total outstanding.`;
    } else if (entityType === "workers" && count > 0) {
      const workers = results as Array<{
        first_name: string;
        last_name: string;
        status?: string;
      }>;
      const names = workers.slice(0, 3).map((w) => `${w.first_name} ${w.last_name}`);
      const active = workers.filter((w) => w.status === "active").length;
      summary = `Found ${count} worker${count > 1 ? "s" : ""} (${active} active): ${names.join(", ")}${count > 3 ? ` and ${count - 3} more` : ""}.`;
    } else if (entityType === "time_entries" && count > 0) {
      const entries = results as Array<{ regular_hours?: number; overtime_hours?: number }>;
      const totalHours = entries.reduce((sum, e) => sum + (e.regular_hours || 0) + (e.overtime_hours || 0), 0);
      summary = `Found ${count} time entr${count === 1 ? "y" : "ies"} totaling ${totalHours.toFixed(1)} hours.`;
    } else if (entityType === "materials" && count > 0) {
      const materials = results as Array<{ quantity_in_stock?: number; minimum_stock_level?: number }>;
      const lowStock = materials.filter((m) => (m.quantity_in_stock || 0) <= (m.minimum_stock_level || 0)).length;
      summary = `Found ${count} material${count > 1 ? "s" : ""}${lowStock > 0 ? `, ${lowStock} low on stock` : ""}.`;
    }

    return summary;
  }

  /**
   * Transform results to SearchResult format - same as Command K search
   */
  private transformResults(entityType: string, results: unknown[]): SearchResult[] {
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

    return results.map((item: unknown) => {
      const record = item as Record<string, unknown>;
      const id = record.id as string;

      let title = "";
      let subtitle = "";

      switch (entityType) {
        case "projects":
          title = record.name as string;
          subtitle = `${record.client_name} • ${record.status} • BSD $${(record.budget as number)?.toLocaleString()}`;
          break;
        case "invoices":
          title = `Invoice ${record.invoice_number}`;
          subtitle = `${record.client_name} • ${record.status} • Balance: BSD $${(record.balance_due as number)?.toLocaleString()}`;
          break;
        case "estimates":
          title = `Estimate ${record.estimate_number}`;
          subtitle = `${record.client_name} • ${record.status} • BSD $${(record.total_amount as number)?.toLocaleString()}`;
          break;
        case "workers":
          title = `${record.first_name} ${record.last_name}`;
          subtitle = `${record.worker_type} • ${record.status} • $${record.hourly_rate}/hr`;
          break;
        case "materials":
          title = record.name as string;
          subtitle = `Stock: ${record.quantity_in_stock} ${record.unit} • $${(record.unit_cost as number)?.toFixed(2)}/${record.unit}`;
          break;
        case "vendors":
          title = record.name as string;
          subtitle = (record.contact_name as string) || (record.phone as string) || "";
          break;
        case "clients":
          title = record.name as string;
          subtitle = (record.email as string) || (record.phone as string) || "";
          break;
        case "time_entries":
          title = `Time Entry ${new Date(record.date as string).toLocaleDateString()}`;
          subtitle = `${(Number(record.regular_hours) || 0) + (Number(record.overtime_hours) || 0)} hours`;
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
}
