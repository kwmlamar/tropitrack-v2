/**
 * TropiTrack AI Agent
 * Autonomous AI agent with full access to TropiTrack functionality
 * Uses OpenAI GPT-4o-mini with function calling
 */

import { createClient } from "@supabase/supabase-js";
import { openai, OPENAI_MODEL } from "@/lib/openai";
import { ALL_TOOLS } from "./tool-definitions";
import { ProjectTools } from "./tools/projects";
import { TimesheetTools } from "./tools/timesheets";
import { WorkerTools } from "./tools/workers";
import { InvoiceTools } from "./tools/invoices";
import { EstimateTools } from "./tools/estimates";
import { MaterialTools } from "./tools/materials";
import { PayrollTools } from "./tools/payroll";
import { ReportTools } from "./tools/reports";
import { SearchTools } from "./tools/search";
import { SettingsTools } from "./tools/settings";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: any[];
  tool_call_id?: string;
}

export class AIAgent {
  private userId: string;
  private companyId: string;
  private conversationId: string;
  private supabase: ReturnType<typeof createClient>;

  // Tool implementations
  private projectTools: ProjectTools;
  private timesheetTools: TimesheetTools;
  private workerTools: WorkerTools;
  private invoiceTools: InvoiceTools;
  private estimateTools: EstimateTools;
  private materialTools: MaterialTools;
  private payrollTools: PayrollTools;
  private reportTools: ReportTools;
  private searchTools: SearchTools;
  private settingsTools: SettingsTools;

  constructor(userId: string, companyId: string, conversationId?: string) {
    this.userId = userId;
    this.companyId = companyId;
    this.conversationId = conversationId || crypto.randomUUID();
    this.supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Initialize tool implementations
    this.projectTools = new ProjectTools(this.supabase, this.companyId, this.userId);
    this.timesheetTools = new TimesheetTools(this.supabase, this.companyId, this.userId);
    this.workerTools = new WorkerTools(this.supabase, this.companyId, this.userId);
    this.invoiceTools = new InvoiceTools(this.supabase, this.companyId, this.userId);
    this.estimateTools = new EstimateTools(this.supabase, this.companyId, this.userId);
    this.materialTools = new MaterialTools(this.supabase, this.companyId, this.userId);
    this.payrollTools = new PayrollTools(this.supabase, this.companyId, this.userId);
    this.reportTools = new ReportTools(this.supabase, this.companyId, this.userId);
    this.searchTools = new SearchTools(this.supabase, this.companyId, this.userId);
    this.settingsTools = new SettingsTools(this.supabase, this.companyId, this.userId);
  }

