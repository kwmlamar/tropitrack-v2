import type { ToolDescriptor } from "./types";

interface Input {
  payroll_entry_id: string;
}

interface Output {
  deleted_id: string;
  worker_name: string;
  period: string;
  gross_pay: number;
}

// Loading the entry's context (worker + period) once so preview() and handler()
// share the same view of "what's about to happen."
async function loadEntryContext(supabase: import("@supabase/supabase-js").SupabaseClient, id: string) {
  const { data } = await supabase
    .from("payroll_entries")
    .select(`
      id, gross_pay, total_paid, payment_status,
      worker:workers!inner(id, first_name, last_name),
      pay_period:pay_periods!inner(id, start_date, end_date, status)
    `)
    .eq("id", id)
    .single();
  if (!data) return null;
  // Supabase types nested relations as arrays; flatten.
  const worker = Array.isArray(data.worker) ? data.worker[0] : data.worker;
  const period = Array.isArray(data.pay_period) ? data.pay_period[0] : data.pay_period;
  return {
    id: data.id as string,
    gross_pay: Number(data.gross_pay ?? 0),
    total_paid: Number(data.total_paid ?? 0),
    payment_status: data.payment_status as string,
    worker_name: `${worker?.first_name ?? ""} ${worker?.last_name ?? ""}`.trim(),
    period_start: period?.start_date as string,
    period_end: period?.end_date as string,
    period_status: period?.status as string,
  };
}

export const deletePayrollEntryTool: ToolDescriptor<Input, Output> = {
  name: "delete_payroll_entry",
  description:
    "Delete a payroll entry that was created by mistake. Only works when (a) no money has been paid against the entry (total_paid = 0) AND (b) the pay period is not closed (status != 'paid'). For closed periods or entries with payments against them, use void or adjustment workflows instead — those are not delete-able for audit reasons.",
  input_schema: {
    type: "object",
    properties: {
      payroll_entry_id: {
        type: "string",
        description: "UUID of the payroll entry to delete. Get this from list_payroll_entries or get_worker_unpaid.",
      },
    },
    required: ["payroll_entry_id"],
  },
  tier: "double-confirm",
  scope: "write",
  skills: ["payroll"],

  async preview(input, ctx) {
    const e = await loadEntryContext(ctx.supabase, input.payroll_entry_id);
    if (!e) {
      return { summary: `Payroll entry ${input.payroll_entry_id} not found.` };
    }
    if (e.total_paid > 0) {
      return {
        summary: `⚠ BLOCKED: ${e.worker_name}'s entry for ${e.period_start}–${e.period_end} has $${e.total_paid.toFixed(2)} paid against it. Cannot delete — use an adjustment instead.`,
      };
    }
    if (e.period_status === "paid") {
      return {
        summary: `⚠ BLOCKED: pay period ${e.period_start}–${e.period_end} is closed (paid). Closed periods can't have entries deleted — they need to be reopened or adjusted.`,
      };
    }
    return {
      summary: `Delete ${e.worker_name}'s payroll entry for ${e.period_start}–${e.period_end} (gross $${e.gross_pay.toFixed(2)}, $0 paid). This is irreversible.`,
      doubleConfirmAnswer: e.worker_name,
    };
  },

  async handler(input, ctx) {
    const e = await loadEntryContext(ctx.supabase, input.payroll_entry_id);
    if (!e) return { ok: false, error: "payroll entry not found" };
    if (e.total_paid > 0) {
      return { ok: false, error: `entry has $${e.total_paid.toFixed(2)} paid against it; use adjustment, not delete` };
    }
    if (e.period_status === "paid") {
      return { ok: false, error: `pay period is closed; reopen or adjust instead of deleting` };
    }

    const { error } = await ctx.supabase
      .from("payroll_entries")
      .delete()
      .eq("id", e.id);
    if (error) {
      // RLS-likely failure — admin-only policy.
      return { ok: false, error: `delete failed: ${error.message} (admin role required)` };
    }
    return {
      ok: true,
      data: {
        deleted_id: e.id,
        worker_name: e.worker_name,
        period: `${e.period_start}–${e.period_end}`,
        gross_pay: e.gross_pay,
      },
      target: { table: "payroll_entries", rowId: e.id },
    };
  },
};
