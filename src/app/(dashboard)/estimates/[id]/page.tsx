"use client";

import { useEffect, useState } from "react";
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
import { Loader2 } from "lucide-react";
import type { Estimate, EstimateLineItem, EstimateStatus } from "@/types";

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
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [lineItems, setLineItems] = useState<EstimateLineItem[]>([]);
  const [sections, setSections] = useState<EstimateSection[]>([]);
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [converting, setConverting] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectLocation, setProjectLocation] = useState("");
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailForm, setEmailForm] = useState({ to_email: "", subject: "", message: "" });

  // View mode synced to ?view=client | internal (default: internal)
  const view: ViewMode = searchParams.get("view") === "client" ? "client" : "internal";
  const setView = (next: ViewMode) => {
    const sp = new URLSearchParams(searchParams.toString());
    if (next === "internal") sp.delete("view");
    else sp.set("view", next);
    router.replace(`/estimates/${estimateId}${sp.toString() ? `?${sp.toString()}` : ""}`);
  };

  useEffect(() => {
    fetchEstimateData();
    if (searchParams.get("convert") === "true") setShowConvertDialog(true);
  }, [estimateId]);

  const fetchEstimateData = async () => {
    setLoading(true);
    try {
      const [estimateRes, itemsRes, sectionsRes] = await Promise.all([
        supabase.from("estimates").select("*").eq("id", estimateId).single(),
        supabase.from("estimate_line_items").select("*").eq("estimate_id", estimateId).order("order_index"),
        supabase.from("estimate_sections").select("*").eq("estimate_id", estimateId).order("order_index"),
      ]);
      if (estimateRes.error) throw estimateRes.error;
      setEstimate(estimateRes.data);
      setLineItems(itemsRes.data || []);
      setSections((sectionsRes.data as EstimateSection[]) || []);
      setProjectName(estimateRes.data.title);
    } catch (error) {
      toast({ title: "Error", description: "Failed to load estimate", variant: "destructive" });
    } finally {
      setLoading(false);
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
        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Internal / Client view toggle */}
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
          <Link
            href={`/estimates/${estimateId}/builder`}
            className="text-[12px] text-[#666] hover:text-[#aaa] transition-colors"
          >
            Edit
          </Link>
          <Link
            href={`/estimates/${estimateId}/preview`}
            className="text-[12px] text-[#666] hover:text-[#aaa] transition-colors"
          >
            Preview PDF
          </Link>
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
              className="text-[12px] text-[#3B82F6] hover:opacity-80 transition-opacity"
            >
              Send email
            </button>
          )}
          {estimate.status === "sent" && (
            <>
              <button
                onClick={() => handleStatusChange("approved")}
                className="text-[12px] text-[#22C55E] hover:opacity-80 transition-opacity"
              >
                Approve
              </button>
              <button
                onClick={() => handleStatusChange("rejected")}
                className="text-[12px] text-[#EF4444] hover:opacity-80 transition-opacity"
              >
                Reject
              </button>
            </>
          )}
          {estimate.status === "approved" && !estimate.project_id && (
            <button
              onClick={() => setShowConvertDialog(true)}
              className="text-[12px] text-[#F5A623] hover:opacity-80 transition-opacity"
            >
              Convert to job
            </button>
          )}
          {estimate.project_id && (
            <Link
              href={`/projects/${estimate.project_id}`}
              className="text-[12px] text-[#A855F7] hover:opacity-80 transition-opacity"
            >
              View job →
            </Link>
          )}
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

        {/* Line items — different shape per view */}
        {view === "internal" ? (
          <div className="rounded border border-[#34373c] bg-[#202224] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#2d3035] flex items-center justify-between">
              <span className="text-[11px] font-mono text-[#666] uppercase tracking-widest">Line Items</span>
              <span className="text-[11px] font-mono text-[#555]">{lineItems.length} items</span>
            </div>
            {lineItems.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-[13px] text-[#555]">No line items</p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#292c31]">
                    <th className="px-4 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest text-[#555]">Type</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest text-[#555] w-[40%]">Description</th>
                    <th className="px-4 py-2.5 text-right text-[10px] font-mono uppercase tracking-widest text-[#555]">Qty</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest text-[#555]">Unit</th>
                    <th className="px-4 py-2.5 text-right text-[10px] font-mono uppercase tracking-widest text-[#555]">Rate</th>
                    <th className="px-4 py-2.5 text-right text-[10px] font-mono uppercase tracking-widest text-[#555]">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#292c31]">
                  {lineItems.map((item) => (
                    <tr key={item.id} className="hover:bg-[#23252a] transition-colors">
                      <td className="px-4 py-3">
                        <span className="text-[10px] font-mono text-[#555] capitalize">{item.category}</span>
                      </td>
                      <td className="px-4 py-3 text-[13px] text-[#888]">{item.description}</td>
                      <td className="px-4 py-3 text-right text-[12px] font-mono text-[#666]">{item.quantity}</td>
                      <td className="px-4 py-3 text-[12px] font-mono text-[#555]">{item.unit || "—"}</td>
                      <td className="px-4 py-3 text-right text-[12px] font-mono text-[#666]">
                        {formatCurrency(item.unit_rate || 0)}
                      </td>
                      <td className="px-4 py-3 text-right text-[13px] font-mono text-[#aaa] font-semibold">
                        {formatCurrency(item.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
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
