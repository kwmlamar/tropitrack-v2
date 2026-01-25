import { SupabaseClient } from "@supabase/supabase-js";

export class PayrollTools {
  constructor(private supabase: SupabaseClient, private companyId: string, private userId: string) {}

  async calculatePayroll(params: any) {
    try {
      // First, get time entries
      let timeQuery = this.supabase
        .from("time_entries")
        .select("*")
        .eq("company_id", this.companyId)
        .gte("date", params.start_date)
        .lte("date", params.end_date);

      if (params.worker_ids) {
        timeQuery = timeQuery.in("worker_id", params.worker_ids);
      }

      const { data: timeEntries, error: timeError } = await timeQuery;

      if (timeError) {
        return { success: false, error: timeError.message };
      }

      if (!timeEntries || timeEntries.length === 0) {
        return {
          success: true,
          workers: {},
          period: { start: params.start_date, end: params.end_date },
          message: "No time entries found for this period",
        };
      }

      // Get unique worker IDs
      const workerIds = Array.from(new Set(timeEntries.map((e: any) => e.worker_id)));

      // Get worker details
      const { data: workers, error: workerError } = await this.supabase
        .from("workers")
        .select("id, first_name, last_name, hourly_rate, overtime_rate_multiplier, nib_enabled")
        .in("id", workerIds);

      if (workerError) {
        return { success: false, error: workerError.message };
      }

      // Create worker lookup map
      const workerMap: any = {};
      workers?.forEach((w: any) => {
        workerMap[w.id] = w;
      });

      // Calculate payroll
      const workerPayroll: any = {};

      timeEntries.forEach((entry: any) => {
        const wid = entry.worker_id;
        const worker = workerMap[wid];

        if (!worker) return; // Skip if worker not found

        if (!workerPayroll[wid]) {
          workerPayroll[wid] = {
            worker_id: wid,
            worker_name: `${worker.first_name} ${worker.last_name}`,
            regular_hours: 0,
            overtime_hours: 0,
            gross_pay: 0,
            nib_employee: 0,
            nib_employer: 0,
            net_pay: 0,
          };
        }

        const regularPay = (entry.regular_hours || 0) * (worker.hourly_rate || 0);
        const overtimePay =
          (entry.overtime_hours || 0) *
          (worker.hourly_rate || 0) *
          (worker.overtime_rate_multiplier || 1.5);
        const grossPay = regularPay + overtimePay;

        // NIB calculations (daily cap is ~$110 = $550 weekly / 5 days)
        const dailyCap = 110;
        const cappedWages = Math.min(grossPay, dailyCap);
        const nibEmployee = worker.nib_enabled ? cappedWages * 0.0465 : 0;
        const nibEmployer = worker.nib_enabled ? cappedWages * 0.0665 : 0;

        workerPayroll[wid].regular_hours += entry.regular_hours || 0;
        workerPayroll[wid].overtime_hours += entry.overtime_hours || 0;
        workerPayroll[wid].gross_pay += grossPay;
        workerPayroll[wid].nib_employee += nibEmployee;
        workerPayroll[wid].nib_employer += nibEmployer;
        workerPayroll[wid].net_pay += grossPay - nibEmployee;
      });

      // Calculate totals
      const totals = {
        total_workers: Object.keys(workerPayroll).length,
        total_hours: 0,
        total_regular_hours: 0,
        total_overtime_hours: 0,
        total_gross_pay: 0,
        total_nib_employee: 0,
        total_nib_employer: 0,
        total_net_pay: 0,
        total_labor_cost: 0,
      };

      Object.values(workerPayroll).forEach((w: any) => {
        totals.total_hours += w.regular_hours + w.overtime_hours;
        totals.total_regular_hours += w.regular_hours;
        totals.total_overtime_hours += w.overtime_hours;
        totals.total_gross_pay += w.gross_pay;
        totals.total_nib_employee += w.nib_employee;
        totals.total_nib_employer += w.nib_employer;
        totals.total_net_pay += w.net_pay;
      });

      totals.total_labor_cost = totals.total_gross_pay + totals.total_nib_employer;

      return {
        success: true,
        period: { start: params.start_date, end: params.end_date },
        workers: workerPayroll,
        totals: {
          workers: totals.total_workers,
          hours: totals.total_hours.toFixed(1),
          regular_hours: totals.total_regular_hours.toFixed(1),
          overtime_hours: totals.total_overtime_hours.toFixed(1),
          gross_pay: `BSD $${totals.total_gross_pay.toFixed(2)}`,
          nib_employee: `BSD $${totals.total_nib_employee.toFixed(2)}`,
          nib_employer: `BSD $${totals.total_nib_employer.toFixed(2)}`,
          net_pay: `BSD $${totals.total_net_pay.toFixed(2)}`,
          total_labor_cost: `BSD $${totals.total_labor_cost.toFixed(2)}`,
        },
        message: `Payroll calculated for ${totals.total_workers} workers, ${totals.total_hours.toFixed(1)} hours total. Total labor cost: BSD $${totals.total_labor_cost.toFixed(2)}`,
      };
    } catch (error: any) {
      console.error("Payroll calculation error:", error);
      return {
        success: false,
        error: error.message || "Failed to calculate payroll",
      };
    }
  }

