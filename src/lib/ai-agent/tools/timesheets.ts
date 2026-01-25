/**
 * Timesheet Tools for AI Agent
 */

import { SupabaseClient } from "@supabase/supabase-js";

export class TimesheetTools {
  constructor(
    private supabase: SupabaseClient,
    private companyId: string,
    private userId: string
  ) {}

  async createTimesheetEntry(params: any) {
    // Get worker details
    const { data: worker } = await this.supabase
      .from("workers")
      .select("hourly_rate, overtime_rate_multiplier, nib_enabled")
      .eq("id", params.worker_id)
      .eq("company_id", this.companyId)
      .single();

    if (!worker) {
      return { success: false, error: "Worker not found" };
    }

    // Calculate hours
    const start = new Date(`2000-01-01 ${params.start_time}`);
    const end = new Date(`2000-01-01 ${params.end_time}`);
    let totalMinutes = (end.getTime() - start.getTime()) / 1000 / 60;
    totalMinutes -= params.break_duration_minutes || 0;

    const totalHours = totalMinutes / 60;
    const regularHours = Math.min(totalHours, 8);
    const overtimeHours = Math.max(0, totalHours - 8);

    // Calculate pay
    const regularPay = regularHours * (worker.hourly_rate || 0);
    const overtimeRate = (worker.hourly_rate || 0) * (worker.overtime_rate_multiplier || 1.5);
    const overtimePay = overtimeHours * overtimeRate;
    const grossPay = regularPay + overtimePay;

    // Calculate NIB
    let nibDeduction = 0;
    let nibEmployerContribution = 0;

    if (worker.nib_enabled) {
      const cappedWages = Math.min(grossPay, 110); // Daily cap (550/5)
      nibDeduction = cappedWages * 0.0465; // 4.65% employee
      nibEmployerContribution = cappedWages * 0.0665; // 6.65% employer
    }

    const netPay = grossPay - nibDeduction;

    const { data, error } = await this.supabase
      .from("time_entries")
      .insert({
        company_id: this.companyId,
        worker_id: params.worker_id,
        project_id: params.project_id,
        date: params.work_date,
        start_time: params.start_time,
        end_time: params.end_time,
        break_duration_minutes: params.break_duration_minutes || 0,
        regular_hours: regularHours,
        overtime_hours: overtimeHours,
        notes: params.notes,
        created_by: this.userId,
      })
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      timesheet: data,
      summary: {
        regular_hours: regularHours.toFixed(2),
        overtime_hours: overtimeHours.toFixed(2),
        gross_pay: `BSD $${grossPay.toFixed(2)}`,
        nib_deduction: `BSD $${nibDeduction.toFixed(2)}`,
        net_pay: `BSD $${netPay.toFixed(2)}`,
        total_labor_cost: `BSD $${(grossPay + nibEmployerContribution).toFixed(2)}`,
      },
      message: `Time entry created: ${totalHours.toFixed(1)} hours (${regularHours.toFixed(1)} regular + ${overtimeHours.toFixed(1)} OT)`,
    };
  }

  async bulkCreateTimesheets(params: any) {
    const results = [];

    for (const entry of params.entries) {
      const result = await this.createTimesheetEntry({
        worker_id: entry.worker_id,
        project_id: entry.project_id || params.project_id,
        work_date: params.work_date,
        start_time: entry.start_time,
        end_time: entry.end_time,
        break_duration_minutes: entry.break_duration_minutes || 0,
        notes: entry.notes,
      });

      results.push(result);
    }

    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return {
      success: true,
      summary: {
        total: results.length,
        successful,
        failed,
      },
      results,
      message: `Created ${successful} time entries successfully${failed > 0 ? ` (${failed} failed)` : ""}`,
    };
  }

  async getTimesheets(params: any) {
    let query = this.supabase
      .from("time_entries")
      .select("*, workers(first_name, last_name), projects(name)")
      .eq("company_id", this.companyId);

    if (params.worker_id) query = query.eq("worker_id", params.worker_id);
    if (params.project_id) query = query.eq("project_id", params.project_id);
    if (params.start_date) query = query.gte("date", params.start_date);
    if (params.end_date) query = query.lte("date", params.end_date);
    if (params.approved_only) query = query.not("approved_at", "is", null);

    const { data, error } = await query.order("date", { ascending: false });

    if (error) {
      return { success: false, error: error.message };
    }

    const totalHours = data?.reduce((sum, entry) => sum + (entry.regular_hours || 0) + (entry.overtime_hours || 0), 0) || 0;

    return {
      success: true,
      timesheets: data,
      count: data?.length || 0,
      total_hours: totalHours.toFixed(1),
      message: `Found ${data?.length || 0} time entries totaling ${totalHours.toFixed(1)} hours`,
    };
  }

  async updateTimesheet(params: any) {
    const { data, error } = await this.supabase
      .from("time_entries")
      .update(params.updates)
      .eq("id", params.timesheet_id)
      .eq("company_id", this.companyId)
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      timesheet: data,
      message: "Time entry updated successfully",
    };
  }

  async deleteTimesheet(params: any) {
    const { error } = await this.supabase
      .from("time_entries")
      .delete()
      .eq("id", params.timesheet_id)
      .eq("company_id", this.companyId);

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      message: "Time entry deleted successfully",
    };
  }
}
