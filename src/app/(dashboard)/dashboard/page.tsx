"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { cn, formatCurrency } from "@/lib/utils";
import { ArrowRight, Clock, ScanLine } from "lucide-react";
import { ClaudeIcon } from "@/components/icons/claude-icon";
import { SearchModal } from "@/components/search/search-modal";
import type {
  AttentionRow,
  AttentionSeverity,
  DashboardJob,
  DashboardSummary,
} from "@/types";

/** Money is always "BSD $12,345.67" — formatCurrency supplies everything but the code. */
const money = (n: number) => `BSD ${formatCurrency(n)}`;

/** Display figure: the currency code sits smaller and quieter than the amount. */
function Money({ value, className }: { value: number; className?: string }) {
  return (
    <span className={className}>
      <span className="mr-1 text-[11px] font-medium text-foreground-lighter">BSD</span>
      {formatCurrency(value)}
    </span>
  );
}

/** yyyy-mm-dd at local noon, so a timezone offset can never roll it to the day before. */
const parseLocalDate = (iso: string) => new Date(`${iso}T12:00:00`);

const shortDate = (iso: string) =>
  parseLocalDate(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

const weekdayName = (iso: string) =>
  parseLocalDate(iso).toLocaleDateString("en-US", { weekday: "long" });

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

const SEVERITY_ORDER: Record<AttentionSeverity, number> = {
  destructive: 0,
  warning: 1,
  info: 2,
};

const SEVERITY_DOT: Record<AttentionSeverity, string> = {
  destructive: "bg-destructive",
  warning: "bg-warning",
  info: "bg-info",
};

/** Full sentence for the Needs Attention panel. */
function attentionSentence(row: AttentionRow): string {
  const n = row.count;
  switch (row.key) {
    case "stale_pay_periods":
      return `${n} pay ${plural(n, "period")} never closed${
        row.date_ref ? ` — oldest ended ${shortDate(row.date_ref)}` : ""
      }`;
    case "invoices_unpaid_30":
      return `${n} ${plural(n, "invoice")} unpaid over 30 days${
        row.amount != null ? ` — ${money(row.amount)}` : ""
      }`;
    case "receipts_no_image":
      return `${n} ${plural(n, "receipt")} with no image on file`;
    case "estimates_unpriced":
      return `${n} ${plural(n, "estimate")} awaiting pricing`;
    case "jobs_no_budget":
      return `${n} active ${plural(n, "job")} with no budget set`;
    case "jobs_no_estimate":
      return `${n} ${plural(n, "job")} burning labour with no estimate`;
    case "receipts_not_itemised":
      return `${n} ${plural(n, "receipt")} not itemised`;
    case "crew_no_hours":
      return `${n} crew with no hours logged${
        row.date_ref ? ` ${weekdayName(row.date_ref)}` : ""
      }`;
    case "invoice_numbering":
      return `${n} ${plural(n, "invoice")} outside the numbering sequence`;
    default:
      return `${n} items need attention`;
  }
}

/** Condensed form for the one-line brief under the greeting. */
function attentionShort(row: AttentionRow): string {
  const n = row.count;
  switch (row.key) {
    case "stale_pay_periods":
      return `${n} pay ${plural(n, "period")} still open`;
    case "invoices_unpaid_30":
      return row.amount != null ? `${money(row.amount)} overdue` : `${n} overdue invoices`;
    case "receipts_no_image":
      return `${n} ${plural(n, "receipt")} missing images`;
    case "estimates_unpriced":
      return `${n} estimates unpriced`;
    case "jobs_no_budget":
      return `${n} ${plural(n, "job")} with no budget`;
    case "jobs_no_estimate":
      return `${n} ${plural(n, "job")} with no estimate`;
    case "receipts_not_itemised":
      return `${n} ${plural(n, "receipt")} not itemised`;
    case "crew_no_hours":
      return `${n} crew unlogged`;
    case "invoice_numbering":
      return `${n} invoices misnumbered`;
    default:
      return `${n} items`;
  }
}

export default function DashboardPage() {
  const { profile } = useAuth();
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const now = new Date();
  const greeting =
    now.getHours() < 12 ? "Morning" : now.getHours() < 17 ? "Afternoon" : "Evening";
  const dateStr = now
    .toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
    .toUpperCase();

  const load = useCallback(async () => {
    if (!profile?.company_id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setFailed(false);
    try {
      // One RPC replaces the fifteen-odd aggregates this page needs.
      const supabase = createClient();
      const { data: payload, error } = await supabase.rpc("dashboard_summary", {
        p_company_id: profile.company_id,
      });
      if (error) throw error;
      setData(payload as DashboardSummary);
    } catch (err) {
      console.error("dashboard_summary failed:", err);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [profile?.company_id]);

  useEffect(() => {
    load();
  }, [load]);

  const attention = [...(data?.attention ?? [])].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
  );

  const brief = attention.slice(0, 3).map(attentionShort).join(" · ");

  return (
    <div className="flex flex-col h-full overflow-auto bg-background">
      {/* Top bar */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-6 py-4 flex-shrink-0">
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-widest text-foreground-lighter">
            {dateStr}
          </p>
          <h1 className="mt-0.5 text-[16px] font-semibold text-foreground">
            {greeting}, {profile?.full_name?.split(" ")[0] ?? "—"}
          </h1>
          <p className="mt-1 text-[12px] text-foreground-light">
            {loading
              ? "Checking the books…"
              : failed
              ? "Could not load today's summary."
              : brief || "Nothing needs attention."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <SearchModal />
          <Link
            href="/time-tracking"
            className="flex items-center gap-1.5 rounded-md border border-strong bg-card px-3 py-1.5 text-[12px] font-medium text-foreground transition-colors hover:bg-surface-200 hover:border-hover"
          >
            <Clock className="h-3.5 w-3.5" />
            Log Time
          </Link>
          <Link
            href="/receipts"
            className="flex items-center gap-1.5 rounded-md border border-strong bg-card px-3 py-1.5 text-[12px] font-medium text-foreground transition-colors hover:bg-surface-200 hover:border-hover"
          >
            <ScanLine className="h-3.5 w-3.5" />
            Scan Receipt
          </Link>
          <Link
            href="/assistant"
            className="flex items-center gap-1.5 px-1 text-[12px] font-medium text-foreground-lighter transition-colors hover:text-foreground-light"
          >
            <ClaudeIcon className="h-3.5 w-3.5" />
            <span>Ask Claude</span>
          </Link>
        </div>
      </div>

      {/* Bands. On phones the exception list comes first — on site, that is the
          entire point of the page. */}
      <div className="flex flex-1 flex-col gap-5 p-6 pb-24 md:pb-6">
        <div className="order-2 md:order-1">
          <MoneyBand data={data} loading={loading} />
        </div>
        <div className="order-1 md:order-2">
          <AttentionBand rows={attention} loading={loading} failed={failed} />
        </div>
        <div className="order-3">
          <JobsBand jobs={data?.jobs ?? []} loading={loading} />
        </div>
        <div className="order-4">
          <WeekBand week={data?.week} loading={loading} />
        </div>
      </div>
    </div>
  );
}

/* ── Band 1: money ───────────────────────────────────────────────────────── */

function Tile({
  label,
  href,
  children,
  sub,
}: {
  label: string;
  href: string;
  children: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-border bg-surface-100 px-4 py-3.5 transition-colors hover:bg-surface-200"
    >
      <p className="font-mono text-[11px] uppercase tracking-wider text-foreground-lighter">
        {label}
      </p>
      {children}
      {sub && <div className="mt-1 text-[11px] text-foreground-lighter">{sub}</div>}
    </Link>
  );
}

function MoneyBand({ data, loading }: { data: DashboardSummary | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {Array(3)
          .fill(0)
          .map((_, i) => (
            <div key={i} className="h-[92px] animate-pulse rounded-lg bg-surface-100" />
          ))}
      </div>
    );
  }

  const owed = data?.money?.owed ?? null;
  const period = data?.money?.open_period ?? null;
  const month = data?.money?.month;

  // Age the receivable, not the invoice count — 65 days out is a different
  // problem from 6 days out.
  const owedTone =
    owed?.oldest_days == null
      ? "text-foreground"
      : owed.oldest_days > 60
      ? "text-destructive"
      : owed.oldest_days >= 30
      ? "text-warning"
      : "text-foreground";

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      <Tile
        label="Owed to us"
        href="/invoices"
        sub={
          owed ? (
            <>
              {owed.invoice_count} open {plural(owed.invoice_count, "invoice")}
              {owed.oldest_days != null && ` · oldest ${owed.oldest_days} days`}
            </>
          ) : (
            "no invoices raised yet"
          )
        }
      >
        <p className={cn("mt-1 text-[24px] font-semibold leading-none tabular-nums", owedTone)}>
          {owed ? <Money value={owed.total} /> : "—"}
        </p>
      </Tile>

      <Tile
        label="Open pay period"
        href="/payroll"
        sub={
          period ? (
            <>
              {period.days_to_close > 0
                ? `closes in ${period.days_to_close} ${plural(period.days_to_close, "day")}`
                : period.days_to_close === 0
                ? "closes today"
                : `${Math.abs(period.days_to_close)} ${plural(
                    Math.abs(period.days_to_close),
                    "day"
                  )} past close`}
              {period.other_open > 0 && (
                <span className="text-warning">
                  {" · "}
                  {period.other_open} older {plural(period.other_open, "period")} still open
                </span>
              )}
            </>
          ) : (
            "no period currently processing"
          )
        }
      >
        <p className="mt-1 text-[24px] font-semibold leading-none tabular-nums text-foreground">
          {period ? <Money value={period.labour_cost} /> : "—"}
        </p>
      </Tile>

      <Tile
        label="This month"
        href="/reports"
        sub={
          month && !month.in_recorded
            ? "no payments recorded yet"
            : "payroll, receipts and purchase orders"
        }
      >
        <div className="mt-1.5 space-y-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[11px] text-foreground-lighter">In</span>
            {/* An empty payments table is not a measured zero. */}
            <span
              className={cn(
                "text-[15px] font-semibold tabular-nums",
                month?.in == null ? "text-foreground-lighter" : "text-success"
              )}
            >
              {month?.in == null ? "—" : <Money value={month.in} />}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[11px] text-foreground-lighter">Out</span>
            <span className="text-[15px] font-semibold tabular-nums text-foreground">
              {month ? <Money value={month.out} /> : "—"}
            </span>
          </div>
        </div>
      </Tile>
    </div>
  );
}

/* ── Band 2: needs attention ─────────────────────────────────────────────── */

function AttentionBand({
  rows,
  loading,
  failed,
}: {
  rows: AttentionRow[];
  loading: boolean;
  failed: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-100">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="font-mono text-[11px] uppercase tracking-widest text-foreground-lighter">
          Needs attention
        </span>
        {!loading && !failed && rows.length > 0 && (
          <span className="text-[11px] tabular-nums text-foreground-lighter">
            {rows.length} {plural(rows.length, "item")}
          </span>
        )}
      </div>

      {loading ? (
        <div className="divide-y divide-border">
          {Array(4)
            .fill(0)
            .map((_, i) => (
              <div key={i} className="h-[42px] animate-pulse" />
            ))}
        </div>
      ) : failed ? (
        <div className="px-4 py-6 text-center text-[12px] text-foreground-lighter">
          Could not run today&apos;s checks.
        </div>
      ) : rows.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <p className="text-[13px] text-foreground-light">All clear</p>
          <p className="mt-1 text-[11px] text-foreground-lighter">
            Nothing is overdue, unpriced or unrecorded.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {rows.map((row) => (
            <Link
              key={row.key}
              href={row.href}
              className="group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-200"
            >
              <span
                className={cn("h-1.5 w-1.5 flex-shrink-0 rounded-full", SEVERITY_DOT[row.severity])}
              />
              <span className="min-w-0 flex-1 truncate text-[13px] text-foreground-light transition-colors group-hover:text-foreground">
                {attentionSentence(row)}
              </span>
              <span className="flex-shrink-0 text-[11px] tabular-nums text-foreground-lighter">
                {row.count}
              </span>
              <ArrowRight className="h-3 w-3 flex-shrink-0 text-foreground-lighter opacity-0 transition-opacity group-hover:opacity-100" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Band 3: jobs by money ───────────────────────────────────────────────── */

function JobsBand({ jobs, loading }: { jobs: DashboardJob[]; loading: boolean }) {
  const top = jobs.slice(0, 8);

  return (
    <div className="rounded-lg border border-border bg-surface-100">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="font-mono text-[11px] uppercase tracking-widest text-foreground-lighter">
          Jobs by money
        </span>
        <Link
          href="/projects"
          className="flex items-center gap-1 text-[11px] text-foreground-lighter transition-colors hover:text-foreground-light"
        >
          All <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {loading ? (
        <div className="divide-y divide-border">
          {Array(5)
            .fill(0)
            .map((_, i) => (
              <div key={i} className="h-[46px] animate-pulse" />
            ))}
        </div>
      ) : top.length === 0 ? (
        <div className="px-4 py-8 text-center text-[12px] text-foreground-lighter">
          No active jobs
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-2.5 text-left font-mono text-[10px] uppercase tracking-widest text-foreground-lighter">
                  Job
                </th>
                <th className="px-4 py-2.5 text-left font-mono text-[10px] uppercase tracking-widest text-foreground-lighter">
                  Client
                </th>
                <th className="px-4 py-2.5 text-right font-mono text-[10px] uppercase tracking-widest text-foreground-lighter">
                  Contract
                </th>
                <th className="px-4 py-2.5 text-right font-mono text-[10px] uppercase tracking-widest text-foreground-lighter">
                  Labour
                </th>
                <th className="px-4 py-2.5 text-right font-mono text-[10px] uppercase tracking-widest text-foreground-lighter">
                  Materials
                </th>
                <th className="w-[132px] px-4 py-2.5 text-left font-mono text-[10px] uppercase tracking-widest text-foreground-lighter">
                  Spent
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {top.map((job) => {
                const over = job.spent_pct != null && job.spent_pct > 80;
                return (
                  <tr
                    key={job.id}
                    className={cn("group transition-colors hover:bg-surface-200", over && "bg-destructive-subtle")}
                  >
                    <td className="max-w-[260px] px-4 py-2.5">
                      <Link
                        href={`/projects/${job.id}`}
                        className="block truncate text-[13px] text-foreground-light transition-colors group-hover:text-foreground"
                      >
                        {job.name}
                      </Link>
                    </td>
                    <td className="max-w-[160px] truncate px-4 py-2.5 text-[13px] text-foreground-lighter">
                      {job.client || "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right text-[13px] tabular-nums text-foreground-lighter">
                      {job.contract > 0 ? money(job.contract) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right text-[13px] tabular-nums text-foreground-light">
                      {money(job.labour)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-[13px] tabular-nums text-foreground-lighter">
                      {job.materials > 0 ? money(job.materials) : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      {/* No budget means no percentage — not 0%, and never a
                          divide-by-zero. */}
                      {!job.has_budget || job.spent_pct == null ? (
                        <span className="inline-flex items-center rounded-full border border-warning-border bg-warning-subtle px-[6px] py-[3px] text-[10px] font-medium uppercase tracking-[0.06em] text-warning">
                          no budget
                        </span>
                      ) : (
                        <div>
                          <div className="flex items-baseline justify-between gap-2">
                            <span
                              className={cn(
                                "text-[12px] tabular-nums",
                                over ? "text-destructive" : "text-foreground-light"
                              )}
                            >
                              {job.spent_pct.toFixed(0)}%
                            </span>
                          </div>
                          <div className="mt-1 h-[2px] overflow-hidden rounded-full bg-border">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all duration-500",
                                over ? "bg-destructive" : "bg-primary"
                              )}
                              style={{ width: `${Math.min(job.spent_pct, 100)}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── Band 4: this week ───────────────────────────────────────────────────── */

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function WeekBand({
  week,
  loading,
}: {
  week: DashboardSummary["week"] | undefined;
  loading: boolean;
}) {
  if (loading) {
    return <div className="h-[86px] animate-pulse rounded-lg bg-surface-100" />;
  }
  if (!week?.days?.length) return null;

  const peak = Math.max(...week.days.map((d) => d.hours), 1);
  const delta = week.hours_this_week - week.hours_last_week;

  return (
    <div className="rounded-lg border border-border bg-surface-100">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="font-mono text-[11px] uppercase tracking-widest text-foreground-lighter">
          This week
        </span>
        <Link
          href="/time-tracking"
          className="flex items-center gap-1 text-[11px] text-foreground-lighter transition-colors hover:text-foreground-light"
        >
          Time <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="flex flex-col gap-4 px-4 py-3 md:flex-row md:items-center">
        <div className="flex flex-1 items-end gap-1">
          {week.days.map((day, i) => {
            const isToday = day.date === week.today;
            return (
              <div key={day.date} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-[10px] tabular-nums text-foreground-lighter">
                  {day.hours > 0 ? day.hours.toFixed(0) : ""}
                </span>
                <div className="flex h-8 w-full items-end">
                  <div
                    className={cn(
                      "w-full rounded-sm transition-all",
                      day.hours > 0 ? (isToday ? "bg-primary" : "bg-stronger") : "bg-border"
                    )}
                    style={{ height: `${Math.max((day.hours / peak) * 100, 4)}%` }}
                  />
                </div>
                <span
                  className={cn(
                    "font-mono text-[10px] uppercase tracking-wide",
                    isToday ? "text-brand" : "text-foreground-lighter"
                  )}
                >
                  {DAY_LABELS[i]}
                </span>
              </div>
            );
          })}
        </div>

        <div className="flex gap-6 md:border-l md:border-border md:pl-6">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-foreground-lighter">
              Hours
            </p>
            <p className="mt-0.5 text-[15px] font-semibold tabular-nums text-foreground">
              {week.hours_this_week.toFixed(0)}
            </p>
            <p className="text-[11px] tabular-nums text-foreground-lighter">
              {delta === 0
                ? "same as last week"
                : `${delta > 0 ? "+" : ""}${delta.toFixed(0)} vs last week`}
            </p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-foreground-lighter">
              Crew today
            </p>
            <p className="mt-0.5 text-[15px] font-semibold tabular-nums text-foreground">
              {week.crew_today}
            </p>
            {week.last_workday && (
              <p className="text-[11px] text-foreground-lighter">
                last logged {shortDate(week.last_workday)}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
