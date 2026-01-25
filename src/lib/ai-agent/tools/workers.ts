/**
 * Worker Tools for AI Agent
 */

import { SupabaseClient } from "@supabase/supabase-js";

export class WorkerTools {
  constructor(
    private supabase: SupabaseClient,
    private companyId: string,
    private userId: string
  ) {}

  async listWorkers(params: any) {
    let query = this.supabase
      .from("workers")
      .select("*")
      .eq("company_id", this.companyId);

    if (params.status && params.status !== "all") {
      query = query.eq("status", params.status);
    }

    if (params.worker_type && params.worker_type !== "all") {
      query = query.eq("worker_type", params.worker_type);
    }

    const { data, error } = await query.order("last_name", { ascending: true });

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      workers: data,
      count: data?.length || 0,
      message: `Found ${data?.length || 0} workers`,
    };
  }

  async getWorkerDetails(params: any) {
    const { data, error } = await this.supabase
      .from("workers")
      .select("*")
      .eq("id", params.worker_id)
      .eq("company_id", this.companyId)
      .single();

    if (error || !data) {
      return { success: false, error: "Worker not found" };
    }

    return {
      success: true,
      worker: data,
    };
  }

  async createWorker(params: any) {
    const { data, error } = await this.supabase
      .from("workers")
      .insert({
        company_id: this.companyId,
        ...params,
      })
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      worker: data,
      message: `Worker ${data.first_name} ${data.last_name} created successfully`,
    };
  }

  async updateWorker(params: any) {
    const { data, error } = await this.supabase
      .from("workers")
      .update(params.updates)
      .eq("id", params.worker_id)
      .eq("company_id", this.companyId)
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      worker: data,
      message: "Worker updated successfully",
    };
  }

  async getWorkerHours(params: any) {
    let query = this.supabase
      .from("time_entries")
      .select(params.by_project ? "*, projects(name)" : "*")
      .eq("worker_id", params.worker_id)
      .eq("company_id", this.companyId)
      .gte("date", params.start_date)
      .lte("date", params.end_date);

    const { data, error } = await query;

    if (error) {
      return { success: false, error: error.message };
    }

    const entries = (data ?? []) as Array<{ regular_hours?: number; overtime_hours?: number; projects?: { name?: string } }>;
    const totalRegular = entries.reduce((sum, entry) => sum + (entry.regular_hours || 0), 0);
    const totalOvertime = entries.reduce((sum, entry) => sum + (entry.overtime_hours || 0), 0);
    const totalHours = totalRegular + totalOvertime;

    let byProject: any = {};
    if (params.by_project) {
      entries.forEach((entry) => {
        const projectName = entry.projects?.name || "Unknown Project";
        if (!byProject[projectName]) {
          byProject[projectName] = { regular: 0, overtime: 0, total: 0 };
        }
        byProject[projectName].regular += entry.regular_hours || 0;
        byProject[projectName].overtime += entry.overtime_hours || 0;
        byProject[projectName].total += (entry.regular_hours || 0) + (entry.overtime_hours || 0);
      });
    }

    return {
      success: true,
      worker_id: params.worker_id,
      period: {
        start_date: params.start_date,
        end_date: params.end_date,
      },
      hours: {
        regular: totalRegular.toFixed(1),
        overtime: totalOvertime.toFixed(1),
        total: totalHours.toFixed(1),
      },
      ...(params.by_project && { by_project: byProject }),
      message: `Total hours: ${totalHours.toFixed(1)} (${totalRegular.toFixed(1)} regular + ${totalOvertime.toFixed(1)} OT)`,
    };
  }
}
