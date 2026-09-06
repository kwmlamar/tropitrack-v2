import type { SupabaseClient } from "@supabase/supabase-js";
import type { CrewBalances } from "@/types";
import type { ToolDescriptor } from "./types";

/**
 * A thin wrapper over crew_balances(company). Deliberately thin.
 *
 * The whole point of this tool is that the arithmetic happens in Postgres, once,
 * in the same function the dashboard tile and the payroll panel call. There is
 * no computation in this handler and there must never be one: the moment a
 * number is derived here instead of there, the screen and the chat can disagree
 * again, which is how the same question got two different answers on the same
 * day in August.
 */
export async function fetchCrewBalances(
  supabase: SupabaseClient,
  companyId: string,
): Promise<{ ok: true; data: CrewBalances } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc("crew_balances", { p_company_id: companyId });
  if (error) return { ok: false, error: `crew_balances failed: ${error.message}` };
  if (!data) return { ok: false, error: "crew_balances returned nothing" };
  return { ok: true, data: data as CrewBalances };
}

export const crewBalancesTool: ToolDescriptor<Record<string, never>, CrewBalances> = {
  name: "crew_balances",
  description:
    "THE tool for 'how much do we owe everyone / the guys / the crew'. Returns, per worker and for the company: outstanding payroll balances on BOTH the gross basis (gross_pay - total_paid) and the net basis (net_pay - total_paid, after NIB — this is what the payroll screen pays against), plus any time logged into a gap that no pay period covers and so never reached payroll at all. Also returns workers who have left but are still owed money. Every figure is computed in the database by the same function behind the dashboard tile and the payroll panel, so your answer and the screen always agree. NEVER add up payroll entries yourself — call this. When reporting: give the as-of date, say which basis you are quoting, and show uncovered time as its own line rather than folding it into one total.",
  input_schema: { type: "object", properties: {} },
  tier: "none",
  scope: "read",
  skills: ["core", "payroll"],
  async handler(_input, ctx) {
    const result = await fetchCrewBalances(ctx.supabase, ctx.companyId);
    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true, data: result.data };
  },
};