  /**
   * Main entry point: process a user message and return AI response
   */
  async processMessage(userMessage: string) {
    const startTime = Date.now();

    // Get conversation history
    const history = await this.getConversationHistory();

    // Build messages array
    const messages: Message[] = [
      { role: "system", content: this.getSystemPrompt() },
      ...history,
      { role: "user", content: userMessage },
    ];

    // Save user message
    await this.saveMessage("user", userMessage);

    // Call OpenAI with tools
    let response = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: messages as any,
      tools: ALL_TOOLS.map((tool) => ({
        type: "function",
        function: tool,
      })),
      tool_choice: "auto", // Let AI decide when to use tools
      temperature: 0.7,
      max_tokens: 1000,
    });

    let assistantMessage = response.choices[0].message;
    let allMessages = [...messages, assistantMessage];
    let toolCallCount = 0;

    // Handle tool calls in a loop (agent can make multiple sequential tool calls)
    while (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      // Execute all tool calls from this response
      for (const toolCall of assistantMessage.tool_calls) {
        const fn = (toolCall as { function?: { name: string; arguments: string } }).function;
        if (!fn) continue;
        const functionName = fn.name;
        const functionArgs = JSON.parse(fn.arguments);

        toolCallCount++;

        let functionResult;
        const toolStartTime = Date.now();

        try {
          functionResult = await this.executeTool(functionName, functionArgs);
        } catch (error: any) {
          functionResult = {
            error: error.message || "Tool execution failed",
            success: false,
          };
        }

        const executionTime = Date.now() - toolStartTime;

        // Log the action
        await this.logAction(
          functionName,
          functionArgs,
          functionResult,
          executionTime
        );

        // Add tool result to messages
        allMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(functionResult),
        });
      }

      // Get next response from AI
      response = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        messages: allMessages as any,
        tools: ALL_TOOLS.map((tool) => ({
          type: "function",
          function: tool,
        })),
        tool_choice: "auto",
        temperature: 0.7,
        max_tokens: 1000,
      });

      assistantMessage = response.choices[0].message;
      allMessages.push(assistantMessage);
    }

    // Save assistant's final message
    const finalContent = assistantMessage.content || "";
    await this.saveMessage("assistant", finalContent, assistantMessage.tool_calls);

    // Update usage tracking
    await this.updateUsageTracking(1, toolCallCount, response.usage?.total_tokens || 0);

    const totalTime = Date.now() - startTime;

    return {
      content: finalContent,
      conversationId: this.conversationId,
      toolCallsExecuted: toolCallCount,
      tokensUsed: response.usage?.total_tokens,
      executionTimeMs: totalTime,
    };
  }

  /**
   * Route tool calls to appropriate implementation
   */
  private async executeTool(toolName: string, params: any): Promise<any> {
    // Projects
    if (toolName === "list_projects") return await this.projectTools.listProjects(params);
    if (toolName === "get_project_details") return await this.projectTools.getProjectDetails(params);
    if (toolName === "create_project") return await this.projectTools.createProject(params);
    if (toolName === "update_project") return await this.projectTools.updateProject(params);
    if (toolName === "delete_project") return await this.projectTools.deleteProject(params);
    if (toolName === "get_project_costs") return await this.projectTools.getProjectCosts(params);
    if (toolName === "get_project_profitability") return await this.projectTools.getProjectProfitability(params);

    // Timesheets
    if (toolName === "create_timesheet_entry") return await this.timesheetTools.createTimesheetEntry(params);
    if (toolName === "bulk_create_timesheets") return await this.timesheetTools.bulkCreateTimesheets(params);
    if (toolName === "get_timesheets") return await this.timesheetTools.getTimesheets(params);
    if (toolName === "update_timesheet") return await this.timesheetTools.updateTimesheet(params);
    if (toolName === "delete_timesheet") return await this.timesheetTools.deleteTimesheet(params);

    // Workers
    if (toolName === "list_workers") return await this.workerTools.listWorkers(params);
    if (toolName === "get_worker_details") return await this.workerTools.getWorkerDetails(params);
    if (toolName === "create_worker") return await this.workerTools.createWorker(params);
    if (toolName === "update_worker") return await this.workerTools.updateWorker(params);
    if (toolName === "get_worker_hours") return await this.workerTools.getWorkerHours(params);

    // Invoices
    if (toolName === "list_invoices") return await this.invoiceTools.listInvoices(params);
    if (toolName === "get_invoice_details") return await this.invoiceTools.getInvoiceDetails(params);
    if (toolName === "create_invoice") return await this.invoiceTools.createInvoice(params);
    if (toolName === "update_invoice") return await this.invoiceTools.updateInvoice(params);
    if (toolName === "mark_invoice_paid") return await this.invoiceTools.markInvoicePaid(params);
    if (toolName === "send_invoice") return await this.invoiceTools.sendInvoice(params);
    if (toolName === "generate_invoice_pdf") return await this.invoiceTools.generateInvoicePDF(params);

    // Estimates
    if (toolName === "list_estimates") return await this.estimateTools.listEstimates(params);
    if (toolName === "create_estimate") return await this.estimateTools.createEstimate(params);
    if (toolName === "convert_estimate_to_project") return await this.estimateTools.convertEstimateToProject(params);
    if (toolName === "send_estimate") return await this.estimateTools.sendEstimate(params);

    // Materials
    if (toolName === "list_materials") return await this.materialTools.listMaterials(params);
    if (toolName === "create_purchase_order") return await this.materialTools.createPurchaseOrder(params);
    if (toolName === "allocate_materials_to_project") return await this.materialTools.allocateMaterialsToProject(params);

    // Payroll
    if (toolName === "calculate_payroll") return await this.payrollTools.calculatePayroll(params);
    if (toolName === "get_nib_summary") return await this.payrollTools.getNIBSummary(params);
    if (toolName === "get_financial_summary") return await this.payrollTools.getFinancialSummary(params);

    // Reports
    if (toolName === "generate_project_report") return await this.reportTools.generateProjectReport(params);
    if (toolName === "generate_payroll_report") return await this.reportTools.generatePayrollReport(params);
    if (toolName === "get_overdue_invoices") return await this.reportTools.getOverdueInvoices(params);
    if (toolName === "compare_budget_vs_actual") return await this.reportTools.compareBudgetVsActual(params);

    // Search
    if (toolName === "search_all") return await this.searchTools.searchAll(params);
    if (toolName === "smart_filter") return await this.searchTools.smartFilter(params);

    // Settings
    if (toolName === "update_company_info") return await this.settingsTools.updateCompanyInfo(params);
    if (toolName === "update_payment_instructions") return await this.settingsTools.updatePaymentInstructions(params);
    if (toolName === "update_nib_settings") return await this.settingsTools.updateNIBSettings(params);

    throw new Error(`Unknown tool: ${toolName}`);
  }

  /**
   * System prompt that defines the AI agent's role and capabilities
   */
  private getSystemPrompt(): string {
    const today = new Date().toISOString().split("T")[0];
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Start of this week (Sunday)
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6); // End of this week (Saturday)

    return `You are an AUTONOMOUS AI assistant for TropiTrack with FULL SYSTEM ACCESS. You MUST use your available tools to take actions - do NOT just give instructions.

CRITICAL: When a user asks you to do something, USE YOUR TOOLS to do it. Don't just explain how to do it.

TOOL SELECTION (VERY IMPORTANT):
- "calculate payroll" or "payroll for [period]" → USE calculate_payroll (NOT search_all!)
- "NIB summary" or "NIB deductions" → USE get_nib_summary (NOT search_all!)
- "financial summary" or "revenue and costs" → USE get_financial_summary (NOT search_all!)
- "overdue invoices" → USE get_overdue_invoices (NOT search_all!)
- "budget vs actual" or "over budget" → USE compare_budget_vs_actual (NOT search_all!)
- "list [entity]" or "show [entity]" → USE list_* tool (e.g., list_projects, list_workers)
- "find [something]" or "search for [query]" → USE search_all for complex natural language searches
- "create [entity]" → USE create_* tool
- "update [entity]" → USE update_* tool
- "delete [entity]" → USE delete_* tool (ask confirmation first!)

Available Tools:
- Projects: list_projects, get_project_details, create_project, update_project, delete_project, get_project_costs, get_project_profitability
- Timesheets: create_timesheet_entry, bulk_create_timesheets, get_timesheets, update_timesheet, delete_timesheet
- Workers: list_workers, get_worker_details, create_worker, update_worker, get_worker_hours
- Invoices: list_invoices, get_invoice_details, create_invoice, update_invoice, mark_invoice_paid, send_invoice, generate_invoice_pdf
- Estimates: list_estimates, create_estimate, convert_estimate_to_project, send_estimate
- Materials: list_materials, create_purchase_order, allocate_materials_to_project
- Payroll: calculate_payroll, get_nib_summary, get_financial_summary
- Reports: generate_project_report, generate_payroll_report, get_overdue_invoices, compare_budget_vs_actual
- Search: search_all, smart_filter
- Settings: update_company_info, update_payment_instructions, update_nib_settings

Current context:
- User ID: ${this.userId}
- Company ID: ${this.companyId}
- Today: ${today}
- This Week: ${weekStart.toISOString().split("T")[0]} to ${weekEnd.toISOString().split("T")[0]}
- Currency: BSD (Bahamian Dollar)

IMPORTANT GUIDELINES:
1. **TAKE ACTION**: Use tools to execute user requests, don't just explain
2. **Confirmations for Destructive Actions**: Ask before deleting anything
3. **Date Ranges**:
   - "this week" = ${weekStart.toISOString().split("T")[0]} to ${weekEnd.toISOString().split("T")[0]}
   - "last week" = subtract 7 days from those dates
4. **NIB**: Employee 4.65%, Employer 6.65%, Weekly cap BSD $550
5. **Overtime**: 1.5x rate after 8 hours/day
6. **Be Direct**: Show results, not instructions
7. **Format Money**: BSD $X,XXX.XX

When you complete actions, show the results clearly.`;
  }

  /**
   * Get conversation history from database
   */
  private async getConversationHistory(): Promise<Message[]> {
    const { data } = await this.supabase
      .from("ai_messages")
      .select("role, content, tool_calls")
      .eq("conversation_id", this.conversationId)
      .order("created_at", { ascending: true })
      .limit(20); // Keep last 20 messages for context

    if (!data) return [];

    return (data as Array<{ role: string; content: string; tool_calls?: any }>).map((msg) => ({
      role: msg.role as any,
      content: msg.content,
      tool_calls: msg.tool_calls,
    }));
  }

  /**
   * Save a message to the conversation
   */
  private async saveMessage(role: string, content: string, toolCalls?: any[]) {
    await (this.supabase.from("ai_messages") as any).insert({
      conversation_id: this.conversationId,
      role,
      content,
      tool_calls: toolCalls,
    });
  }

  /**
   * Log an action to the audit trail
   */
  private async logAction(
    actionType: string,
    actionData: any,
    resultData: any,
    executionTimeMs: number
  ) {
    const category = this.getActionCategory(actionType);

    await (this.supabase.from("ai_actions") as any).insert({
      user_id: this.userId,
      conversation_id: this.conversationId,
      company_id: this.companyId,
      action_type: actionType,
      action_category: category,
      action_data: actionData,
      result_data: resultData,
      success: !resultData.error,
      error_message: resultData.error || null,
      execution_time_ms: executionTimeMs,
    });
  }

  /**
   * Categorize action for audit logging
   */
  private getActionCategory(actionType: string): string {
    if (actionType.includes("project")) return "projects";
    if (actionType.includes("timesheet") || actionType.includes("time_entry")) return "timesheets";
    if (actionType.includes("worker")) return "workers";
    if (actionType.includes("invoice")) return "invoices";
    if (actionType.includes("estimate")) return "estimates";
    if (actionType.includes("material") || actionType.includes("purchase")) return "materials";
    if (actionType.includes("payroll") || actionType.includes("nib")) return "payroll";
    if (actionType.includes("report")) return "reports";
    if (actionType.includes("search")) return "search";
    if (actionType.includes("company") || actionType.includes("payment") || actionType.includes("settings")) return "settings";
    return "other";
  }

  /**
   * Update usage tracking for rate limiting
   */
  private async updateUsageTracking(messages: number, toolCalls: number, tokens: number) {
    await (this.supabase.rpc as any)("increment_ai_usage", {
      p_user_id: this.userId,
      p_company_id: this.companyId,
      p_messages: messages,
      p_tool_calls: toolCalls,
      p_tokens: tokens,
    });
  }

  /**
   * Check if user is within rate limits
   */
  static async checkRateLimit(userId: string, maxMessagesPerDay: number = 200): Promise<boolean> {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data } = await supabase.rpc("check_ai_rate_limit", {
      p_user_id: userId,
      p_max_messages_per_day: maxMessagesPerDay,
    });

    return data === true;
  }
}
