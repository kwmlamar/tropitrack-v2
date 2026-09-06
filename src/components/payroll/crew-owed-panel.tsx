"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn, formatCurrency } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { AskAboutThis } from "@/components/ai/ask-about-this";
import type { CrewBalances, CrewWorkerBalance } from "@/types";

const money = (n: number) => `BSD ${formatCurrency(n)}`;

/**
 * "How much do we owe everyone", on the payroll screen.
 *
 * Reads crew_balances(company) — the same RPC behind the dashboard tile and the
 * assistant's crew_balances tool. Same input, same function, same number, so a
 * figure quoted in chat is the figure on this panel. Nothing here does
 * arithmetic; every number below comes straight out of the payload.
 *
 * Both bases are shown. The headline is net (what /payroll pays against); gross
 * is stated beside it, not buried. Which one is "owed" is an owner decision,
 * and this panel is careful to present it as one.
 */
export function CrewOwedPanel({ companyId }: { companyId: string | null | undefined }) {
  const [data, setData] = useState<CrewBalances | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setFailed(false);
    try {
      const supabase = createClient();
      const { data: payload, error } = await supabase.rpc("crew_balances", {
        p_company_id: companyId,
      });
      if (error) throw error;
      setData(payload as CrewBalances);
    } catch (err) {
      console.error("crew_balances failed:", err);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <div className="h-[52px] flex-shrink-0 animate-pulse border-b border-border bg-surface-100" />;
  }

  if (failed || !data) {
    return (
      <div className="flex-shrink-0 border-b border-border px-6 py-3">
        <p className="text-[12px] text-foreground-lighter">
          Owed to crew could not be calculated.
        </p>
      </div>
    );
  }

  const t = data.totals;
  const hasUncovered = t.uncovered_time_value > 0;
  const hasTerminated = t.terminated_owed_count > 0;

  return (
    <div className="flex-shrink-0 border-b border-border">
      {/* Summary strip — always visible */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-3 text-left"
        >
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 flex-shrink-0 text-foreground-lighter transition-transform",
              open && "rotate-180"
            )}
          />
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-foreground-lighter">
              Owed to crew · net basis · as of {data.as_of}
            </p>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <span className="text-[18px] font-semibold leading-none tabular-nums text-foreground">
                {money(t.total_owed_net)}
              </span>
              <span className="text-[11px] tabular-nums text-foreground-lighter">
                gross basis {money(t.total_owed_gross)}
              </span>
              <span className="text-[11px] tabular-nums text-foreground-lighter">
                {t.workers_owed} of {t.roster_size} crew · {t.entry_count} entries ·{" "}
                {t.period_count} periods
                {t.oldest_unpaid_period_start && ` · since ${t.oldest_unpaid_period_start}`}
              </span>
            </div>
          </div>
        </button>

        <AskAboutThis
          skill="payroll"
          question={`We owe the crew ${money(
            t.total_owed_net
          )} on the net basis (${money(
            t.total_owed_gross
          )} gross) across ${t.workers_owed} workers and ${t.period_count} pay periods as of ${
            data.as_of
          }. Break it down per worker and tell me who has been waiting longest.`}
        />
      </div>

      {/* Uncovered time is its own line, never folded into the headline. This is
          the hole that hid $53,026.48 of labour: hours logged into a gap that no
          pay period covers, so no payroll entry was ever generated from them. */}
      {hasUncovered && (
        <div className="border-t border-border bg-destructive-subtle px-6 py-2">
          <p className="text-[12px] text-destructive">
            + {money(t.uncovered_time_value)} of logged time falls in no pay period
            {t.uncovered_since && ` (since ${t.uncovered_since})`} —{" "}
            {t.uncovered_regular_hours.toFixed(1)}h regular
            {t.uncovered_overtime_hours > 0 && ` + ${t.uncovered_overtime_hours.toFixed(1)}h OT`}.
            No payroll entry exists for these hours.
          </p>
        </div>
      )}

      {hasTerminated && (
        <div className="border-t border-border bg-warning-subtle px-6 py-2">
          <p className="text-[12px] text-warning">
            + {money(t.terminated_owed_net)} still owed to {t.terminated_owed_count} terminated{" "}
            {t.terminated_owed_count === 1 ? "worker" : "workers"}. Not included in the
            headline above — whether these are owed or written off is an open question.
          </p>
        </div>
      )}

      {/* Per-worker detail */}
      {open && (
        <div className="border-t border-border">
          <div className="max-h-[320px] overflow-auto">
            <WorkerTable rows={data.workers} />
            {hasTerminated && (
              <>
                <div className="border-t border-border bg-surface-200 px-6 py-1.5">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-warning">
                    Terminated, still carrying a balance
                  </p>
                </div>
                <WorkerTable rows={data.terminated_with_balance} />
              </>
            )}
          </div>

          {/* The basis question and the rate caveat, stated where the numbers
              are. Swallowing these is how a confident wrong total gets quoted. */}
          <div className="space-y-1 border-t border-border px-6 py-3">
            <p className="text-[11px] leading-relaxed text-foreground-lighter">{data.basis_note}</p>
            {data.notes.map((n) => (
              <p key={n} className="text-[11px] leading-relaxed text-foreground-lighter">
                {n}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function WorkerTable({ rows }: { rows: CrewWorkerBalance[] }) {
  if (!rows.length) {
    return (
      <p className="px-6 py-6 text-center text-[12px] text-foreground-lighter">
        Nothing outstanding.
      </p>
    );
  }
  return (
    <table className="w-full">
      <thead>
        <tr className="sticky top-0 border-b border-border bg-background">
          <th className="px-6 py-2 text-left font-mono text-[10px] uppercase tracking-widest text-foreground-lighter">
            Worker
          </th>
          <th className="px-4 py-2 text-right font-mono text-[10px] uppercase tracking-widest text-foreground-lighter">
            Entries
          </th>
          <th className="px-4 py-2 text-right font-mono text-[10px] uppercase tracking-widest text-foreground-lighter">
            Gross bal
          </th>
          <th className="px-4 py-2 text-right font-mono text-[10px] uppercase tracking-widest text-foreground-lighter">
            Uncovered
          </th>
          <th className="px-6 py-2 text-right font-mono text-[10px] uppercase tracking-widest text-foreground-lighter">
            Owed (net)
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {rows.map((w) => (
          <tr key={w.worker_id} className="transition-colors hover:bg-surface-200">
            <td className="px-6 py-2.5">
              <p className="text-[13px] text-foreground-light">{w.name}</p>
              <p className="mt-0.5 text-[10px] tabular-nums text-foreground-lighter">
                {w.hourly_rate ? `${money(w.hourly_rate)}/hr` : "no rate on file"}
                {w.nib_enabled && " · NIB"}
                {w.outstanding.oldest_period_start &&
                  ` · since ${w.outstanding.oldest_period_start}`}
              </p>
            </td>
            <td className="px-4 py-2.5 text-right text-[12px] tabular-nums text-foreground-lighter">
              {w.outstanding.entries}
            </td>
            <td className="px-4 py-2.5 text-right text-[12px] tabular-nums text-foreground-lighter">
              {formatCurrency(w.outstanding.balance_gross)}
            </td>
            <td className="px-4 py-2.5 text-right text-[12px] tabular-nums">
              {w.uncovered_time.value > 0 ? (
                <span className="text-destructive">
                  {formatCurrency(w.uncovered_time.value)}
                </span>
              ) : (
                <span className="text-foreground-lighter">—</span>
              )}
            </td>
            <td className="px-6 py-2.5 text-right text-[13px] font-semibold tabular-nums text-foreground">
              {formatCurrency(w.total_owed_net)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
