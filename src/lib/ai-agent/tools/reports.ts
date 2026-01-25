import { SupabaseClient } from "@supabase/supabase-js";

export class ReportTools {
  constructor(private supabase: SupabaseClient, private companyId: string, private userId: string) {}

  async generateProjectReport(params: any) {
    const { data: project } = await this.supabase.from("projects").select("*").eq("id", params.project_id).single();
    if (!project) return { success: false, error: "Project not found" };

    const report: any = { project };

    if (params.include_financials !== false) {
      const { data: timeEntries } = await this.supabase.from("time_entries").select("regular_hours, overtime_hours").eq("project_id", params.project_id);
      const laborHours = timeEntries?.reduce((sum, e) => sum + (e.regular_hours || 0) + (e.overtime_hours || 0), 0) || 0;
      report.labor = { total_hours: laborHours };
    }

    return { success: true, report };
  }

  async generatePayrollReport(params: any) {
    let query = this.supabase.from("time_entries").select("*, workers(first_name, last_name)").eq("company_id", this.companyId).gte("date", params.start_date).lte("date", params.end_date);
    if (params.worker_id) query = query.eq("worker_id", params.worker_id);
    const { data, error } = await query;
    if (error) return { success: false, error: error.message };

    return { success: true, report: { period: { start: params.start_date, end: params.end_date }, entries: data, total_entries: data?.length || 0 } };
  }

  async getOverdueInvoices(params: any) {
    const today = new Date().toISOString().split("T")[0];
    const { data, error } = await this.supabase.from("invoices").select("*").eq("company_id", this.companyId).lt("due_date", today).gt("balance_due", 0).order("due_date");
    if (error) return { success: false, error: error.message };

    const totalOverdue = data?.reduce((sum, inv) => sum + (inv.balance_due || 0), 0) || 0;
    return { success: true, overdue_invoices: data, count: data?.length || 0, total_overdue: `BSD $${totalOverdue.toFixed(2)}` };
  }

  async compareBudgetVsActual(params: any) {
    let query = this.supabase.from("projects").select("id, name, budget").eq("company_id", this.companyId);
    if (params.project_id) query = query.eq("id", params.project_id);
    else query = query.in("status", ["active", "planning"]);

    const { data: projects, error } = await query;
    if (error) return { success: false, error: error.message };

    const comparisons = await Promise.all(projects?.map(async (project) => {
      const { data: timeEntries } = await this.supabase.from("time_entries").select("regular_hours, overtime_hours, workers(hourly_rate, overtime_rate_multiplier)").eq("project_id", project.id);
      const actualCost = timeEntries?.reduce((sum, e: any) => sum + (e.regular_hours || 0) * (e.workers?.hourly_rate || 0) + (e.overtime_hours || 0) * (e.workers?.hourly_rate || 0) * (e.workers?.overtime_rate_multiplier || 1.5), 0) || 0;
      const variance = (project.budget || 0) - actualCost;

      return { project_name: project.name, budget: project.budget, actual_cost: actualCost, variance, status: variance >= 0 ? "Under Budget" : "Over Budget" };
    }) || []);

    return { success: true, comparisons };
  }
}
