import type { ToolDescriptor } from "./types";

interface Input {
  pay_period_id: string;
}

interface Output {
  deleted_id: string;
  period: string;
}

export const deletePayPeriodTool: ToolDescriptor<Input, Output> = {
  name: "delete_pay_period",
  description:
    "Delete a pay period that was created by mistake. Only works when (a) the period status is 'open' (never processed) AND (b) it has zero payroll_entries. For periods with entries or a non-open status, use void_pay_period or reopen instead.",
  input_schema: {
    type: "object",
    properties: {
      pay_period_id: { type: "string" },
    },
    required: ["pay_period_id"],
  },
  tier: "double-confirm",
  scope: "write",
  skills: ["payroll"],

  async preview(input, ctx) {
    const { data } = await ctx.supabase
      .from("pay_periods")
      .select("id, start_date, end_date, status")
      .eq("id", input.pay_period_id)
      .single();
    if (!data) return { summary: `Pay period ${input.pay_period_id} not found.` };
    if (data.status !== "open") {
      return { summary: `⚠ BLOCKED: status is '${data.status}'. Only 'open' periods can be deleted.` };
    }
    const { count } = await ctx.supabase
      .from("payroll_entries")
      .select("id", { count: "exact", head: true })
      .eq("pay_period_id", data.id);
    if ((count ?? 0) > 0) {
      return { summary: `⚠ BLOCKED: period has ${count} payroll entries. Delete or void those first.` };
    }
    return {
      summary: `Delete pay period ${data.start_date}–${data.end_date} (open, no entries). This is irreversible.`,
      doubleConfirmAnswer: `${data.start_date}`,
    };
  },

  async handler(input, ctx) {
    const { data: period } = await ctx.supabase
      .from("pay_periods")
      .select("id, start_date, end_date, status")
      .eq("id", input.pay_period_id)
      .single();
    if (!period) return { ok: false, error: "pay period not found" };
    if (period.status !== "open") return { ok: false, error: `status is ${period.status}; not deletable` };

    const { count } = await ctx.supabase
      .from("payroll_entries")
      .select("id", { count: "exact", head: true })
      .eq("pay_period_id", period.id);
    if ((count ?? 0) > 0) return { ok: false, error: `period has ${count} entries` };

    const { error } = await ctx.supabase
      .from("pay_periods")
      .delete()
      .eq("id", period.id);
    if (error) return { ok: false, error: error.message };

    return {
      ok: true,
      data: { deleted_id: period.id, period: `${period.start_date}–${period.end_date}` },
      target: { table: "pay_periods", rowId: period.id },
    };
  },
};
