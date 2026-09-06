"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";
import { AskAboutThis } from "@/components/ai/ask-about-this";
import type { ProjectLabourCost, ProjectLabourCostResult } from "@/types";

const money = (n: number) => `BSD ${formatCurrency(n)}`;

/**
 * "Labour on [job]", on the job page.
 *
 * Reads project_labor_cost(project) — the same RPC behind the assistant's
 * project_labor_cost tool, so a labour figure quoted in chat is the figure on
 * this panel. Nothing here does arithmetic.
 *
 * These are crew wage rates: a cost, not a client price. No markup, no O&P.
 */
export function ProjectLabourPanel({ projectId }: { projectId: string }) {
  const [data, setData] = useState<ProjectLabourCost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: payload, error: rpcError } = await supabase.rpc("project_labor_cost", {
        p_project_id: projectId,
      });
      if (rpcError) throw rpcError;
      const result = payload as ProjectLabourCostResult;
      if (!result?.ok) {
        setError(result?.error ?? "labour cost unavailable");
        setData(null);
      } else {
        setData(result);
      }
    } catch (err) {
      console.error("project_labor_cost failed:", err);
      setError("labour cost could not be calculated");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <div className="h-[220px] animate-pulse rounded-lg bg-surface-100" />;
  }

  if (error || !data) {
    return (
      <div className="rounded-lg border border-border bg-surface-100 px-4 py-6">
        <p className="text-center text-[12px] text-foreground-lighter">
          {error ?? "Labour cost unavailable."}
        </p>
      </div>
    );
  }

  const t = data.totals;

  return (
    <div className="rounded-lg border border-border bg-surface-100">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="font-mono text-[11px] uppercase tracking-widest text-foreground-lighter">
          Labour · crew wage cost · as of {data.as_of}
        </span>
        <AskAboutThis
          skill="job_status"
          question={`Job ${data.project.id} — "${data.project.name}". Labour to date is ${money(
            t.labour_cost
          )} across ${t.workers} workers and ${t.crew_days} crew days (${t.total_hours.toFixed(
            1
          )} hours). Where is this job standing, and what should I be watching?`}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 px-4 py-4 md:grid-cols-4">
        {[
          { label: "Labour cost", value: money(t.labour_cost), strong: true },
          { label: "Hours", value: `${t.total_hours.toFixed(1)}h` },
          { label: "Crew days", value: String(t.crew_days) },
          { label: "Workers", value: String(t.workers) },
        ].map((s) => (
          <div key={s.label}>
            <p className="font-mono text-[10px] uppercase tracking-wider text-foreground-lighter">
              {s.label}
            </p>
            <p
              className={
                s.strong
                  ? "mt-1 text-[18px] font-semibold leading-none tabular-nums text-brand"
                  : "mt-1 text-[18px] font-semibold leading-none tabular-nums text-foreground"
              }
            >
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Share of budget only when there is a budget. A job with budget 0 shows
          nothing here rather than a meaningless 0%. */}
      {(data.against_budget.has_budget || data.against_contract.labour_pct != null) && (
        <div className="grid grid-cols-2 gap-3 border-t border-border px-4 py-3">
          {data.against_budget.has_budget && (
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-foreground-lighter">
                Of budget
              </p>
              <p className="mt-1 text-[13px] font-semibold tabular-nums text-foreground-light">
                {data.against_budget.labour_pct}% of {money(data.against_budget.budget)}
              </p>
            </div>
          )}
          {data.against_contract.labour_pct != null && (
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-foreground-lighter">
                Of contract
              </p>
              <p className="mt-1 text-[13px] font-semibold tabular-nums text-foreground-light">
                {data.against_contract.labour_pct}% of{" "}
                {money(data.against_contract.contract_value)}
              </p>
            </div>
          )}
        </div>
      )}

      {data.workers.length > 0 && (
        <div className="max-h-[300px] overflow-auto border-t border-border">
          <table className="w-full">
            <thead>
              <tr className="sticky top-0 border-b border-border bg-surface-100">
                <th className="px-4 py-2 text-left font-mono text-[10px] uppercase tracking-widest text-foreground-lighter">
                  Worker
                </th>
                <th className="px-3 py-2 text-right font-mono text-[10px] uppercase tracking-widest text-foreground-lighter">
                  Days
                </th>
                <th className="px-3 py-2 text-right font-mono text-[10px] uppercase tracking-widest text-foreground-lighter">
                  Reg
                </th>
                <th className="px-3 py-2 text-right font-mono text-[10px] uppercase tracking-widest text-foreground-lighter">
                  OT
                </th>
                <th className="px-3 py-2 text-right font-mono text-[10px] uppercase tracking-widest text-foreground-lighter">
                  Rate
                </th>
                <th className="px-4 py-2 text-right font-mono text-[10px] uppercase tracking-widest text-foreground-lighter">
                  Cost
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.workers.map((w) => (
                <tr key={w.worker_id} className="transition-colors hover:bg-surface-200">
                  <td className="px-4 py-2.5 text-[13px] text-foreground-light">{w.name}</td>
                  <td className="px-3 py-2.5 text-right text-[12px] tabular-nums text-foreground-lighter">
                    {w.days}
                  </td>
                  <td className="px-3 py-2.5 text-right text-[12px] tabular-nums text-foreground-lighter">
                    {w.regular_hours.toFixed(1)}h
                  </td>
                  <td className="px-3 py-2.5 text-right text-[12px] tabular-nums">
                    {w.overtime_hours > 0 ? (
                      <span className="text-brand">{w.overtime_hours.toFixed(1)}h</span>
                    ) : (
                      <span className="text-foreground-lighter">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right text-[12px] tabular-nums text-foreground-lighter">
                    {w.hourly_rate ? formatCurrency(w.hourly_rate) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right text-[13px] font-semibold tabular-nums text-foreground">
                    {formatCurrency(w.cost)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* The rate-history and zero-hour caveats travel with the number. A cost
          quoted without them reads more certain than it is. */}
      <div className="space-y-1 border-t border-border px-4 py-3">
        {data.notes.map((n) => (
          <p key={n} className="text-[11px] leading-relaxed text-foreground-lighter">
            {n}
          </p>
        ))}
      </div>
    </div>
  );
}
