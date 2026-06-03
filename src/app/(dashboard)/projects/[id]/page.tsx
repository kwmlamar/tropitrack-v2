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
  active:      "bg-[#22C55E]",
  in_progress: "bg-[#22C55E]",
  planning:    "bg-[#3B82F6]",
  not_started: "bg-[#3B82F6]",
  completed:   "bg-[#404040]",
  paused:      "bg-[#F5A623]",
  on_hold:     "bg-[#F5A623]",
  cancelled:   "bg-[#EF4444]",
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
      <div className="flex items-center justify-center h-full bg-[#18191b]">
        <div className="h-5 w-5 rounded-full border border-[#333] border-t-[#F5A623] animate-spin" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[#18191b]">
        <p className="text-[13px] text-[#555]">Project not found</p>
        <Link href="/projects" className="mt-3 text-[12px] text-[#F5A623] hover:opacity-80">← Back to jobs</Link>
      </div>
    );
  }

  const completedMilestones = milestones.filter((m) => m.is_completed).length;
  const milestoneProgress = milestones.length > 0 ? calculatePercentage(completedMilestones, milestones.length) : 0;
  const budgetUsed = calculatePercentage(costSummary.total, project.budget);
  const poTotal = purchaseOrders.reduce((s, po) => s + (po.total_amount || 0), 0);
  const grandTotal = costSummary.total + poTotal;

  return (
    <div className="flex flex-col h-full overflow-auto bg-[#18191b]">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#34373c] flex-shrink-0">
        <div className="flex items-center gap-4 min-w-0">
          <Link href="/projects" className="text-[11px] font-mono text-[#555] hover:text-[#999] transition-colors flex-shrink-0">
            ← Jobs
          </Link>
          <div className="h-3 w-px bg-[#3a3d42] flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-[11px] font-mono text-[#666] uppercase tracking-widest truncate">{project.location}</p>
            <h1 className="text-[16px] font-semibold text-[#d0d0d0] mt-0.5 truncate">{project.name}</h1>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[project.status] ?? "bg-[#404040]")} />
            <span className="text-[11px] font-mono text-[#666] capitalize">{project.status.replace("_", " ")}</span>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <Link href={`/projects/${project.id}/edit`} className="text-[12px] text-[#666] hover:text-[#aaa] transition-colors">
            Edit
          </Link>
          <button onClick={handleDelete} className="text-[12px] text-[#666] hover:text-[#EF4444] transition-colors">
            Delete
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="px-6 py-4 border-b border-[#34373c] grid grid-cols-4 gap-3 flex-shrink-0">
        <div className="rounded border border-[#34373c] bg-[#202224] px-4 py-3.5">
          <p className="text-[11px] font-mono text-[#666] uppercase tracking-wider">Budget</p>
          <p className="text-[20px] font-semibold font-mono text-[#d0d0d0] mt-1 leading-none">
            {formatCurrency(project.budget)}
          </p>
          <div className="mt-2 h-[2px] bg-[#222] rounded-full overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", budgetUsed > 90 ? "bg-[#EF4444]" : "bg-[#F5A623]")}
              style={{ width: `${Math.min(budgetUsed, 100)}%` }}
            />
          </div>
          <p className="text-[10px] font-mono text-[#555] mt-1">{budgetUsed.toFixed(1)}% used</p>
        </div>

        <div className="rounded border border-[#34373c] bg-[#202224] px-4 py-3.5">
          <p className="text-[11px] font-mono text-[#666] uppercase tracking-wider">Contract</p>
          <p className="text-[20px] font-semibold font-mono text-[#d0d0d0] mt-1 leading-none">
            {formatCurrency(project.contract_value)}
          </p>
          <p className={cn(
            "text-[10px] font-mono mt-1",
            project.contract_value - grandTotal < 0 ? "text-[#EF4444]" : "text-[#22C55E]"
          )}>
            {project.contract_value - grandTotal >= 0 ? "+" : ""}{formatCurrency(project.contract_value - grandTotal)} profit
          </p>
        </div>

        <div className="rounded border border-[#34373c] bg-[#202224] px-4 py-3.5">
          <p className="text-[11px] font-mono text-[#666] uppercase tracking-wider">Milestones</p>
          <p className="text-[20px] font-semibold font-mono text-[#d0d0d0] mt-1 leading-none">
            {completedMilestones}<span className="text-[#555]">/{milestones.length}</span>
          </p>
          <div className="mt-2 h-[2px] bg-[#222] rounded-full overflow-hidden">
            <div className="h-full bg-[#22C55E] rounded-full" style={{ width: `${milestoneProgress}%` }} />
          </div>
          <p className="text-[10px] font-mono text-[#555] mt-1">{milestoneProgress.toFixed(0)}% complete</p>
        </div>

        <div className="rounded border border-[#34373c] bg-[#202224] px-4 py-3.5">
          <p className="text-[11px] font-mono text-[#666] uppercase tracking-wider">Started</p>
          <p className="text-[15px] font-semibold font-mono text-[#d0d0d0] mt-1">{formatDate(project.start_date)}</p>
          {project.estimated_end_date && (
            <p className="text-[11px] font-mono text-[#555] mt-1">ends {formatDate(project.estimated_end_date)}</p>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="px-6 flex items-center gap-0 border-b border-[#34373c] flex-shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "px-4 py-3 text-[12px] font-mono transition-colors border-b-2 -mb-px",
              activeTab === tab.id
                ? "text-[#d0d0d0] border-[#F5A623]"
                : "text-[#555] border-transparent hover:text-[#999]"
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
            <div className="rounded border border-[#34373c] bg-[#202224]">
              <div className="px-4 py-3 border-b border-[#2d3035]">
                <span className="text-[11px] font-mono text-[#666] uppercase tracking-widest">Job Info</span>
              </div>
              <div className="px-4 py-4 space-y-3">
                {project.description && (
                  <div>
                    <p className="text-[10px] font-mono text-[#555] uppercase tracking-widest mb-1">Description</p>
                    <p className="text-[13px] text-[#777]">{project.description}</p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] font-mono text-[#555] uppercase tracking-widest mb-1">Location</p>
                    <p className="text-[13px] text-[#aaa]">{project.location}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-mono text-[#555] uppercase tracking-widest mb-1">Start</p>
                    <p className="text-[13px] text-[#aaa]">{formatDate(project.start_date)}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded border border-[#34373c] bg-[#202224]">
              <div className="px-4 py-3 border-b border-[#2d3035]">
                <span className="text-[11px] font-mono text-[#666] uppercase tracking-widest">Client</span>
              </div>
              <div className="px-4 py-4 space-y-2.5">
                <p className="text-[14px] font-semibold text-[#c4c4c4]">{project.client_name}</p>
                {project.client_email && (
                  <a href={`mailto:${project.client_email}`} className="block text-[13px] text-[#777] hover:text-[#aaa] transition-colors">
                    {project.client_email}
                  </a>
                )}
                {project.client_phone && (
                  <a href={`tel:${project.client_phone}`} className="block text-[13px] text-[#777] hover:text-[#aaa] transition-colors">
                    {project.client_phone}
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        {/* MILESTONES */}
        {activeTab === "milestones" && (
          <div className="rounded border border-[#34373c] bg-[#202224] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#2d3035] flex items-center justify-between">
              <span className="text-[11px] font-mono text-[#666] uppercase tracking-widest">Milestones</span>
              <span className="text-[11px] font-mono text-[#555]">{completedMilestones}/{milestones.length} done</span>
            </div>
            {milestones.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-[13px] text-[#555]">No milestones defined</p>
              </div>
            ) : (
              <div className="divide-y divide-[#292c31]">
                {milestones.map((m) => (
                  <div key={m.id} className="flex items-center gap-4 px-4 py-3.5">
                    <div className={cn(
                      "h-2 w-2 rounded-full flex-shrink-0",
                      m.is_completed ? "bg-[#22C55E]" : "bg-[#3a3d42] border border-[#444]"
                    )} />
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-[13px]", m.is_completed ? "text-[#555] line-through" : "text-[#aaa]")}>
                        {m.name}
                      </p>
                      {m.description && (
                        <p className="text-[11px] text-[#555] mt-0.5 truncate">{m.description}</p>
                      )}
                    </div>
                    <p className="text-[11px] font-mono text-[#555] flex-shrink-0">{formatDate(m.due_date)}</p>
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
                <div key={c.label} className="rounded border border-[#34373c] bg-[#202224] px-4 py-3.5">
                  <p className="text-[11px] font-mono text-[#666] uppercase tracking-wider">{c.label}</p>
                  <p className="text-[18px] font-semibold font-mono text-[#d0d0d0] mt-1 leading-none">
                    {formatCurrency(c.value)}
                  </p>
                </div>
              ))}
            </div>

            <div className="rounded border border-[#34373c] bg-[#202224]">
              <div className="px-4 py-3 border-b border-[#2d3035]">
                <span className="text-[11px] font-mono text-[#666] uppercase tracking-widest">Total Cost Breakdown</span>
              </div>
              <div className="px-4 py-4 space-y-3">
                <p className="text-[28px] font-semibold font-mono text-[#F5A623]">{formatCurrency(grandTotal)}</p>
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
                        <span className="text-[12px] text-[#666]">{r.label}</span>
                        <span className="text-[12px] font-mono text-[#555]">
                          {calculatePercentage(r.value, grandTotal || 1).toFixed(1)}%
                        </span>
                      </div>
                      <div className="w-32 h-[2px] bg-[#2d3035] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#333] rounded-full"
                          style={{ width: `${calculatePercentage(r.value, grandTotal || 1)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="pt-3 border-t border-[#2d3035] grid grid-cols-4 gap-3">
                  {[
                    { label: "Budget",     value: formatCurrency(project.budget) },
                    { label: "Remaining",  value: formatCurrency(project.budget - grandTotal), colored: true, val: project.budget - grandTotal },
                    { label: "Contract",   value: formatCurrency(project.contract_value) },
                    { label: "Est. Profit",value: formatCurrency(project.contract_value - grandTotal), colored: true, val: project.contract_value - grandTotal },
                  ].map((r) => (
                    <div key={r.label}>
                      <p className="text-[10px] font-mono text-[#555] uppercase tracking-widest mb-1">{r.label}</p>
                      <p className={cn(
                        "text-[13px] font-mono font-semibold",
                        r.colored ? (r.val! < 0 ? "text-[#EF4444]" : "text-[#22C55E]") : "text-[#aaa]"
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
                <div key={s.label} className="rounded border border-[#34373c] bg-[#202224] px-4 py-3.5">
                  <p className="text-[11px] font-mono text-[#666] uppercase tracking-wider">{s.label}</p>
                  <p className="text-[22px] font-semibold font-mono text-[#d0d0d0] mt-1 leading-none">{s.value}</p>
                </div>
              ))}
            </div>

            <div className="rounded border border-[#34373c] bg-[#202224] overflow-hidden">
              <div className="px-4 py-3 border-b border-[#2d3035] flex items-center justify-between">
                <span className="text-[11px] font-mono text-[#666] uppercase tracking-widest">Purchase Orders</span>
                <Link href="/vendors?tab=purchase-orders" className="text-[11px] text-[#F5A623] hover:opacity-80">
                  + New PO
                </Link>
              </div>
              {purchaseOrders.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-[13px] text-[#555]">No purchase orders linked</p>
                </div>
              ) : (
                <div className="divide-y divide-[#292c31]">
                  {purchaseOrders.map((po) => (
                    <div key={po.id} className="flex items-center justify-between px-4 py-3.5 hover:bg-[#23252a] transition-colors">
                      <div>
                        <p className="text-[13px] text-[#aaa] font-mono">{po.po_number}</p>
                        <p className="text-[11px] text-[#555] mt-0.5">
                          {po.vendors?.name} · {po.order_date ? formatDate(po.order_date) : "No date"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[13px] font-mono font-semibold text-[#d0d0d0]">
                          {formatCurrency(po.total_amount)}
                        </p>
                        <div className="flex items-center justify-end gap-1.5 mt-0.5">
                          <span className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            po.status === "approved" || po.status === "received" ? "bg-[#22C55E]"
                              : po.status === "draft" ? "bg-[#555]"
                              : "bg-[#3B82F6]"
                          )} />
                          <span className="text-[10px] font-mono text-[#555] capitalize">{po.status}</span>
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
          <div className="rounded border border-[#34373c] bg-[#202224] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#2d3035] flex items-center justify-between">
              <span className="text-[11px] font-mono text-[#666] uppercase tracking-widest">Time Entries</span>
              <Link
                href={`/time-tracking?project=${project.id}`}
                className="text-[11px] text-[#F5A623] hover:opacity-80"
              >
                + Log Time
              </Link>
            </div>
            {timeEntries.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-[13px] text-[#555]">No time entries yet</p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#292c31]">
                    <th className="px-4 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest text-[#555]">Worker</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest text-[#555]">Date</th>
                    <th className="px-4 py-2.5 text-right text-[10px] font-mono uppercase tracking-widest text-[#555]">Reg</th>
                    <th className="px-4 py-2.5 text-right text-[10px] font-mono uppercase tracking-widest text-[#555]">OT</th>
                    <th className="px-4 py-2.5 text-right text-[10px] font-mono uppercase tracking-widest text-[#555]">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#292c31]">
                  {timeEntries.map((entry: any) => (
                    <tr key={entry.id} className="hover:bg-[#23252a] transition-colors">
                      <td className="px-4 py-3 text-[13px] text-[#aaa]">
                        {entry.workers?.first_name} {entry.workers?.last_name}
                      </td>
                      <td className="px-4 py-3 text-[12px] font-mono text-[#555]">{formatDate(entry.date)}</td>
                      <td className="px-4 py-3 text-right text-[12px] font-mono text-[#666]">{entry.regular_hours}h</td>
                      <td className="px-4 py-3 text-right text-[12px] font-mono text-[#666]">
                        {entry.overtime_hours > 0 ? (
                          <span className="text-[#F5A623]">{entry.overtime_hours}h</span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-[12px] font-mono text-[#aaa]">
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
          <div className="rounded border border-[#34373c] bg-[#202224] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#2d3035] flex items-center justify-between">
              <span className="text-[11px] font-mono text-[#666] uppercase tracking-widest">Material Allocations</span>
              <Link href={`/materials?project=${project.id}`} className="text-[11px] text-[#F5A623] hover:opacity-80">
                + Allocate
              </Link>
            </div>
            {allocations.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-[13px] text-[#555]">No materials allocated yet</p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#292c31]">
                    <th className="px-4 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest text-[#555]">Material</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest text-[#555]">Date</th>
                    <th className="px-4 py-2.5 text-right text-[10px] font-mono uppercase tracking-widest text-[#555]">Qty</th>
                    <th className="px-4 py-2.5 text-right text-[10px] font-mono uppercase tracking-widest text-[#555]">Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#292c31]">
                  {allocations.map((alloc: any) => (
                    <tr key={alloc.id} className="hover:bg-[#23252a] transition-colors">
                      <td className="px-4 py-3 text-[13px] text-[#aaa]">{alloc.materials?.name}</td>
                      <td className="px-4 py-3 text-[12px] font-mono text-[#555]">{formatDate(alloc.allocated_date)}</td>
                      <td className="px-4 py-3 text-right text-[12px] font-mono text-[#666]">
                        {alloc.quantity} {alloc.materials?.unit}
                      </td>
                      <td className="px-4 py-3 text-right text-[12px] font-mono text-[#aaa]">
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
