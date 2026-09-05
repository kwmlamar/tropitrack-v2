"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { EstimateStatus } from "@/types";

// Register rows join in the client/project name via FK embedding — the
// `Estimate` type in @/types models the raw table, so a light local shape
// covers what this view actually reads off the joined query.
type RegisterEstimate = {
  id: string;
  estimate_number: string;
  title: string;
  client_name: string | null;
  client_id: string | null;
  project_id: string | null;
  status: EstimateStatus;
  total_amount: number;
  issue_date: string;
  document_url: string | null;
  clients: { name: string } | null;
  projects: { name: string } | null;
};

type ProjectOption = { id: string; name: string };

const STATUS_DOT: Record<string, string> = {
  draft: "bg-surface-400",
  sent: "bg-info-solid",
  approved: "bg-success-solid",
  rejected: "bg-destructive-solid",
  converted: "bg-primary",
};

const STATUS_OPTIONS = ["all", "draft", "sent", "approved", "rejected", "converted"];

export default function EstimatesPage() {
  const [estimates, setEstimates] = useState<RegisterEstimate[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [convertTarget, setConvertTarget] = useState<RegisterEstimate | null>(null);
  const [convertProjectId, setConvertProjectId] = useState<string>("");
  const [converting, setConverting] = useState(false);
  const supabase = createClient();
  const { toast } = useToast();
  const { profile, loading: authLoading } = useAuth();

  const isAdmin = profile?.role === "admin" || profile?.role === "project_manager";

  useEffect(() => {
    if (authLoading) return;
    if (profile && !profile.company_id) { setLoading(false); return; }
    if (profile?.company_id) fetchEstimates();
    else if (profile === null) setLoading(false);
  }, [profile?.company_id, profile, authLoading]);

  const fetchEstimates = async () => {
    if (!profile?.company_id) return;
    setLoading(true);
    try {
      const [estimatesRes, projectsRes] = await Promise.all([
        supabase
          .from("estimates")
          .select(
            "id, estimate_number, title, client_name, client_id, project_id, status, total_amount, issue_date, document_url, clients(name), projects(name)"
          )
          .eq("company_id", profile.company_id)
          .order("issue_date", { ascending: false }),
        supabase
          .from("projects")
          .select("id, name")
          .eq("company_id", profile.company_id)
          .order("name"),
      ]);
      if (estimatesRes.error) throw estimatesRes.error;
      setEstimates((estimatesRes.data as unknown as RegisterEstimate[]) || []);
      setProjects((projectsRes.data as ProjectOption[]) || []);
    } catch (error) {
      console.error("Error fetching estimates:", error);
      toast({ title: "Error", description: "Failed to load estimates", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const applyStatusChange = async (id: string, newStatus: EstimateStatus, extra: Record<string, unknown> = {}) => {
    const updateData: Record<string, unknown> = { status: newStatus, ...extra };
    if (newStatus === "sent") updateData.sent_at = new Date().toISOString();
    if (newStatus === "approved") updateData.approved_at = new Date().toISOString();
    if (newStatus === "rejected") updateData.rejected_at = new Date().toISOString();
    if (newStatus === "converted") updateData.converted_at = new Date().toISOString();
    const { error } = await supabase.from("estimates").update(updateData).eq("id", id);
    if (error) {
      toast({ title: "Could not update status", description: error.message, variant: "destructive" });
      return;
    }
    setEstimates((prev) => prev.map((e) => (e.id === id ? { ...e, ...updateData } as RegisterEstimate : e)));
  };

  const handleMarkConverted = (estimate: RegisterEstimate) => {
    if (estimate.project_id) {
      applyStatusChange(estimate.id, "converted");
      return;
    }
    setConvertTarget(estimate);
    setConvertProjectId("");
  };

  const confirmConvert = async () => {
    if (!convertTarget || !convertProjectId) return;
    setConverting(true);
    try {
      await applyStatusChange(convertTarget.id, "converted", { project_id: convertProjectId });
      setConvertTarget(null);
    } finally {
      setConverting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this estimate?")) return;
    if (!isAdmin) { toast({ title: "Permission denied", variant: "destructive" }); return; }
    const { data, error } = await supabase.from("estimates").delete().eq("id", id).select();
    if (error || !data?.length) { toast({ title: "Could not delete", variant: "destructive" }); return; }
    toast({ title: "Deleted" });
    setEstimates((prev) => prev.filter((e) => e.id !== id));
  };

  const filtered = estimates.filter(
    (e) =>
      (e.estimate_number || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (e.title || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (e.clients?.name || e.client_name || "").toLowerCase().includes(searchTerm.toLowerCase())
  ).filter((e) => statusFilter === "all" || e.status === statusFilter);

  const stats = useMemo(() => {
    const totalQuoted = estimates.reduce((s, e) => s + Number(e.total_amount || 0), 0);
    const awaitingResponse = estimates.filter((e) => e.status === "sent").length;
    const approved = estimates.filter((e) => e.status === "approved" || e.status === "converted").length;
    const decided = estimates.filter((e) => ["approved", "rejected", "converted"].includes(e.status)).length;
    const won = estimates.filter((e) => e.status === "approved" || e.status === "converted").length;
    const winRate = decided > 0 ? `${Math.round((won / decided) * 100)}%` : "—";
    return [
      { label: "Total Quoted", value: formatCurrency(totalQuoted), accent: true },
      { label: "Awaiting Response", value: String(awaitingResponse), accent: false },
      { label: "Approved", value: String(approved), accent: false },
      { label: "Win Rate", value: winRate, accent: false },
    ];
  }, [estimates]);

  return (
    <div className="flex flex-col h-full overflow-auto bg-background">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
        <div>
          <p className="text-[11px] font-mono text-foreground-lighter uppercase tracking-widest">Estimates</p>
          <h1 className="text-[16px] font-semibold text-foreground mt-0.5">Register</h1>
        </div>
        <p className="text-[11px] text-foreground-lighter max-w-[320px] text-right">
          Estimates are authored outside TropiTrack. This is the record of what was quoted — not a builder.
        </p>
      </div>

      <div className="flex-1 p-6 space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-3">
          {loading
            ? Array(4).fill(0).map((_, i) => (
                <div key={i} className="h-[72px] rounded-lg border border-border bg-surface-100 animate-pulse" />
              ))
            : stats.map((s) => (
                <div key={s.label} className="rounded-lg border border-border bg-surface-100 px-4 py-3.5">
                  <p className="text-[11px] font-mono text-foreground-lighter uppercase tracking-wider">{s.label}</p>
                  <p className={cn(
                    "text-[22px] font-semibold tabular-nums mt-1 leading-none",
                    s.accent ? "text-brand" : "text-foreground"
                  )}>
                    {s.value}
                  </p>
                </div>
              ))
          }
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search estimates..."
            className="flex-1 min-w-[200px] bg-surface-100 border border-border rounded-md px-3 py-2 text-[13px] text-foreground-light placeholder:text-foreground-lighter outline-none focus:border-strong transition-colors"
          />
          <div className="flex items-center gap-1 flex-wrap">
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "px-2.5 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-wide transition-colors",
                  statusFilter === s
                    ? "bg-surface-300 text-brand border border-strong"
                    : "text-foreground-lighter hover:text-foreground-light"
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="rounded-lg border border-border bg-surface-100 overflow-hidden">
          {loading ? (
            <div className="divide-y divide-border">
              {Array(6).fill(0).map((_, i) => (
                <div key={i} className="h-[52px] animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-[13px] text-foreground-lighter">
                {searchTerm || statusFilter !== "all"
                  ? "No estimates match your filter"
                  : "No estimates yet — estimates are created from your estimating skill"}
              </p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">Number</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">Client</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">Project</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">Issued</th>
                  <th className="px-5 py-2.5 text-right text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">Amount</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">Status</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">Document</th>
                  <th className="w-44 px-5 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((est) => (
                  <tr key={est.id} className="group hover:bg-surface-200 transition-colors">
                    <td className="px-5 py-3">
                      <Link
                        href={`/estimates/${est.id}`}
                        className="text-[13px] tabular-nums text-foreground-light group-hover:text-foreground transition-colors"
                      >
                        {est.estimate_number}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-[13px] text-foreground-lighter">
                      {est.clients?.name || est.client_name || "—"}
                    </td>
                    <td className="px-5 py-3 text-[13px] text-foreground-lighter max-w-[180px]">
                      {est.project_id ? (
                        <Link href={`/projects/${est.project_id}`} className="truncate block hover:text-foreground-light transition-colors">
                          {est.projects?.name || "View job"}
                        </Link>
                      ) : (
                        <span className="text-foreground-lighter">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-[11px] tabular-nums text-foreground-lighter">{formatDate(est.issue_date)}</td>
                    <td className="px-5 py-3 text-right text-[13px] tabular-nums text-foreground-light">
                      {formatCurrency(est.total_amount)}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className={cn("h-1.5 w-1.5 rounded-full flex-shrink-0", STATUS_DOT[est.status] ?? "bg-surface-400")} />
                        <Select
                          value={est.status}
                          onValueChange={(value) => {
                            if (value === "converted") handleMarkConverted(est);
                            else applyStatusChange(est.id, value as EstimateStatus);
                          }}
                        >
                          <SelectTrigger className="h-6 w-[110px] border-none bg-transparent px-0 text-[11px] tabular-nums text-foreground-lighter capitalize shadow-none hover:text-foreground-light focus:ring-0">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUS_OPTIONS.filter((s) => s !== "all").map((s) => (
                              <SelectItem key={s} value={s} className="text-[12px] capitalize">
                                {s}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      {est.document_url ? (
                        <a
                          href={est.document_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-brand hover:opacity-80 transition-opacity"
                        >
                          Document <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="text-[11px] text-foreground-lighter">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link
                          href={`/estimates/${est.id}`}
                          className="text-[11px] text-foreground-lighter hover:text-foreground-light transition-colors"
                        >
                          View
                        </Link>
                        {isAdmin && (
                          <button
                            onClick={() => handleDelete(est.id)}
                            className="text-[11px] text-foreground-lighter hover:text-destructive transition-colors"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Convert-to-job dialog — required whenever a not-yet-linked estimate is marked converted */}
      <Dialog open={!!convertTarget} onOpenChange={(open) => !open && setConvertTarget(null)}>
        <DialogContent className="bg-surface-100 border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-foreground">Link to a job</DialogTitle>
            <DialogDescription className="text-foreground-lighter">
              An estimate can only be marked converted once it&rsquo;s linked to the job it became.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Select value={convertProjectId} onValueChange={setConvertProjectId}>
              <SelectTrigger className="bg-surface-100 border-strong text-foreground">
                <SelectValue placeholder="Select a job..." />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <button
              onClick={() => setConvertTarget(null)}
              className="px-4 py-2 text-[12px] text-foreground-lighter hover:text-foreground-light transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={confirmConvert}
              disabled={!convertProjectId || converting}
              className="px-4 py-2 rounded-md bg-surface-300 border border-strong text-[12px] text-brand hover:bg-surface-400 transition-colors disabled:opacity-40"
            >
              Mark converted
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
