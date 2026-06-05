"use client";

import { Fragment, useEffect, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Edit2, Layers, FileText, RefreshCw, Mail, Check, X, ArrowRight, Briefcase } from "lucide-react";
import {
  computeLaborCost,
  computeSectionMaterialCost,
  computeSectionMaterialSell,
  type Estimate,
  type EstimateLineItem,
  type EstimateSectionMaterial,
  type EstimateStatus,
} from "@/types";
import { canSeeCosts } from "@/lib/permissions";
import { ScopeThisButton } from "@/components/estimates/scope-this-button";

const STATUS_DOT: Record<string, string> = {
  draft:     "bg-[#555]",
  sent:      "bg-[#3B82F6]",
  approved:  "bg-[#22C55E]",
  rejected:  "bg-[#EF4444]",
  converted: "bg-[#A855F7]",
  expired:   "bg-[#F5A623]",
};

type EstimateSection = {
  id: string;
  estimate_id: string;
  name: string;
  /** Optional client-facing label override — see issue #13. */
  client_name?: string | null;
  order_index: number;
  show_to_client: boolean;
};

type ViewMode = "internal" | "client";

export default function EstimateDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const estimateId = params.id as string;
  const { toast } = useToast();
  const { profile } = useAuth();
  // Cost-side gate — admins / PMs / owners see cost+markup; workers see sell only.
  // See src/lib/permissions.ts and project_bedrock_materials_calc_design.md.
  const costsVisible = canSeeCosts(profile);
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [lineItems, setLineItems] = useState<EstimateLineItem[]>([]);
  const [sections, setSections] = useState<EstimateSection[]>([]);
  const [sectionMaterials, setSectionMaterials] = useState<EstimateSectionMaterial[]>([]);
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [converting, setConverting] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectLocation, setProjectLocation] = useState("");
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailForm, setEmailForm] = useState({ to_email: "", subject: "", message: "" });

  // View mode synced to ?view=client | internal (default: internal for cost-visible users; forced 'client' otherwise).
  // Workers/foremen never see the internal cost-side view per the locked design.
  const rawView: ViewMode = searchParams.get("view") === "client" ? "client" : "internal";
  const view: ViewMode = canSeeCosts(profile) ? rawView : "client";
  const setView = (next: ViewMode) => {
    const sp = new URLSearchParams(searchParams.toString());
    if (next === "internal") sp.delete("view");
    else sp.set("view", next);
    router.replace(`/estimates/${estimateId}${sp.toString() ? `?${sp.toString()}` : ""}`);
  };

  // Internal view always renders the SummaryView (rollup + inline Gantt).
  // The per-task man-days breakdown that previously sat behind a Detail toggle
  // now lives on /estimates/[id]/builder, the dedicated editor.

  useEffect(() => {
    fetchEstimateData();
    if (searchParams.get("convert") === "true") setShowConvertDialog(true);
  }, [estimateId]);

  const fetchEstimateData = async () => {
    setLoading(true);
    try {
      const [estimateRes, itemsRes, sectionsRes, matsRes] = await Promise.all([
        supabase.from("estimates").select("*").eq("id", estimateId).single(),
        supabase.from("estimate_line_items").select("*").eq("estimate_id", estimateId).order("order_index"),
        supabase.from("estimate_sections").select("*").eq("estimate_id", estimateId).order("order_index"),
        // Takeoff materials (Option C — materials live here, not on tasks)
        supabase.from("estimate_section_materials").select("*").order("order_index"),
      ]);
      if (estimateRes.error) throw estimateRes.error;
      setEstimate(estimateRes.data);
      setLineItems(itemsRes.data || []);
      const secs = (sectionsRes.data as EstimateSection[]) || [];
      setSections(secs);
      // Scope takeoffs to this estimate's sections
      const secIds = new Set(secs.map((s) => s.id));
      setSectionMaterials(((matsRes.data as EstimateSectionMaterial[]) || []).filter((m) => secIds.has(m.section_id)));
      setProjectName(estimateRes.data.title);
    } catch (error) {
      toast({ title: "Error", description: "Failed to load estimate", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // Refresh-prices was a per-task material refresh. Option C moved materials to
  // /materials (takeoff). If catalog-refresh is needed it should live there.

  /**
   * Shift a line item's planned_start, planned_end, and daily_workers keys by `deltaDays`.
   * Optimistic local update, then persist via Supabase. Revert on failure.
   * Never writes to `amount` / `unit_rate` — those are GENERATED columns.
   */
  const shiftIsoDate = (iso: string, deltaDays: number): string => {
    const dt = new Date(iso + "T00:00:00Z");
    dt.setUTCDate(dt.getUTCDate() + deltaDays);
    return dt.toISOString().slice(0, 10);
  };

  const handleRescheduleLine = async (item: EstimateLineItem, deltaDays: number) => {
    if (deltaDays === 0) return;
    if (!estimate || (estimate as unknown as { is_locked?: boolean }).is_locked || estimate.status !== "draft") return;

    const newStart = item.planned_start ? shiftIsoDate(item.planned_start, deltaDays) : null;
    const newEnd = item.planned_end
      ? shiftIsoDate(item.planned_end, deltaDays)
      : newStart;

    let newDaily: Record<string, number> | undefined = undefined;
    if (item.daily_workers && Object.keys(item.daily_workers).length > 0) {
      newDaily = {};
      for (const [k, v] of Object.entries(item.daily_workers)) {
        if (v == null || v === 0) continue;
        newDaily[shiftIsoDate(k, deltaDays)] = v as number;
      }
    }

    const prevSnapshot = item;
    setLineItems((prev) =>
      prev.map((li) =>
        li.id === item.id
          ? {
              ...li,
              planned_start: newStart,
              planned_end: newEnd,
              ...(newDaily ? { daily_workers: newDaily } : {}),
            }
          : li,
      ),
    );

    const updatePayload: Record<string, unknown> = {
      planned_start: newStart,
      planned_end: newEnd,
    };
    if (newDaily) updatePayload.daily_workers = newDaily;

    const { error } = await supabase
      .from("estimate_line_items")
      .update(updatePayload)
      .eq("id", item.id);

    if (error) {
      setLineItems((prev) => prev.map((li) => (li.id === item.id ? prevSnapshot : li)));
      toast({ title: "Reschedule failed", description: error.message, variant: "destructive" });
    }
  };

  const handleStatusChange = async (newStatus: EstimateStatus) => {
    const updateData: Partial<Estimate> = { status: newStatus };
    if (newStatus === "sent") updateData.sent_at = new Date().toISOString();
    if (newStatus === "approved") updateData.approved_at = new Date().toISOString();
    if (newStatus === "rejected") updateData.rejected_at = new Date().toISOString();
    const { error } = await supabase.from("estimates").update(updateData).eq("id", estimateId);
    if (error) { toast({ title: "Error", variant: "destructive" }); return; }
    setEstimate({ ...estimate!, ...updateData });
    toast({ title: `Marked as ${newStatus}` });
  };

  const handleSendEmail = async () => {
    if (!emailForm.to_email) { toast({ title: "Email required", variant: "destructive" }); return; }
    setSendingEmail(true);
    try {
      const { error } = await supabase.functions.invoke("send-estimate", {
        body: { estimate_id: estimateId, ...emailForm },
      });
      if (error) throw error;
      toast({ title: "Email sent", description: `Sent to ${emailForm.to_email}` });
      setShowEmailDialog(false);
      setEstimate({ ...estimate!, status: "sent", sent_at: new Date().toISOString() });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSendingEmail(false);
    }
  };

  const handleConvertToProject = async () => {
    if (!projectName || !projectLocation) {
      toast({ title: "Name and location required", variant: "destructive" });
      return;
    }
    setConverting(true);
    try {
      const { data: project, error: projectError } = await supabase
        .from("projects")
        .insert({
          name: projectName,
          description: estimate?.description || null,
          client_name: estimate?.client_name || "",
          client_email: estimate?.client_email || null,
          client_phone: estimate?.client_phone || null,
          location: projectLocation,
          status: "planning",
          start_date: new Date().toISOString().split("T")[0],
          budget: estimate?.total_amount || 0,
          contract_value: estimate?.total_amount || 0,
          created_by: profile?.id,
        })
        .select()
        .single();
      if (projectError) throw projectError;
      await supabase.from("estimates").update({
        project_id: project.id,
        status: "converted",
        converted_at: new Date().toISOString(),
      }).eq("id", estimateId);
      toast({ title: "Project created", description: `Converted to "${project.name}"` });
      router.push(`/projects/${project.id}`);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setConverting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this estimate?")) return;
    const { error } = await supabase.from("estimates").delete().eq("id", estimateId);
    if (error) { toast({ title: "Error", variant: "destructive" }); return; }
    toast({ title: "Deleted" });
    router.push("/estimates");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-[#18191b]">
        <div className="h-5 w-5 rounded-full border border-[#333] border-t-[#F5A623] animate-spin" />
      </div>
    );
  }

  if (!estimate) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[#18191b]">
        <p className="text-[13px] text-[#555]">Estimate not found</p>
        <Link href="/estimates" className="mt-3 text-[12px] text-[#F5A623] hover:opacity-80">
          ← Back to estimates
        </Link>
      </div>
    );
  }

  // Group line items by category
  const grouped = lineItems.reduce<Record<string, EstimateLineItem[]>>((acc, item) => {
    const key = item.category || "other";
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  return (
    <div className="flex flex-col h-full overflow-auto bg-[#18191b]">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#34373c] flex-shrink-0">
        <div className="flex items-center gap-4 min-w-0">
          <Link
            href="/estimates"
            className="text-[11px] font-mono text-[#555] hover:text-[#999] transition-colors flex-shrink-0"
          >
            ← Estimates
          </Link>
          <div className="h-3 w-px bg-[#3a3d42] flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-[11px] font-mono text-[#666] uppercase tracking-widest">{estimate.estimate_number}</p>
            <h1 className="text-[16px] font-semibold text-[#d0d0d0] mt-0.5 truncate">{estimate.title}</h1>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[estimate.status] ?? "bg-[#404040]")} />
            <span className="text-[11px] font-mono text-[#666] capitalize">{estimate.status}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-4 flex-shrink-0">
          {/* Toggles Group — only the Internal/Client toggle remains; per-task detail
              lives on /builder. */}
          <div className="flex items-center gap-2">
            {costsVisible && (
              <div className="flex items-center bg-[#1a1b1d] border border-[#2b2e33] rounded p-[2px]">
                <button
                  onClick={() => setView("internal")}
                  className={cn(
                    "px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider rounded transition-colors",
                    view === "internal"
                      ? "bg-[#2d3035] text-[#d0d0d0]"
                      : "text-[#555] hover:text-[#999]"
                  )}
                  title="Full breakdown — internal use only"
                >
                  Internal
                </button>
                <button
                  onClick={() => setView("client")}
                  className={cn(
                    "px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider rounded transition-colors",
                    view === "client"
                      ? "bg-[#2d3035] text-[#F5A623]"
                      : "text-[#555] hover:text-[#999]"
                  )}
                  title="What the client sees — simplified, no internal cost detail"
                >
                  Client
                </button>
              </div>
            )}
          </div>

          {/* Separator */}
          {(view === "internal" || costsVisible) && (
            <div className="h-4 w-px bg-[#34373c] flex-shrink-0" />
          )}

          {/* Secondary Actions Group */}
          <div className="flex items-center gap-2">
            <Link
              href={`/estimates/${estimateId}/builder`}
              className="px-3 py-1.5 text-[11px] font-mono font-medium border border-[#34373c] bg-[#202224] text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-[#272a2c] dark:hover:bg-[#272a2c] hover:border-slate-300 dark:hover:border-slate-700 rounded transition-all flex items-center gap-1.5"
            >
              <Edit2 className="h-3 w-3" />
              <span>Edit</span>
            </Link>
            {costsVisible && (
              <Link
                href={`/estimates/${estimateId}/materials`}
                className="px-3 py-1.5 text-[11px] font-mono font-medium border border-[#34373c] bg-[#202224] text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-[#272a2c] dark:hover:bg-[#272a2c] hover:border-slate-300 dark:hover:border-slate-700 rounded transition-all flex items-center gap-1.5"
                title="Materials & Equipment cost / markup / sell breakdown — internal only"
              >
                <Layers className="h-3 w-3" />
                <span>Materials</span>
              </Link>
            )}
            <Link
              href={`/estimates/${estimateId}/preview`}
              className="px-3 py-1.5 text-[11px] font-mono font-medium border border-[#34373c] bg-[#202224] text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-[#272a2c] dark:hover:bg-[#272a2c] hover:border-slate-300 dark:hover:border-slate-700 rounded transition-all flex items-center gap-1.5"
            >
              <FileText className="h-3 w-3" />
              <span>Preview PDF</span>
            </Link>
          </div>

          {/* Separator */}
          <div className="h-4 w-px bg-[#34373c] flex-shrink-0" />

          {/* Workflow/Primary Actions Group */}
          <div className="flex items-center gap-2">
            {estimate.status === "draft" && (
              <button
                onClick={() => {
                  setEmailForm({
                    to_email: estimate.client_email || "",
                    subject: `Estimate ${estimate.estimate_number}`,
                    message: "",
                  });
                  setShowEmailDialog(true);
                }}
                className="px-3 py-1.5 text-[11px] font-mono font-medium border border-blue-500/20 dark:border-blue-500/30 bg-blue-50/50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 rounded transition-colors flex items-center gap-1.5"
              >
                <Mail className="h-3.5 w-3.5" />
                <span>Send email</span>
              </button>
            )}
            {estimate.status === "sent" && (
              <>
                <button
                  onClick={() => handleStatusChange("approved")}
                  className="px-3 py-1.5 text-[11px] font-mono font-medium border border-emerald-500/20 dark:border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 rounded transition-colors flex items-center gap-1.5"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>Approve</span>
                </button>
                <button
                  onClick={() => handleStatusChange("rejected")}
                  className="px-3 py-1.5 text-[11px] font-mono font-medium border border-rose-500/20 dark:border-rose-500/30 bg-rose-50/50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-500/20 rounded transition-colors flex items-center gap-1.5"
                >
                  <X className="h-3.5 w-3.5" />
                  <span>Reject</span>
                </button>
              </>
            )}
            {estimate.status === "approved" && !estimate.project_id && (
              <button
                onClick={() => setShowConvertDialog(true)}
                className="px-3 py-1.5 text-[11px] font-mono font-medium border border-amber-500/20 dark:border-amber-500/30 bg-amber-50/50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-500/20 rounded transition-colors flex items-center gap-1.5"
              >
                <Briefcase className="h-3.5 w-3.5" />
                <span>Convert to job</span>
              </button>
            )}
            {estimate.project_id && (
              <Link
                href={`/projects/${estimate.project_id}`}
                className="px-3 py-1.5 text-[11px] font-mono font-medium border border-purple-500/20 dark:border-purple-500/30 bg-purple-50/50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-500/20 rounded transition-colors flex items-center gap-1.5"
              >
                <span>View job</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 p-6 space-y-6">
        {/* Summary bar */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded border border-[#34373c] bg-[#202224] px-4 py-3.5">
            <p className="text-[11px] font-mono text-[#666] uppercase tracking-wider">Subtotal</p>
            <p className="text-[22px] font-semibold font-mono text-[#d0d0d0] mt-1 leading-none">
              {formatCurrency(estimate.subtotal || 0)}
            </p>
          </div>
          <div className="rounded border border-[#34373c] bg-[#202224] px-4 py-3.5">
            <p className="text-[11px] font-mono text-[#666] uppercase tracking-wider">Total</p>
            <p className="text-[22px] font-semibold font-mono text-[#F5A623] mt-1 leading-none">
              {formatCurrency(estimate.total_amount)}
            </p>
          </div>
          <div className="rounded border border-[#34373c] bg-[#202224] px-4 py-3.5">
            <p className="text-[11px] font-mono text-[#666] uppercase tracking-wider">Issued</p>
            <p className="text-[22px] font-semibold font-mono text-[#d0d0d0] mt-1 leading-none">
              {formatDate(estimate.issue_date)}
            </p>
          </div>
        </div>

        {/* Client + Estimate details */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded border border-[#34373c] bg-[#202224]">
            <div className="px-4 py-3 border-b border-[#2d3035]">
              <span className="text-[11px] font-mono text-[#666] uppercase tracking-widest">Client</span>
            </div>
            <div className="px-4 py-4 space-y-2.5">
              <p className="text-[14px] font-semibold text-[#c4c4c4]">{estimate.client_name}</p>
              {estimate.client_email && (
                <a
                  href={`mailto:${estimate.client_email}`}
                  className="block text-[13px] text-[#777] hover:text-[#aaa] transition-colors"
                >
                  {estimate.client_email}
                </a>
              )}
              {estimate.client_phone && (
                <a
                  href={`tel:${estimate.client_phone}`}
                  className="block text-[13px] text-[#777] hover:text-[#aaa] transition-colors"
                >
                  {estimate.client_phone}
                </a>
              )}
              {estimate.client_address && (
                <p className="text-[13px] text-[#666]">{estimate.client_address}</p>
              )}
            </div>
          </div>

          <div className="rounded border border-[#34373c] bg-[#202224]">
            <div className="px-4 py-3 border-b border-[#2d3035]">
              <span className="text-[11px] font-mono text-[#666] uppercase tracking-widest">Summary</span>
            </div>
            <div className="px-4 py-4 space-y-2">
              {[
                { label: "Subtotal", value: formatCurrency(estimate.subtotal || 0) },
                // Overhead + Profit are internal cost structure — never shown to client
                view === "internal" && estimate.overhead_amount > 0 && {
                  label: `Overhead (${estimate.overhead_markup_percent}%)`,
                  value: formatCurrency(estimate.overhead_amount),
                },
                view === "internal" && estimate.profit_amount > 0 && {
                  label: `Profit (${estimate.profit_margin_percent}%)`,
                  value: formatCurrency(estimate.profit_amount),
                },
                // VAT shown in both views — client pays it
                estimate.tax_amount > 0 && {
                  label: `VAT (${estimate.tax_rate}%)`,
                  value: formatCurrency(estimate.tax_amount),
                },
              ]
                .filter(Boolean)
                .map((row: any) => (
                  <div key={row.label} className="flex items-center justify-between">
                    <span className="text-[12px] text-[#666]">{row.label}</span>
                    <span className="text-[12px] font-mono text-[#aaa]">{row.value}</span>
                  </div>
                ))}
              <div className="pt-2 border-t border-[#2d3035] flex items-center justify-between">
                <span className="text-[12px] font-semibold text-[#d0d0d0]">Total</span>
                <span className="text-[15px] font-semibold font-mono text-[#F5A623]">
                  {formatCurrency(estimate.total_amount)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Scope-this empty-state action (issue #9) — only when no sections exist
            and the viewer can see costs. Workers (sell-only view) don't see this. */}
        {sections.length === 0 && costsVisible && estimate.status === "draft" && (
          <div className="rounded border border-dashed border-[#34373c] bg-[#1b1c1e] px-6 py-10 text-center mb-4">
            <p className="text-[13px] text-[#888] mb-3">
              This estimate is empty. Describe the job and Claude will scope it for you — sections, tasks, and a materials takeoff.
            </p>
            <div className="flex justify-center">
              <ScopeThisButton
                estimateId={estimateId}
                defaultLaborSellRatePerDay={Number(estimate.labor_sell_rate_per_day ?? 180)}
                defaultMaterialMarkupPct={Number(estimate.default_material_markup_pct ?? 0)}
                defaultEquipmentMarkupPct={Number(estimate.default_equipment_markup_pct ?? 0)}
                onApplied={fetchEstimateData}
              />
            </div>
          </div>
        )}

        {/* Line items — different shape per view */}
        {view === "internal" ? (
          <SummaryView
            estimate={estimate}
            sections={sections}
            lineItems={lineItems}
            sectionMaterials={sectionMaterials}
            onReschedule={handleRescheduleLine}
            disabled={(estimate as unknown as { is_locked?: boolean }).is_locked || estimate.status !== "draft"}
          />
        ) : (
          // ── Client view: scope-of-work sections with bottom-line subtotals ──
          (() => {
            const clientSections = sections.filter((s) => s.show_to_client);
            const itemsBySection: Record<string, EstimateLineItem[]> = {};
            for (const it of lineItems) {
              const k = (it as EstimateLineItem & { section_id?: string }).section_id ?? "_loose";
              (itemsBySection[k] ??= []).push(it);
            }
            const sectionTotal = (sectionId: string) =>
              (itemsBySection[sectionId] ?? [])
                .filter((it) => (it as EstimateLineItem & { show_to_client?: boolean }).show_to_client !== false)
                .reduce((s, it) => s + Number(it.amount || 0), 0);

            return (
              <div className="rounded border border-[#34373c] bg-[#202224] overflow-hidden">
                <div className="px-4 py-3 border-b border-[#2d3035] flex items-center justify-between">
                  <span className="text-[11px] font-mono text-[#F5A623]/80 uppercase tracking-widest">
                    Scope of Work
                  </span>
                  <span className="text-[11px] font-mono text-[#555]">{clientSections.length} sections</span>
                </div>
                {clientSections.length === 0 ? (
                  <div className="py-10 text-center">
                    <p className="text-[13px] text-[#555]">Nothing visible to client yet</p>
                    <p className="text-[11px] text-[#3a3d42] mt-1.5">
                      Toggle sections / line items to “show to client” in the builder
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-[#292c31]">
                    {clientSections.map((sec) => {
                      const total = sectionTotal(sec.id);
                      return (
                        <div key={sec.id} className="flex items-center justify-between px-4 py-3.5 hover:bg-[#23252a] transition-colors">
                          <span className="text-[13px] text-[#c4c4c4] font-medium">{sec.name}</span>
                          <span className="text-[13px] font-mono text-[#aaa] font-semibold tabular-nums">
                            {formatCurrency(total)}
                          </span>
                        </div>
                      );
                    })}
                    <div className="flex items-center justify-between px-4 py-3.5 bg-[#1b1c1e]">
                      <span className="text-[12px] font-semibold text-[#d0d0d0]">Project Total</span>
                      <span className="text-[15px] font-semibold font-mono text-[#F5A623] tabular-nums">
                        {formatCurrency(estimate.total_amount)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })()
        )}

        {/* Terms */}
        {(estimate.terms_and_conditions || estimate.description) && (
          <div className="rounded border border-[#34373c] bg-[#202224]">
            <div className="px-4 py-3 border-b border-[#2d3035]">
              <span className="text-[11px] font-mono text-[#666] uppercase tracking-widest">Terms & Notes</span>
            </div>
            <div className="px-4 py-4 space-y-4">
              {estimate.description && (
                <div>
                  <p className="text-[10px] font-mono text-[#555] uppercase tracking-widest mb-1.5">Description</p>
                  <p className="text-[13px] text-[#777]">{estimate.description}</p>
                </div>
              )}
              {estimate.terms_and_conditions && (
                <div>
                  <p className="text-[10px] font-mono text-[#555] uppercase tracking-widest mb-1.5">Terms</p>
                  <p className="text-[13px] text-[#777] whitespace-pre-wrap">{estimate.terms_and_conditions}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer actions */}
        <div className="flex items-center justify-end pt-2">
          <button
            onClick={handleDelete}
            className="text-[12px] text-[#555] hover:text-[#EF4444] transition-colors"
          >
            Delete estimate
          </button>
        </div>
      </div>

      {/* Convert to Project Dialog */}
      <Dialog open={showConvertDialog} onOpenChange={setShowConvertDialog}>
        <DialogContent className="bg-[#202224] border-[#34373c] text-[#d0d0d0]">
          <DialogHeader>
            <DialogTitle className="text-[#d0d0d0]">Convert to Job</DialogTitle>
            <DialogDescription className="text-[#666]">
              Creates a new job from this estimate and links them together.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-[11px] font-mono text-[#666] uppercase tracking-wider">Job Name *</Label>
              <Input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="Enter job name"
                className="bg-[#292c31] border-[#3a3d42] text-[#d0d0d0] placeholder:text-[#444]"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[11px] font-mono text-[#666] uppercase tracking-wider">Location *</Label>
              <Input
                value={projectLocation}
                onChange={(e) => setProjectLocation(e.target.value)}
                placeholder="e.g. Governor's Harbour, Eleuthera"
                className="bg-[#292c31] border-[#3a3d42] text-[#d0d0d0] placeholder:text-[#444]"
              />
            </div>
            <div className="rounded border border-[#2d3035] bg-[#1b1c1e] px-4 py-3 space-y-1.5">
              {[
                { label: "Client", value: estimate?.client_name },
                { label: "Budget", value: formatCurrency(estimate?.total_amount || 0) },
              ].map((r) => (
                <div key={r.label} className="flex items-center justify-between">
                  <span className="text-[11px] font-mono text-[#555]">{r.label}</span>
                  <span className="text-[12px] text-[#888]">{r.value}</span>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <button
              onClick={() => setShowConvertDialog(false)}
              className="px-4 py-2 text-[12px] text-[#666] hover:text-[#aaa] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConvertToProject}
              disabled={converting}
              className="flex items-center gap-2 px-4 py-2 rounded bg-[#2d3035] border border-[#333] text-[12px] text-[#F5A623] hover:bg-[#353840] transition-colors disabled:opacity-40"
            >
              {converting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Create Job
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Email Dialog */}
      <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
        <DialogContent className="bg-[#202224] border-[#34373c] text-[#d0d0d0]">
          <DialogHeader>
            <DialogTitle className="text-[#d0d0d0]">Send Estimate</DialogTitle>
            <DialogDescription className="text-[#666]">
              Email this estimate to {estimate?.client_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-[11px] font-mono text-[#666] uppercase tracking-wider">To *</Label>
              <Input
                type="email"
                value={emailForm.to_email}
                onChange={(e) => setEmailForm({ ...emailForm, to_email: e.target.value })}
                placeholder="client@example.com"
                className="bg-[#292c31] border-[#3a3d42] text-[#d0d0d0] placeholder:text-[#444]"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[11px] font-mono text-[#666] uppercase tracking-wider">Subject</Label>
              <Input
                value={emailForm.subject}
                onChange={(e) => setEmailForm({ ...emailForm, subject: e.target.value })}
                className="bg-[#292c31] border-[#3a3d42] text-[#d0d0d0] placeholder:text-[#444]"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[11px] font-mono text-[#666] uppercase tracking-wider">Message</Label>
              <Textarea
                value={emailForm.message}
                onChange={(e) => setEmailForm({ ...emailForm, message: e.target.value })}
                placeholder="Optional message..."
                rows={3}
                className="bg-[#292c31] border-[#3a3d42] text-[#d0d0d0] placeholder:text-[#444] resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <button
              onClick={() => setShowEmailDialog(false)}
              className="px-4 py-2 text-[12px] text-[#666] hover:text-[#aaa] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSendEmail}
              disabled={sendingEmail}
              className="flex items-center gap-2 px-4 py-2 rounded bg-[#2d3035] border border-[#333] text-[12px] text-[#3B82F6] hover:bg-[#353840] transition-colors disabled:opacity-40"
            >
              {sendingEmail && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Send
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Summary View (issue #4) ─────────────────────────────────────────────────
//
// "Estimate Version 2" layout: section → task hierarchy with Labor / Material /
// Equipment / Total columns, plus an inline Gantt day-grid to the right showing
// crew_size per calendar day for each task. Day cells come from line.daily_workers
// (jsonb keyed by ISO date) when present; otherwise we lay down a uniform crew
// across `crew_days` days starting at planned_start.

type SummaryViewProps = {
  estimate: Estimate;
  sections: EstimateSection[];
  lineItems: EstimateLineItem[];
  /** Takeoff-level materials (Option C — materials live here, not on tasks). */
  sectionMaterials: EstimateSectionMaterial[];
  onReschedule: (item: EstimateLineItem, deltaDays: number) => void | Promise<void>;
  disabled: boolean;
};

type DragState = {
  itemId: string;
  startX: number;
  delta: number;
  firstIdx: number;
  lastIdx: number;
  dayCellWidth: number;
};

function SummaryView({ estimate, sections, lineItems, sectionMaterials, onReschedule, disabled }: SummaryViewProps) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const estimateLaborRate = estimate.labor_sell_rate_per_day ?? null;

  // Build calendar range = [min(planned_start), max(planned_end)] across dated line items
  const datedItems = lineItems.filter((it) => it.planned_start);
  const days: string[] = [];
  if (datedItems.length > 0) {
    const starts = datedItems
      .map((it) => it.planned_start!)
      .filter(Boolean) as string[];
    const ends = datedItems
      .map((it) => it.planned_end ?? it.planned_start!)
      .filter(Boolean) as string[];
    const minDate = starts.reduce((a, b) => (a < b ? a : b));
    const maxDate = ends.reduce((a, b) => (a > b ? a : b));

    const cursor = new Date(minDate + "T00:00:00Z");
    const end = new Date(maxDate + "T00:00:00Z");
    while (cursor <= end) {
      days.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }

  // Resolve crew_size on a given ISO date for a line item.
  // Prefer daily_workers jsonb (per-day matrix); fall back to uniform from man_days/crew_days.
  const crewOnDay = (item: EstimateLineItem, isoDate: string): number => {
    const matrix = item.daily_workers;
    if (matrix && Object.keys(matrix).length > 0) {
      const v = matrix[isoDate];
      return typeof v === "number" ? v : 0;
    }
    // Uniform fallback — only show if isoDate is within [planned_start, planned_end]
    if (!item.planned_start) return 0;
    const startISO = item.planned_start;
    const endISO = item.planned_end ?? item.planned_start;
    if (isoDate < startISO || isoDate > endISO) return 0;
    const crewDays = item.crew_days ?? 1;
    if (crewDays <= 0) return 0;
    const uniformCrew = (item.man_days ?? 0) / crewDays;
    return Math.round(uniformCrew * 10) / 10;
  };

  // Per-task labor (stored labor_cost preferred; falls back to man_days × rate).
  const taskLabor = (item: EstimateLineItem): number => {
    const stored = item.labor_cost ?? 0;
    if (stored > 0) return Number(stored);
    return computeLaborCost(item, estimateLaborRate);
  };

  const itemsBySection: Record<string, EstimateLineItem[]> = {};
  for (const it of lineItems) {
    const k = it.section_id ?? "_loose";
    (itemsBySection[k] ??= []).push(it);
  }
  const looseItems = itemsBySection["_loose"] ?? [];

  // Index takeoffs by section for O(1) lookup.
  const materialsBySection: Record<string, EstimateSectionMaterial[]> = {};
  for (const m of sectionMaterials) {
    (materialsBySection[m.section_id] ??= []).push(m);
  }

  const sectionLaborTotal = (sectionId: string) =>
    (itemsBySection[sectionId] ?? []).reduce((s, it) => s + taskLabor(it), 0);
  // Material/equipment totals come from the TAKEOFF table now (Option C).
  const sectionMaterialTotal = (sectionId: string) =>
    (materialsBySection[sectionId] ?? [])
      .filter((m) => !m.is_equipment)
      .reduce((s, m) => s + computeSectionMaterialCost(m), 0);
  const sectionEquipmentTotal = (sectionId: string) =>
    (materialsBySection[sectionId] ?? [])
      .filter((m) => m.is_equipment)
      .reduce((s, m) => s + computeSectionMaterialCost(m), 0);
  // Sell total = labor + sum of takeoff sells (with markup applied).
  const sectionSellTotal = (sectionId: string) => {
    const labor = sectionLaborTotal(sectionId);
    const matSell = (materialsBySection[sectionId] ?? [])
      .reduce((s, m) => s + computeSectionMaterialSell(m, estimate), 0);
    return labor + matSell;
  };

  // Find the bar range [firstIdx, lastIdx] for a task: the populated-day window within the days[] array.
  const barRange = (item: EstimateLineItem): { firstIdx: number; lastIdx: number } => {
    let firstIdx = -1;
    let lastIdx = -1;
    for (let i = 0; i < days.length; i++) {
      if (crewOnDay(item, days[i]) > 0) {
        if (firstIdx === -1) firstIdx = i;
        lastIdx = i;
      }
    }
    return { firstIdx, lastIdx };
  };

  const onBarMouseDown = (
    e: ReactMouseEvent<HTMLTableCellElement>,
    item: EstimateLineItem,
  ) => {
    if (disabled) return;
    const { firstIdx, lastIdx } = barRange(item);
    if (firstIdx === -1) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    e.preventDefault();
    setDrag({
      itemId: item.id,
      startX: e.clientX,
      delta: 0,
      firstIdx,
      lastIdx,
      dayCellWidth: rect.width || 28,
    });
  };

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: MouseEvent) => {
      const raw = Math.round((e.clientX - drag.startX) / drag.dayCellWidth);
      if (raw !== drag.delta) setDrag({ ...drag, delta: raw });
    };
    const onUp = () => {
      const d = drag;
      setDrag(null);
      if (d && d.delta !== 0) {
        const it = lineItems.find((li) => li.id === d.itemId);
        if (it) void onReschedule(it, d.delta);
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [drag, lineItems, onReschedule]);

  if (lineItems.length === 0) {
    return (
      <div className="rounded border border-[#34373c] bg-[#202224] py-10 text-center">
        <p className="text-[13px] text-[#555]">No line items yet</p>
      </div>
    );
  }

  return (
    <div className="rounded border border-[#34373c] bg-[#202224] overflow-hidden">
      <div className="px-4 py-3 border-b border-[#2d3035] flex items-center justify-between">
        <span className="text-[11px] font-mono text-[#666] uppercase tracking-widest">Summary · Gantt</span>
        <span className="text-[11px] font-mono text-[#555]">
          {sections.length} section{sections.length === 1 ? "" : "s"} · {lineItems.length} task{lineItems.length === 1 ? "" : "s"} · {days.length} day{days.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-[#292c31]">
              <th className="sticky left-0 z-10 bg-[#202224] px-4 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest text-[#555] min-w-[280px]">Task</th>
              <th className="px-3 py-2.5 text-right text-[10px] font-mono uppercase tracking-widest text-[#555]">Labor $</th>
              <th className="px-3 py-2.5 text-right text-[10px] font-mono uppercase tracking-widest text-[#555]">Material $</th>
              <th className="px-3 py-2.5 text-right text-[10px] font-mono uppercase tracking-widest text-[#555]">Equip. $</th>
              <th className="px-3 py-2.5 text-right text-[10px] font-mono uppercase tracking-widest text-[#555]">Total</th>
              {days.map((d) => {
                const dt = new Date(d + "T00:00:00Z");
                const dow = dt.toLocaleDateString("en-US", { weekday: "narrow", timeZone: "UTC" });
                const dom = dt.getUTCDate();
                const isWeekend = dt.getUTCDay() === 0 || dt.getUTCDay() === 6;
                return (
                  <th
                    key={d}
                    className={cn(
                      "px-1 py-2.5 text-center text-[9px] font-mono uppercase text-[#555]",
                      isWeekend && "bg-[#1b1c1e]",
                    )}
                    style={{ width: 28, minWidth: 28 }}
                    title={d}
                  >
                    <div className="leading-tight">
                      <div>{dow}</div>
                      <div className="text-[#888]">{dom}</div>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#292c31]">
            {sections.map((sec) => {
              const items = itemsBySection[sec.id] ?? [];
              return (
                <Fragment key={sec.id}>
                  <tr className="bg-[#1b1c1e]">
                    <td className="sticky left-0 z-10 bg-[#1b1c1e] px-4 py-2.5 text-[12px] font-semibold text-[#c4c4c4]">{sec.name}</td>
                    <td className="px-3 py-2.5 text-right text-[12px] font-mono text-[#888] tabular-nums">
                      {formatCurrency(sectionLaborTotal(sec.id))}
                    </td>
                    <td className="px-3 py-2.5 text-right text-[12px] font-mono text-[#888] tabular-nums">
                      {formatCurrency(sectionMaterialTotal(sec.id))}
                    </td>
                    <td className="px-3 py-2.5 text-right text-[12px] font-mono text-[#888] tabular-nums">
                      {formatCurrency(sectionEquipmentTotal(sec.id))}
                    </td>
                    <td className="px-3 py-2.5 text-right text-[12px] font-mono text-[#aaa] font-semibold tabular-nums">
                      {formatCurrency(sectionSellTotal(sec.id))}
                    </td>
                    {days.map((d) => (
                      <td key={d} className="bg-[#1b1c1e]" />
                    ))}
                  </tr>

                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={5 + days.length} className="px-4 py-2.5 text-[12px] text-[#555] italic">
                        No tasks
                      </td>
                    </tr>
                  ) : (
                    items.map((item) => {
                      const computedLabor = computeLaborCost(item, estimateLaborRate);
                      const laborDisplay = (item.labor_cost ?? 0) > 0 ? item.labor_cost! : computedLabor;
                      return (
                        <tr key={item.id} className="group hover:bg-[#23252a] transition-colors">
                          <td className="sticky left-0 z-10 bg-[#202224] group-hover:bg-[#23252a] transition-colors px-4 py-3 pl-8 text-[13px] text-[#888]">
                            {item.description || "(untitled)"}
                          </td>
                          <td className="px-3 py-3 text-right text-[12px] font-mono text-[#aaa] tabular-nums">
                            {laborDisplay > 0 ? formatCurrency(laborDisplay) : "—"}
                          </td>
                          <td className="px-3 py-3 text-right text-[12px] font-mono text-[#666] tabular-nums">
                            {(item.material_cost ?? 0) > 0 ? formatCurrency(item.material_cost!) : "—"}
                          </td>
                          <td className="px-3 py-3 text-right text-[12px] font-mono text-[#666] tabular-nums">
                            {(item.equipment_cost ?? 0) > 0 ? formatCurrency(item.equipment_cost!) : "—"}
                          </td>
                          <td className="px-3 py-3 text-right text-[13px] font-mono text-[#aaa] font-semibold tabular-nums">
                            {formatCurrency(taskLabor(item))}
                          </td>
                          {days.map((d, i) => {
                            const crew = crewOnDay(item, d);
                            const dow = new Date(d + "T00:00:00Z").getUTCDay();
                            const isWeekend = dow === 0 || dow === 6;
                            const isDraggingThis = drag?.itemId === item.id;
                            const inPreview =
                              isDraggingThis &&
                              i >= drag.firstIdx + drag.delta &&
                              i <= drag.lastIdx + drag.delta;
                            const isBarCell = crew > 0;
                            return (
                              <td
                                key={d}
                                onMouseDown={isBarCell ? (e) => onBarMouseDown(e, item) : undefined}
                                className={cn(
                                  "px-1 py-3 text-center text-[11px] font-mono tabular-nums border-l border-[#23252a] select-none",
                                  isWeekend ? "bg-[#1b1c1e]/40" : "",
                                  isBarCell ? "bg-[#2d3035] text-[#F5A623]" : "text-[#3a3d42]",
                                  isBarCell && !disabled && (isDraggingThis ? "cursor-grabbing" : "cursor-grab"),
                                  inPreview && "ring-1 ring-inset ring-[#F5A623]/50",
                                )}
                                style={{ width: 28, minWidth: 28 }}
                              >
                                {crew > 0 ? crew : ""}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })
                  )}
                </Fragment>
              );
            })}

            {looseItems.length > 0 && (
              <Fragment>
                <tr className="bg-[#1b1c1e]">
                  <td colSpan={5 + days.length} className="px-4 py-2.5 text-[12px] italic text-[#666]">
                    Unsectioned line items
                  </td>
                </tr>
                {looseItems.map((item) => {
                  const computedLabor = computeLaborCost(item, estimateLaborRate);
                  const laborDisplay = (item.labor_cost ?? 0) > 0 ? item.labor_cost! : computedLabor;
                  return (
                    <tr key={item.id} className="group hover:bg-[#23252a] transition-colors">
                      <td className="sticky left-0 z-10 bg-[#202224] group-hover:bg-[#23252a] transition-colors px-4 py-3 pl-8 text-[13px] text-[#888]">
                        {item.description || "(untitled)"}
                      </td>
                      <td className="px-3 py-3 text-right text-[12px] font-mono text-[#aaa] tabular-nums">
                        {laborDisplay > 0 ? formatCurrency(laborDisplay) : "—"}
                      </td>
                      <td className="px-3 py-3 text-right text-[12px] font-mono text-[#666] tabular-nums">
                        {(item.material_cost ?? 0) > 0 ? formatCurrency(item.material_cost!) : "—"}
                      </td>
                      <td className="px-3 py-3 text-right text-[12px] font-mono text-[#666] tabular-nums">
                        {(item.equipment_cost ?? 0) > 0 ? formatCurrency(item.equipment_cost!) : "—"}
                      </td>
                      <td className="px-3 py-3 text-right text-[13px] font-mono text-[#aaa] font-semibold tabular-nums">
                        {formatCurrency(taskLabor(item))}
                      </td>
                      {days.map((d, i) => {
                        const crew = crewOnDay(item, d);
                        const isDraggingThis = drag?.itemId === item.id;
                        const inPreview =
                          isDraggingThis &&
                          i >= drag.firstIdx + drag.delta &&
                          i <= drag.lastIdx + drag.delta;
                        const isBarCell = crew > 0;
                        return (
                          <td
                            key={d}
                            onMouseDown={isBarCell ? (e) => onBarMouseDown(e, item) : undefined}
                            className={cn(
                              "px-1 py-3 text-center text-[11px] font-mono tabular-nums border-l border-[#23252a] select-none",
                              isBarCell ? "bg-[#2d3035] text-[#F5A623]" : "text-[#3a3d42]",
                              isBarCell && !disabled && (isDraggingThis ? "cursor-grabbing" : "cursor-grab"),
                              inPreview && "ring-1 ring-inset ring-[#F5A623]/50",
                            )}
                            style={{ width: 28, minWidth: 28 }}
                          >
                            {crew > 0 ? crew : ""}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </Fragment>
            )}
          </tbody>
        </table>
      </div>
      {days.length === 0 && (
        <div className="px-4 py-2.5 border-t border-[#2d3035] text-[11px] font-mono text-[#555]">
          No planned dates on any task — set planned_start / planned_end to populate the Gantt grid.
        </div>
      )}
    </div>
  );
}