  async getNIBSummary(params: any) {
    const payroll = await this.calculatePayroll(params);
    if (!payroll.success) return payroll;

    const totals = Object.values(payroll.workers).reduce<{ employee: number; employer: number }>(
      (acc, w: any) => ({
        employee: acc.employee + (w.nib_employee || 0),
        employer: acc.employer + (w.nib_employer || 0),
      }),
      { employee: 0, employer: 0 }
    );

    return {
      success: true,
      period: payroll.period,
      nib_summary: {
        employee_contributions: `BSD $${totals.employee.toFixed(2)}`,
        employer_contributions: `BSD $${totals.employer.toFixed(2)}`,
        total_nib: `BSD $${(totals.employee + totals.employer).toFixed(2)}`,
      },
      message: `NIB Summary: Employee BSD $${totals.employee.toFixed(2)}, Employer BSD $${totals.employer.toFixed(2)}, Total BSD $${(totals.employee + totals.employer).toFixed(2)}`,
    };
  }

  async getFinancialSummary(params: any) {
    try {
      // Get revenue from invoices
      const { data: invoices } = await this.supabase
        .from("invoices")
        .select("total_amount, amount_paid")
        .eq("company_id", this.companyId)
        .gte("issue_date", params.start_date)
        .lte("issue_date", params.end_date);

      const revenue = invoices?.reduce((sum, inv) => sum + (inv.amount_paid || 0), 0) || 0;

      // Get labor costs
      const payroll = await this.calculatePayroll(params);
      const laborCost = payroll.success
        ? Object.values(payroll.workers).reduce(
            (sum: number, w: any) => sum + (w.gross_pay || 0) + (w.nib_employer || 0),
            0
          )
        : 0;

      const profit = revenue - laborCost;

      return {
        success: true,
        period: { start: params.start_date, end: params.end_date },
        financial_summary: {
          revenue: `BSD $${revenue.toFixed(2)}`,
          labor_cost: `BSD $${laborCost.toFixed(2)}`,
          profit: `BSD $${profit.toFixed(2)}`,
          profit_margin: revenue > 0 ? `${((profit / revenue) * 100).toFixed(1)}%` : "N/A",
        },
        message: `Financial Summary: Revenue BSD $${revenue.toFixed(2)}, Labor Cost BSD $${laborCost.toFixed(2)}, Profit BSD $${profit.toFixed(2)}`,
      };
    } catch (error: any) {
      console.error("Financial summary error:", error);
      return {
        success: false,
        error: error.message || "Failed to generate financial summary",
      };
    }
  }
}
