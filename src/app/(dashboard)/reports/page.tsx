"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Header } from "@/components/layout/header";
import { Status, type Tone } from "@/components/ui/status";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { cn, formatCurrency, calculatePercentage } from "@/lib/utils";
import { Download } from "lucide-react";
import type { Project } from "@/types";

interface ProjectCostData {
  project_id: string;
  project_name: string;
  budget: number;
  contract_value: number;
  labor_cost: number;
  material_cost: number;
  equipment_cost: number;
  overhead_cost: number;
  total_cost: number;
  budget_variance: number;
  profit_margin_percent: number;
}

interface WorkerHoursData {
  worker_id: string;
  first_name: string;
  last_name: string;
  total_regular_hours: number;
  total_overtime_hours: number;
  total_earnings: number;
}

type TabKey = "project-costs" | "cost-breakdown" | "worker-hours";
type RangeKey = "this_week" | "this_month" | "this_quarter" | "this_year" | "all_time";

const TABS: { key: TabKey; label: string }[] = [
  { key: "project-costs", label: "Project Costs" },
  { key: "cost-breakdown", label: "Cost Breakdown" },
  { key: "worker-hours", label: "Worker Hours" },
];

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "this_week", label: "This Week" },
  { key: "this_month", label: "This Month" },
  { key: "this_quarter", label: "This Quarter" },
  { key: "this_year", label: "This Year" },
  { key: "all_time", label: "All Time" },
];

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Inclusive [from, to] for a range key; null means no date bound. */
function rangeBounds(range: RangeKey): { from: string; to: string } | null {
  if (range === "all_time") return null;
  const now = new Date();
  const to = isoOf(now);
  const start = new Date(now);
  switch (range) {
    case "this_week":
      start.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      break;
    case "this_month":
      start.setDate(1);
      break;
    case "this_quarter":
      start.setMonth(Math.floor(now.getMonth() / 3) * 3, 1);
      break;
    case "this_year":
      start.setMonth(0, 1);
      break;
  }
  return { from: isoOf(start), to };
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const escape = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map((r) => r.map(escape).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const { profile, loading: authLoading } = useAuth();
  const [projectCosts, setProjectCosts] = useState<ProjectCostData[]>([]);
  const [workerHours, setWorkerHours] = useState<WorkerHoursData[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState<string>("all");
  const [dateRange, setDateRange] = useState<RangeKey>("this_month");
  const [tab, setTab] = useState<TabKey>("project-costs");
  const supabase = createClient();

  const fetchData = useCallback(async () => {
    if (!profile?.company_id) return;
    setLoading(true);
    try {
      const { data: projectsData } = await supabase
        .from("projects")
        .select("*")
        .eq("company_id", profile.company_id)
        .order("name");
      setProjects(projectsData || []);

      const projectIds = projectsData?.map((p) => p.id) || [];
      const { data: costData } = await supabase
        .from("project_cost_summary")
        .select("*")
        .in("project_id", selectedProject === "all" ? projectIds : [selectedProject]);
      setProjectCosts(costData || []);

      // One query for every worker's hours in range, rather than a query per
      // worker. The date bound is what makes the range selector mean anything.
      let entriesQuery = supabase
        .from("time_entries")
        .select(
          "worker_id, regular_hours, overtime_hours, workers!inner(id, first_name, last_name, hourly_rate, overtime_rate_multiplier, status)"
        )
        .eq("company_id", profile.company_id)
        .eq("workers.status", "active");

      const bounds = rangeBounds(dateRange);
      if (bounds) entriesQuery = entriesQuery.gte("date", bounds.from).lte("date", bounds.to);
      if (selectedProject !== "all") entriesQuery = entriesQuery.eq("project_id", selectedProject);

      const { data: entries } = await entriesQuery;

      const byWorker = new Map<string, WorkerHoursData>();
      (entries || []).forEach((e: any) => {
        const w = e.workers;
        if (!w) return;
        const existing =
          byWorker.get(e.worker_id) ??
          {
            worker_id: e.worker_id,
            first_name: w.first_name,
            last_name: w.last_name,
            total_regular_hours: 0,
            total_overtime_hours: 0,
            total_earnings: 0,
          };
        const rate = Number(w.hourly_rate) || 0;
        const mult = Number(w.overtime_rate_multiplier) || 1.5;
        const reg = Number(e.regular_hours) || 0;
        const ot = Number(e.overtime_hours) || 0;
        existing.total_regular_hours += reg;
        existing.total_overtime_hours += ot;
        existing.total_earnings += reg * rate + ot * rate * mult;
        byWorker.set(e.worker_id, existing);
      });

      setWorkerHours([...byWorker.values()].sort((a, b) => b.total_earnings - a.total_earnings));
    } catch (error) {
      console.error("Error fetching report data:", error);
    } finally {
      setLoading(false);
    }
  }, [profile?.company_id, selectedProject, dateRange]);

  useEffect(() => {
    if (authLoading) return;
    if (profile && !profile.company_id) {
      setLoading(false);
      return;
    }
    if (profile?.company_id) fetchData();
    else if (profile === null) setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, profile, fetchData]);

  const totals = useMemo(() => {
    const revenue = projectCosts.reduce((s, p) => s + p.contract_value, 0);
    const costs = projectCosts.reduce((s, p) => s + p.total_cost, 0);
    return {
      revenue,
      costs,
      profit: revenue - costs,
      avgMargin:
        projectCosts.length > 0
          ? projectCosts.reduce((s, p) => s + p.profit_margin_percent, 0) / projectCosts.length
          : 0,
      labor: projectCosts.reduce((s, p) => s + p.labor_cost, 0),
      material: projectCosts.reduce((s, p) => s + p.material_cost, 0),
      equipment: projectCosts.reduce((s, p) => s + p.equipment_cost, 0),
      overhead: projectCosts.reduce((s, p) => s + p.overhead_cost, 0),
      workerHours: workerHours.reduce(
        (s, w) => s + w.total_regular_hours + w.total_overtime_hours,
        0
      ),
      workerOt: workerHours.reduce((s, w) => s + w.total_overtime_hours, 0),
      workerRegular: workerHours.reduce((s, w) => s + w.total_regular_hours, 0),
      workerEarnings: workerHours.reduce((s, w) => s + w.total_earnings, 0),
    };
  }, [projectCosts, workerHours]);

  const hasCostData = projectCosts.length > 0;
  const rangeLabel = RANGES.find((r) => r.key === dateRange)?.label ?? "";

  const handleExport = () => {
    if (tab === "worker-hours") {
      downloadCsv(`worker-hours-${dateRange}.csv`, [
        ["Worker", "Regular Hours", "Overtime Hours", "Total Hours", "Earnings"],
        ...workerHours.map((w) => [
          `${w.first_name} ${w.last_name}`,
          w.total_regular_hours.toFixed(1),
          w.total_overtime_hours.toFixed(1),
          (w.total_regular_hours + w.total_overtime_hours).toFixed(1),
          w.total_earnings.toFixed(2),
        ]),
      ]);
      return;
    }
    downloadCsv(`project-costs-${dateRange}.csv`, [
      ["Project", "Contract Value", "Labor", "Materials", "Equipment", "Overhead", "Total Cost", "Budget Variance", "Profit Margin %"],
      ...projectCosts.map((p) => [
        p.project_name,
        p.contract_value.toFixed(2),
        p.labor_cost.toFixed(2),
        p.material_cost.toFixed(2),
        p.equipment_cost.toFixed(2),
        p.overhead_cost.toFixed(2),
        p.total_cost.toFixed(2),
        p.budget_variance.toFixed(2),
        p.profit_margin_percent.toFixed(1),
      ]),
    ]);
  };

  const stats = [
    {
      label: "Total Revenue",
      value: hasCostData ? formatCurrency(totals.revenue) : "—",
      sub: hasCostData ? `From ${projectCosts.length} projects` : "No cost data",
    },
    {
      label: "Total Costs",
      value: hasCostData ? formatCurrency(totals.costs) : "—",
      sub: "Labour, materials, overhead",
    },
    {
      label: "Net Profit",
      value: hasCostData ? formatCurrency(totals.profit) : "—",
      sub: hasCostData ? `Avg margin ${totals.avgMargin.toFixed(1)}%` : "Needs cost data",
      tone: hasCostData ? (totals.profit >= 0 ? "success" : "danger") : undefined,
    },
    {
      label: "Labour Hours",
      value: totals.workerHours.toFixed(0),
      sub: `${workerHours.length} workers · ${rangeLabel.toLowerCase()}`,
      accent: true,
    },
  ];

  const th = "px-5 py-2.5 text-[10px] font-mono uppercase tracking-widest text-foreground-lighter";

  const costBars: { label: string; value: number; bar: string }[] = [
    { label: "Labour", value: totals.labor, bar: "bg-info-solid" },
    { label: "Materials", value: totals.material, bar: "bg-success-solid" },
    { label: "Equipment", value: totals.equipment, bar: "bg-warning-solid" },
    { label: "Overhead", value: totals.overhead, bar: "bg-foreground-lighter" },
  ];

  return (
    <div className="flex flex-col h-full overflow-auto bg-background">
      <Header eyebrow="Insights" title="Reports">
        <button
          onClick={handleExport}
          disabled={loading || (tab === "worker-hours" ? workerHours.length === 0 : !hasCostData)}
          className="flex items-center gap-1.5 text-[12px] text-foreground-lighter hover:text-foreground-light transition-colors disabled:opacity-40"
        >
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </button>
      </Header>

      <div className="flex-1 p-6 space-y-5">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <Select value={selectedProject} onValueChange={setSelectedProject}>
            <SelectTrigger className="h-8 w-[260px] bg-surface-100 border-border text-foreground-light text-[13px] focus:ring-0">
              <SelectValue placeholder="All projects" />
            </SelectTrigger>
            <SelectContent className="bg-surface-100 border-strong">
              <SelectItem value="all" className="text-[13px] text-foreground-light">
                All projects
              </SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id} className="text-[13px] text-foreground-light">
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1 flex-wrap">
            {RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => setDateRange(r.key)}
                className={cn(
                  "px-2.5 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-wide transition-colors",
                  dateRange === r.key
                    ? "bg-surface-300 text-brand border border-strong"
                    : "text-foreground-lighter hover:text-foreground-light"
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {stats.map((s) => (
            <div key={s.label} className="rounded-lg border border-border bg-surface-100 px-4 py-3.5">
              <p className="text-[11px] font-mono text-foreground-lighter uppercase tracking-wider">
                {s.label}
              </p>
              <p
                className={cn(
                  "text-[22px] font-semibold tabular-nums mt-1 leading-none",
                  s.tone === "danger"
                    ? "text-destructive"
                    : s.tone === "success"
                      ? "text-success"
                      : s.accent
                        ? "text-brand"
                        : "text-foreground"
                )}
              >
                {s.value}
              </p>
              <p className="text-[11px] text-foreground-lighter mt-1.5">{s.sub}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "px-2.5 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-wide transition-colors",
                tab === t.key
                  ? "bg-surface-300 text-brand border border-strong"
                  : "text-foreground-lighter hover:text-foreground-light"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Project costs */}
        {tab === "project-costs" && (
          <div className="rounded-lg border border-border bg-surface-100 overflow-hidden">
            <div className="flex items-baseline justify-between px-5 py-2.5 border-b border-border">
              <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">
                Project Profitability
              </p>
              <p className="text-[11px] text-foreground-lighter">
                Project to date — not limited by the date range
              </p>
            </div>
            {loading ? (
              <div className="divide-y divide-border">
                {Array(5).fill(0).map((_, i) => <div key={i} className="h-[52px] animate-pulse" />)}
              </div>
            ) : projectCosts.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-[13px] text-foreground-lighter">No cost data for these projects</p>
                <p className="text-[11px] text-foreground-lighter mt-1.5">
                  Costs roll up from logged time, materials and receipts.
                </p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className={cn(th, "text-left")}>Project</th>
                    <th className={cn(th, "text-right")}>Contract</th>
                    <th className={cn(th, "text-right")}>Cost</th>
                    <th className={cn(th, "text-right")}>Variance</th>
                    <th className={cn(th, "text-right")}>Margin</th>
                    <th className={cn(th, "text-left")}>Health</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {projectCosts.map((project) => {
                    const margin = project.profit_margin_percent;
                    const tone: Tone = margin >= 20 ? "success" : margin >= 0 ? "warning" : "danger";
                    const label = margin >= 20 ? "healthy" : margin >= 0 ? "marginal" : "loss";
                    return (
                      <tr key={project.project_id} className="group hover:bg-surface-200 transition-colors">
                        <td className="px-5 py-3 text-[13px] text-foreground-light max-w-[260px] truncate">
                          {project.project_name}
                        </td>
                        <td className="px-5 py-3 text-right text-[13px] tabular-nums text-foreground-light">
                          {formatCurrency(project.contract_value)}
                        </td>
                        <td className="px-5 py-3 text-right text-[13px] tabular-nums text-foreground-lighter">
                          {formatCurrency(project.total_cost)}
                        </td>
                        <td className="px-5 py-3 text-right text-[13px] tabular-nums">
                          <span className={project.budget_variance >= 0 ? "text-foreground-light" : "text-destructive"}>
                            {formatCurrency(project.budget_variance)}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <span className="h-1 w-14 rounded-full bg-surface-300 overflow-hidden">
                              <span
                                className={cn(
                                  "block h-full rounded-full",
                                  margin >= 20 ? "bg-success-solid" : margin >= 0 ? "bg-warning-solid" : "bg-destructive-solid"
                                )}
                                style={{ width: `${Math.max(0, Math.min(100, margin))}%` }}
                              />
                            </span>
                            <span className="text-[12px] tabular-nums text-foreground-lighter w-12 text-right">
                              {margin.toFixed(1)}%
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <Status tone={tone} label={label} muted={tone === "success"} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Cost breakdown */}
        {tab === "cost-breakdown" && (
          <div className="grid gap-5 lg:grid-cols-2 items-start">
            <div className="rounded-lg border border-border bg-surface-100 overflow-hidden">
              <div className="px-5 py-2.5 border-b border-border">
                <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">
                  Cost Distribution
                </p>
              </div>
              <div className="px-5 py-4 space-y-4">
                {costBars.map((c) => {
                  const pct = calculatePercentage(c.value, totals.costs);
                  return (
                    <div key={c.label} className="space-y-1.5">
                      <div className="flex items-baseline justify-between">
                        <span className="flex items-center gap-2 text-[12px] text-foreground-light">
                          <span className={cn("h-1.5 w-1.5 rounded-full", c.bar)} />
                          {c.label}
                        </span>
                        <span className="text-[12px] tabular-nums text-foreground-light">
                          {formatCurrency(c.value)}
                          <span className="text-foreground-lighter ml-2">{pct.toFixed(1)}%</span>
                        </span>
                      </div>
                      <span className="block h-1 rounded-full bg-surface-300 overflow-hidden">
                        <span className={cn("block h-full rounded-full", c.bar)} style={{ width: `${pct}%` }} />
                      </span>
                    </div>
                  );
                })}
                {!hasCostData && (
                  <p className="text-[12px] text-foreground-lighter pt-1">
                    Nothing to break down yet — no project cost data.
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-surface-100 overflow-hidden">
              <div className="px-5 py-2.5 border-b border-border">
                <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">
                  Financial Summary
                </p>
              </div>
              <div className="divide-y divide-border">
                {[
                  { label: "Total contract value", value: formatCurrency(totals.revenue) },
                  { label: "Total expenses", value: formatCurrency(totals.costs) },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between px-5 py-3.5">
                    <span className="text-[12px] text-foreground-lighter">{row.label}</span>
                    <span className="text-[15px] tabular-nums font-semibold text-foreground">
                      {row.value}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between px-5 py-3.5">
                  <div>
                    <span className="text-[12px] text-foreground-lighter">Net profit / loss</span>
                    {totals.revenue > 0 && (
                      <p className="text-[11px] tabular-nums text-foreground-lighter mt-0.5">
                        {((totals.profit / totals.revenue) * 100).toFixed(1)}% margin
                      </p>
                    )}
                  </div>
                  <span
                    className={cn(
                      "text-[20px] tabular-nums font-semibold",
                      totals.profit >= 0 ? "text-success" : "text-destructive"
                    )}
                  >
                    {formatCurrency(totals.profit)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Worker hours */}
        {tab === "worker-hours" && (
          <div className="rounded-lg border border-border bg-surface-100 overflow-hidden">
            <div className="flex items-baseline justify-between px-5 py-2.5 border-b border-border">
              <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">
                Worker Hours
              </p>
              <p className="text-[11px] text-foreground-lighter">{rangeLabel}</p>
            </div>
            {loading ? (
              <div className="divide-y divide-border">
                {Array(6).fill(0).map((_, i) => <div key={i} className="h-[52px] animate-pulse" />)}
              </div>
            ) : workerHours.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-[13px] text-foreground-lighter">
                  No hours logged in {rangeLabel.toLowerCase()}
                </p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className={cn(th, "text-left")}>Worker</th>
                    <th className={cn(th, "text-right")}>Regular</th>
                    <th className={cn(th, "text-right")}>Overtime</th>
                    <th className={cn(th, "text-right")}>Total</th>
                    <th className={cn(th, "text-right")}>Earnings</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {workerHours.map((worker) => (
                    <tr key={worker.worker_id} className="group hover:bg-surface-200 transition-colors">
                      <td className="px-5 py-3 text-[13px] text-foreground-light">
                        {worker.first_name} {worker.last_name}
                      </td>
                      <td className="px-5 py-3 text-right text-[13px] tabular-nums text-foreground-lighter">
                        {worker.total_regular_hours.toFixed(1)}
                      </td>
                      <td className="px-5 py-3 text-right text-[13px] tabular-nums">
                        {worker.total_overtime_hours > 0 ? (
                          <span className="text-brand">{worker.total_overtime_hours.toFixed(1)}</span>
                        ) : (
                          <span className="text-foreground-lighter">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right text-[13px] tabular-nums text-foreground-light">
                        {(worker.total_regular_hours + worker.total_overtime_hours).toFixed(1)}
                      </td>
                      <td className="px-5 py-3 text-right text-[13px] tabular-nums text-foreground-light">
                        {formatCurrency(worker.total_earnings)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border">
                    <td className="px-5 py-2.5">
                      <span className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">
                        Total
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-right text-[12px] tabular-nums text-foreground-lighter">
                      {totals.workerRegular.toFixed(1)}
                    </td>
                    <td className="px-5 py-2.5 text-right text-[12px] tabular-nums text-brand">
                      {totals.workerOt > 0 ? totals.workerOt.toFixed(1) : "—"}
                    </td>
                    <td className="px-5 py-2.5 text-right text-[12px] tabular-nums text-foreground-light">
                      {totals.workerHours.toFixed(1)}
                    </td>
                    <td className="px-5 py-2.5 text-right text-[13px] tabular-nums font-semibold text-brand">
                      {formatCurrency(totals.workerEarnings)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
