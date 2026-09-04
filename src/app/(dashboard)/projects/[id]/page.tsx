"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  formatCurrency,
  formatDate,
  calculatePercentage,
} from "@/lib/utils";
import type { Project, ProjectMilestone, TimeEntry, MaterialAllocation, PurchaseOrder } from "@/types";

const STATUS_DOT: Record<string, string> = {
  active:      "bg-success",
  in_progress: "bg-success",
  planning:    "bg-info",
  not_started: "bg-info",
  completed:   "bg-foreground-lighter",
  paused:      "bg-warning",
  on_hold:     "bg-warning",
  cancelled:   "bg-destructive",
};

type Tab = "overview" | "milestones" | "costs" | "purchases" | "time" | "materials";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview",   label: "Overview"   },
  { id: "milestones", label: "Milestones" },
  { id: "costs",      label: "Costs"      },
  { id: "purchases",  label: "Purchases"  },
  { id: "time",       label: "Time"       },
  { id: "materials",  label: "Materials"  },
];

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const [project, setProject] = useState<Project | null>(null);
  const [milestones, setMilestones] = useState<ProjectMilestone[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [allocations, setAllocations] = useState<MaterialAllocation[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [costSummary, setCostSummary] = useState({ labor: 0, materials: 0, equipment: 0, overhead: 0, total: 0 });
  const supabase = createClient();

  useEffect(() => {
    if (params.id) fetchProjectData();
  }, [params.id]);

  const fetchProjectData = async () => {
    try {
      const { data: projectData, error: projectError } = await supabase
        .from("projects").select("*").eq("id", params.id).single();
      if (projectError) throw projectError;
      setProject(projectData);

      const [milestonesRes, timeRes, allocRes, poRes, costRes] = await Promise.all([
        supabase.from("project_milestones").select("*").eq("project_id", params.id).order("order_index"),
        supabase.from("time_entries").select("*, workers(first_name, last_name)").eq("project_id", params.id).order("date", { ascending: false }).limit(10),
        supabase.from("material_allocations").select("*, materials(name, unit, unit_cost)").eq("project_id", params.id).order("allocated_date", { ascending: false }),
        supabase.from("purchase_orders").select("*, vendors(name)").eq("project_id", params.id).order("order_date", { ascending: false }),
        supabase.from("project_cost_summary").select("*").eq("project_id", params.id).single(),
      ]);

      setMilestones(milestonesRes.data || []);
      setTimeEntries(timeRes.data || []);
      setAllocations(allocRes.data || []);
      setPurchaseOrders(poRes.data || []);
      if (costRes.data) {
        setCostSummary({
          labor:     costRes.data.labor_cost    || 0,
          materials: costRes.data.material_cost || 0,
          equipment: costRes.data.equipment_cost|| 0,
          overhead:  costRes.data.overhead_cost || 0,
          total:     costRes.data.total_cost    || 0,
        });
      }
    } catch (error) {
      console.error("Error fetching project data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this project?")) return;
    const { data, error } = await supabase.from("projects").delete().eq("id", params.id).select();
    if (error || !data?.length) {
      toast({ title: "Could not delete", variant: "destructive" });
      return;
    }
    toast({ title: "Deleted" });
    router.push("/projects");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <div className="h-5 w-5 rounded-full border border-strong border-t-primary animate-spin" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-background">
        <p className="text-[13px] text-foreground-lighter">Project not found</p>
        <Link href="/projects" className="mt-3 text-[12px] text-brand hover:opacity-80">← Back to jobs</Link>
      </div>
    );
  }

  const completedMilestones = milestones.filter((m) => m.is_completed).length;
  const milestoneProgress = milestones.length > 0 ? calculatePercentage(completedMilestones, milestones.length) : 0;
  const budgetUsed = calculatePercentage(costSummary.total, project.budget);
  const poTotal = purchaseOrders.reduce((s, po) => s + (po.total_amount || 0), 0);
  const grandTotal = costSummary.total + poTotal;

  return (
    <div className="flex flex-col h-full overflow-auto bg-background">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-4 min-w-0">
          <Link href="/projects" className="text-[11px] tabular-nums text-foreground-lighter hover:text-foreground-light transition-colors flex-shrink-0">
            ← Jobs
          </Link>
          <div className="h-3 w-px bg-surface-400 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-[11px] font-mono text-foreground-lighter uppercase tracking-widest truncate">{project.location}</p>
            <h1 className="text-[16px] font-semibold text-foreground mt-0.5 truncate">{project.name}</h1>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[project.status] ?? "bg-foreground-lighter")} />
            <span className="text-[11px] tabular-nums text-foreground-lighter capitalize">{project.status.replace("_", " ")}</span>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <Link href={`/projects/${project.id}/edit`} className="text-[12px] text-foreground-lighter hover:text-foreground-light transition-colors">
            Edit
          </Link>
          <button onClick={handleDelete} className="text-[12px] text-foreground-lighter hover:text-destructive transition-colors">
            Delete
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="px-6 py-4 border-b border-border grid grid-cols-4 gap-3 flex-shrink-0">
        <div className="rounded-lg border border-border bg-surface-100 px-4 py-3.5">
          <p className="text-[11px] font-mono text-foreground-lighter uppercase tracking-wider">Budget</p>
          <p className="text-[20px] font-semibold tabular-nums text-foreground mt-1 leading-none">
            {formatCurrency(project.budget)}
          </p>
          <div className="mt-2 h-[2px] bg-surface-200 rounded-full overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", budgetUsed > 90 ? "bg-destructive" : "bg-primary")}
              style={{ width: `${Math.min(budgetUsed, 100)}%` }}
            />
          </div>
          <p className="text-[10px] tabular-nums text-foreground-lighter mt-1">{budgetUsed.toFixed(1)}% used</p>
        </div>

        <div className="rounded-lg border border-border bg-surface-100 px-4 py-3.5">
          <p className="text-[11px] font-mono text-foreground-lighter uppercase tracking-wider">Contract</p>
          <p className="text-[20px] font-semibold tabular-nums text-foreground mt-1 leading-none">
            {formatCurrency(project.contract_value)}
          </p>
          <p className={cn(
            "text-[10px] tabular-nums mt-1",
            project.contract_value - grandTotal < 0 ? "text-destructive" : "text-success"
          )}>
            {project.contract_value - grandTotal >= 0 ? "+" : ""}{formatCurrency(project.contract_value - grandTotal)} profit
          </p>
        </div>

        <div className="rounded-lg border border-border bg-surface-100 px-4 py-3.5">
          <p className="text-[11px] font-mono text-foreground-lighter uppercase tracking-wider">Milestones</p>
          <p className="text-[20px] font-semibold tabular-nums text-foreground mt-1 leading-none">
            {completedMilestones}<span className="text-foreground-lighter">/{milestones.length}</span>
          </p>
          <div className="mt-2 h-[2px] bg-surface-200 rounded-full overflow-hidden">
            <div className="h-full bg-success rounded-full" style={{ width: `${milestoneProgress}%` }} />
          </div>
          <p className="text-[10px] tabular-nums text-foreground-lighter mt-1">{milestoneProgress.toFixed(0)}% complete</p>
        </div>

        <div className="rounded-lg border border-border bg-surface-100 px-4 py-3.5">
          <p className="text-[11px] font-mono text-foreground-lighter uppercase tracking-wider">Started</p>
          <p className="text-[15px] font-semibold tabular-nums text-foreground mt-1">{formatDate(project.start_date)}</p>
          {project.estimated_end_date && (
            <p className="text-[11px] tabular-nums text-foreground-lighter mt-1">ends {formatDate(project.estimated_end_date)}</p>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="px-6 flex items-center gap-0 border-b border-border flex-shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "px-4 py-3 text-[12px] tabular-nums transition-colors border-b-2 -mb-px",
              activeTab === tab.id
                ? "text-foreground border-primary"
                : "text-foreground-lighter border-transparent hover:text-foreground-light"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 p-6 overflow-auto">

        {/* OVERVIEW */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg border border-border bg-surface-100">
              <div className="px-4 py-3 border-b border-border">
                <span className="text-[11px] font-mono text-foreground-lighter uppercase tracking-widest">Job Info</span>
              </div>
              <div className="px-4 py-4 space-y-3">
                {project.description && (
                  <div>
                    <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest mb-1">Description</p>
                    <p className="text-[13px] text-foreground-lighter">{project.description}</p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest mb-1">Location</p>
                    <p className="text-[13px] text-foreground-light">{project.location}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest mb-1">Start</p>
                    <p className="text-[13px] text-foreground-light">{formatDate(project.start_date)}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-surface-100">
              <div className="px-4 py-3 border-b border-border">
                <span className="text-[11px] font-mono text-foreground-lighter uppercase tracking-widest">Client</span>
              </div>
              <div className="px-4 py-4 space-y-2.5">
                <p className="text-[14px] font-semibold text-foreground">{project.client_name}</p>
                {project.client_email && (
                  <a href={`mailto:${project.client_email}`} className="block text-[13px] text-foreground-lighter hover:text-foreground-light transition-colors">
                    {project.client_email}
                  </a>
                )}
                {project.client_phone && (
                  <a href={`tel:${project.client_phone}`} className="block text-[13px] text-foreground-lighter hover:text-foreground-light transition-colors">
                    {project.client_phone}
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        {/* MILESTONES */}
        {activeTab === "milestones" && (
          <div className="rounded-lg border border-border bg-surface-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <span className="text-[11px] font-mono text-foreground-lighter uppercase tracking-widest">Milestones</span>
              <span className="text-[11px] tabular-nums text-foreground-lighter">{completedMilestones}/{milestones.length} done</span>
            </div>
            {milestones.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-[13px] text-foreground-lighter">No milestones defined</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {milestones.map((m) => (
                  <div key={m.id} className="flex items-center gap-4 px-4 py-3.5">
                    <div className={cn(
                      "h-2 w-2 rounded-full flex-shrink-0",
                      m.is_completed ? "bg-success" : "bg-surface-400 border border-strong"
                    )} />
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-[13px]", m.is_completed ? "text-foreground-lighter line-through" : "text-foreground-light")}>
                        {m.name}
                      </p>
                      {m.description && (
                        <p className="text-[11px] text-foreground-lighter mt-0.5 truncate">{m.description}</p>
                      )}
                    </div>
                    <p className="text-[11px] tabular-nums text-foreground-lighter flex-shrink-0">{formatDate(m.due_date)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* COSTS */}
        {activeTab === "costs" && (
          <div className="space-y-4">
            <div className="grid grid-cols-5 gap-3">
              {[
                { label: "Labor",     value: costSummary.labor },
                { label: "Materials", value: costSummary.materials },
                { label: "POs",       value: poTotal },
                { label: "Equipment", value: costSummary.equipment },
                { label: "Overhead",  value: costSummary.overhead },
              ].map((c) => (
                <div key={c.label} className="rounded-lg border border-border bg-surface-100 px-4 py-3.5">
                  <p className="text-[11px] font-mono text-foreground-lighter uppercase tracking-wider">{c.label}</p>
                  <p className="text-[18px] font-semibold tabular-nums text-foreground mt-1 leading-none">
                    {formatCurrency(c.value)}
                  </p>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-border bg-surface-100">
              <div className="px-4 py-3 border-b border-border">
                <span className="text-[11px] font-mono text-foreground-lighter uppercase tracking-widest">Total Cost Breakdown</span>
              </div>
              <div className="px-4 py-4 space-y-3">
                <p className="text-[28px] font-semibold tabular-nums text-brand">{formatCurrency(grandTotal)}</p>
                <div className="space-y-1.5">
                  {[
                    { label: "Labor",              value: costSummary.labor },
                    { label: "Materials (alloc.)", value: costSummary.materials },
                    { label: "Purchase Orders",    value: poTotal },
                    { label: "Equipment",          value: costSummary.equipment },
                    { label: "Overhead",           value: costSummary.overhead },
                  ].map((r) => (
                    <div key={r.label} className="flex items-center gap-3">
                      <div className="flex items-center justify-between flex-1">
                        <span className="text-[12px] text-foreground-lighter">{r.label}</span>
                        <span className="text-[12px] tabular-nums text-foreground-lighter">
                          {calculatePercentage(r.value, grandTotal || 1).toFixed(1)}%
                        </span>
                      </div>
                      <div className="w-32 h-[2px] bg-surface-300 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-surface-300 rounded-full"
                          style={{ width: `${calculatePercentage(r.value, grandTotal || 1)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="pt-3 border-t border-border grid grid-cols-4 gap-3">
                  {[
                    { label: "Budget",     value: formatCurrency(project.budget) },
                    { label: "Remaining",  value: formatCurrency(project.budget - grandTotal), colored: true, val: project.budget - grandTotal },
                    { label: "Contract",   value: formatCurrency(project.contract_value) },
                    { label: "Est. Profit",value: formatCurrency(project.contract_value - grandTotal), colored: true, val: project.contract_value - grandTotal },
                  ].map((r) => (
                    <div key={r.label}>
                      <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest mb-1">{r.label}</p>
                      <p className={cn(
                        "text-[13px] tabular-nums font-semibold",
                        r.colored ? (r.val! < 0 ? "text-destructive" : "text-success") : "text-foreground-light"
                      )}>
                        {r.value}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* PURCHASES */}
        {activeTab === "purchases" && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "PO Spend",  value: formatCurrency(poTotal) },
                { label: "Orders",    value: purchaseOrders.length },
                { label: "Vendors",   value: new Set(purchaseOrders.map((po) => po.vendor_id)).size },
              ].map((s) => (
                <div key={s.label} className="rounded-lg border border-border bg-surface-100 px-4 py-3.5">
                  <p className="text-[11px] font-mono text-foreground-lighter uppercase tracking-wider">{s.label}</p>
                  <p className="text-[22px] font-semibold tabular-nums text-foreground mt-1 leading-none">{s.value}</p>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-border bg-surface-100 overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <span className="text-[11px] font-mono text-foreground-lighter uppercase tracking-widest">Purchase Orders</span>
                <Link href="/vendors?tab=purchase-orders" className="text-[11px] text-brand hover:opacity-80">
                  + New PO
                </Link>
              </div>
              {purchaseOrders.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-[13px] text-foreground-lighter">No purchase orders linked</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {purchaseOrders.map((po) => (
                    <div key={po.id} className="flex items-center justify-between px-4 py-3.5 hover:bg-surface-200 transition-colors">
                      <div>
                        <p className="text-[13px] text-foreground-light tabular-nums">{po.po_number}</p>
                        <p className="text-[11px] text-foreground-lighter mt-0.5">
                          {po.vendors?.name} · {po.order_date ? formatDate(po.order_date) : "No date"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[13px] tabular-nums font-semibold text-foreground">
                          {formatCurrency(po.total_amount)}
                        </p>
                        <div className="flex items-center justify-end gap-1.5 mt-0.5">
                          <span className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            po.status === "approved" || po.status === "received" ? "bg-success"
                              : po.status === "draft" ? "bg-surface-400"
                              : "bg-info"
                          )} />
                          <span className="text-[10px] tabular-nums text-foreground-lighter capitalize">{po.status}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TIME */}
        {activeTab === "time" && (
          <div className="rounded-lg border border-border bg-surface-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <span className="text-[11px] font-mono text-foreground-lighter uppercase tracking-widest">Time Entries</span>
              <Link
                href={`/time-tracking?project=${project.id}`}
                className="text-[11px] text-brand hover:opacity-80"
              >
                + Log Time
              </Link>
            </div>
            {timeEntries.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-[13px] text-foreground-lighter">No time entries yet</p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">Worker</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">Date</th>
                    <th className="px-4 py-2.5 text-right text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">Reg</th>
                    <th className="px-4 py-2.5 text-right text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">OT</th>
                    <th className="px-4 py-2.5 text-right text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {timeEntries.map((entry: any) => (
                    <tr key={entry.id} className="hover:bg-surface-200 transition-colors">
                      <td className="px-4 py-3 text-[13px] text-foreground-light">
                        {entry.workers?.first_name} {entry.workers?.last_name}
                      </td>
                      <td className="px-4 py-3 text-[12px] tabular-nums text-foreground-lighter">{formatDate(entry.date)}</td>
                      <td className="px-4 py-3 text-right text-[12px] tabular-nums text-foreground-lighter">{entry.regular_hours}h</td>
                      <td className="px-4 py-3 text-right text-[12px] tabular-nums text-foreground-lighter">
                        {entry.overtime_hours > 0 ? (
                          <span className="text-brand">{entry.overtime_hours}h</span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-[12px] tabular-nums text-foreground-light">
                        {entry.regular_hours + entry.overtime_hours}h
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* MATERIALS */}
        {activeTab === "materials" && (
          <div className="rounded-lg border border-border bg-surface-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <span className="text-[11px] font-mono text-foreground-lighter uppercase tracking-widest">Material Allocations</span>
              <Link href={`/materials?project=${project.id}`} className="text-[11px] text-brand hover:opacity-80">
                + Allocate
              </Link>
            </div>
            {allocations.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-[13px] text-foreground-lighter">No materials allocated yet</p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">Material</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">Date</th>
                    <th className="px-4 py-2.5 text-right text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">Qty</th>
                    <th className="px-4 py-2.5 text-right text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {allocations.map((alloc: any) => (
                    <tr key={alloc.id} className="hover:bg-surface-200 transition-colors">
                      <td className="px-4 py-3 text-[13px] text-foreground-light">{alloc.materials?.name}</td>
                      <td className="px-4 py-3 text-[12px] tabular-nums text-foreground-lighter">{formatDate(alloc.allocated_date)}</td>
                      <td className="px-4 py-3 text-right text-[12px] tabular-nums text-foreground-lighter">
                        {alloc.quantity} {alloc.materials?.unit}
                      </td>
                      <td className="px-4 py-3 text-right text-[12px] tabular-nums text-foreground-light">
                        {formatCurrency(alloc.quantity * (alloc.materials?.unit_cost || 0))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
