import type { ProjectLabourCostResult } from "@/types";
import type { ToolDescriptor } from "./types";
import { resolveByName } from "./match";

interface Input {
  /** Preferred when known. */
  project_id?: string;
  /** What the user called the job. Resolved fuzzily against the project list. */
  project_name?: string;
}

/**
 * A thin wrapper over project_labor_cost(project). Deliberately thin.
 *
 * Same rule as crew_balances: no arithmetic in this handler. The job page reads
 * the identical function, so "labour on the metal roof job" gives one number
 * wherever it is asked.
 */
export const projectLaborCostTool: ToolDescriptor<Input, ProjectLabourCostResult> = {
  name: "project_labor_cost",
  description:
    "THE tool for 'labour on [job]' / 'what has [job] cost us in labour'. Returns per-worker days, regular and overtime hours, rate and cost for one job, plus totals and labour as a share of budget and contract. Accepts a project_id, or a project_name matched fuzzily. These are CREW WAGE COSTS — never a client price, no markup, no overhead, no profit. Computed in the database by the same function behind the job page's Labour panel. NEVER total time entries yourself — call this. Pass on the payload's notes, particularly that rates have no history so older figures are approximate.",
  input_schema: {
    type: "object",
    properties: {
      project_id: { type: "string", description: "Job id, when you already have it." },
      project_name: {
        type: "string",
        description: "The job as the user named it. Partial or misspelled is fine.",
      },
    },
  },
  tier: "none",
  scope: "read",
  skills: ["core", "job_status"],

  async handler(input, ctx) {
    let projectId = input.project_id;

    if (!projectId) {
      if (!input.project_name) {
        return { ok: false, error: "give either project_id or project_name" };
      }
      const { data: projects, error } = await ctx.supabase
        .from("projects")
        .select("id, name, client_name, location")
        .eq("company_id", ctx.companyId);
      if (error) return { ok: false, error: `projects query failed: ${error.message}` };
      if (!projects?.length) return { ok: false, error: "no jobs found for this company" };

      const resolved = resolveByName(
        input.project_name,
        projects as { id: string; name: string; client_name: string | null; location: string | null }[],
        (p) => [p.name, p.client_name ?? "", p.location ?? ""].filter(Boolean),
        "job",
      );
      if (!resolved.ok) {
        // Refuse rather than pick. A labour figure attached to the wrong job is
        // worse than no figure.
        return {
          ok: false,
          error: resolved.error,
          data: { candidates: resolved.candidates } as unknown as ProjectLabourCostResult,
        };
      }
      projectId = resolved.match.id;
    }

    const { data, error } = await ctx.supabase.rpc("project_labor_cost", {
      p_project_id: projectId,
    });
    if (error) return { ok: false, error: `project_labor_cost failed: ${error.message}` };

    const payload = data as ProjectLabourCostResult;
    if (!payload?.ok) {
      return { ok: false, error: payload?.error ?? "job not found or not visible" };
    }

    return { ok: true, data: payload, target: { table: "projects", rowId: projectId } };
  },
};
