/**
 * Project Tools for AI Agent
 * Implements all project-related operations
 */

import { SupabaseClient } from "@supabase/supabase-js";

export class ProjectTools {
  constructor(
    private supabase: SupabaseClient,
    private companyId: string,
    private userId: string
  ) {}

  async listProjects(params: any) {
    let query = this.supabase
      .from("projects")
      .select("*")
      .eq("company_id", this.companyId);

    // Apply filters
    if (params.status && params.status !== "all") {
      query = query.eq("status", params.status);
    }

    if (params.start_date) {
      query = query.gte("start_date", params.start_date);
    }

    if (params.end_date) {
      query = query.lte("estimated_end_date", params.end_date);
    }

    if (params.min_budget) {
      query = query.gte("budget", params.min_budget);
    }

    if (params.max_budget) {
      query = query.lte("budget", params.max_budget);
    }

    const { data, error } = await query.order("created_at", { ascending: false });

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      projects: data,
      count: data.length,
      summary: `Found ${data.length} projects`,
    };
  }

  async getProjectDetails(params: any) {
    const { data: project, error } = await this.supabase
      .from("projects")
      .select("*")
      .eq("id", params.project_id)
      .eq("company_id", this.companyId)
      .single();

    if (error || !project) {
      return { success: false, error: "Project not found" };
    }

    // Get associated data
    const [timeEntriesRes, materialsRes, clientRes] = await Promise.all([
      this.supabase
        .from("time_entries")
        .select("*, workers(first_name, last_name)")
        .eq("project_id", params.project_id)
        .limit(10),
      this.supabase
        .from("material_allocations")
        .select("*, materials(name, unit)")
        .eq("project_id", params.project_id)
        .limit(10),
      project.client_id
        ? this.supabase
            .from("clients")
            .select("*")
            .eq("id", project.client_id)
            .single()
        : Promise.resolve({ data: null }),
    ]);

    return {
      success: true,
      project: {
        ...project,
        client: clientRes.data,
      },
      recent_time_entries: timeEntriesRes.data || [],
      recent_material_allocations: materialsRes.data || [],
    };
  }

  async createProject(params: any) {
    const projectData: any = {
      company_id: this.companyId,
      created_by: this.userId,
      name: params.name,
      description: params.description,
      location: params.location,
      status: params.status,
      start_date: params.start_date,
      estimated_end_date: params.estimated_end_date,
      budget: params.budget,
      contract_value: params.contract_value,
      project_manager_id: params.project_manager_id,
    };

    // Handle client linkage
    if (params.client_id) {
      projectData.client_id = params.client_id;
    } else {
      projectData.client_name = params.client_name;
      projectData.client_email = params.client_email;
      projectData.client_phone = params.client_phone;
    }

    const { data, error } = await this.supabase
      .from("projects")
      .insert(projectData)
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      project: data,
      message: `Project "${data.name}" created successfully`,
    };
  }

  async updateProject(params: any) {
    const { data, error } = await this.supabase
      .from("projects")
      .update(params.updates)
      .eq("id", params.project_id)
      .eq("company_id", this.companyId)
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      project: data,
      message: `Project updated successfully`,
    };
  }

  async deleteProject(params: any) {
    const { error } = await this.supabase
      .from("projects")
      .delete()
      .eq("id", params.project_id)
      .eq("company_id", this.companyId);

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      message: `Project deleted successfully`,
    };
  }

  async getProjectCosts(params: any) {
    // Get labor costs
    const { data: timeEntries } = await this.supabase
      .from("time_entries")
      .select("regular_hours, overtime_hours, workers(hourly_rate, overtime_rate_multiplier)")
      .eq("project_id", params.project_id);

    let laborCost = 0;
    if (timeEntries) {
      laborCost = timeEntries.reduce((total, entry: any) => {
        const regularPay = entry.regular_hours * (entry.workers?.hourly_rate || 0);
        const overtimePay =
          entry.overtime_hours *
          (entry.workers?.hourly_rate || 0) *
          (entry.workers?.overtime_rate_multiplier || 1.5);
        return total + regularPay + overtimePay;
      }, 0);
    }

    // Get material costs
    const { data: materialAllocations } = await this.supabase
      .from("material_allocations")
      .select("quantity, materials(unit_cost)")
      .eq("project_id", params.project_id);

    let materialCost = 0;
    if (materialAllocations) {
      materialCost = materialAllocations.reduce((total, alloc: any) => {
        return total + alloc.quantity * (alloc.materials?.unit_cost || 0);
      }, 0);
    }

    // Get equipment costs (if available)
    const { data: equipmentUsage } = await this.supabase
      .from("equipment_usage")
      .select("cost")
      .eq("project_id", params.project_id);

    let equipmentCost = 0;
    if (equipmentUsage) {
      equipmentCost = equipmentUsage.reduce((total: number, usage: any) => total + (usage.cost || 0), 0);
    }

    // Get overhead costs (if available)
    const { data: overheadCosts } = await this.supabase
      .from("overhead_costs")
      .select("amount")
      .eq("project_id", params.project_id);

    let overheadCost = 0;
    if (overheadCosts) {
      overheadCost = overheadCosts.reduce((total: number, cost: any) => total + (cost.amount || 0), 0);
    }

    const totalCost = laborCost + materialCost + equipmentCost + overheadCost;

    return {
      success: true,
      project_id: params.project_id,
      costs: {
        labor: laborCost,
        materials: materialCost,
        equipment: equipmentCost,
        overhead: overheadCost,
        total: totalCost,
      },
      formatted: {
        labor: `BSD $${laborCost.toFixed(2)}`,
        materials: `BSD $${materialCost.toFixed(2)}`,
        equipment: `BSD $${equipmentCost.toFixed(2)}`,
        overhead: `BSD $${overheadCost.toFixed(2)}`,
        total: `BSD $${totalCost.toFixed(2)}`,
      },
    };
  }

  async getProjectProfitability(params: any) {
    // Get project
    const { data: project } = await this.supabase
      .from("projects")
      .select("budget, contract_value")
      .eq("id", params.project_id)
      .eq("company_id", this.companyId)
      .single();

    if (!project) {
      return { success: false, error: "Project not found" };
    }

    // Get costs
    const costsResult = await this.getProjectCosts(params);
    if (!costsResult.success) {
      return costsResult;
    }

    const totalCost = costsResult.costs.total;
    const contractValue = project.contract_value || 0;
    const budget = project.budget || 0;

    const profit = contractValue - totalCost;
    const profitMargin = contractValue > 0 ? (profit / contractValue) * 100 : 0;
    const budgetVariance = budget - totalCost;
    const budgetVariancePercent = budget > 0 ? (budgetVariance / budget) * 100 : 0;

    return {
      success: true,
      project_id: params.project_id,
      financial_summary: {
        contract_value: contractValue,
        total_cost: totalCost,
        profit: profit,
        profit_margin_percent: profitMargin,
        budget: budget,
        budget_variance: budgetVariance,
        budget_variance_percent: budgetVariancePercent,
        status:
          budgetVariance >= 0
            ? "Under Budget"
            : "Over Budget",
      },
      formatted: {
        contract_value: `BSD $${contractValue.toFixed(2)}`,
        total_cost: `BSD $${totalCost.toFixed(2)}`,
        profit: `BSD $${profit.toFixed(2)}`,
        profit_margin: `${profitMargin.toFixed(1)}%`,
        budget: `BSD $${budget.toFixed(2)}`,
        budget_variance: `BSD $${budgetVariance.toFixed(2)}`,
      },
    };
  }
}
