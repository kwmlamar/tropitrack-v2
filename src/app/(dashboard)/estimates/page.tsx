"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import type { Estimate, EstimateStatus } from "@/types";

const STATUS_DOT: Record<string, string> = {
  draft:     "bg-surface-400",
  sent:      "bg-info-solid",
  approved:  "bg-success-solid",
  rejected:  "bg-destructive-solid",
  converted: "bg-primary",
  expired:   "bg-warning-solid",
};

const STATUS_OPTIONS = ["all", "draft", "sent", "approved", "rejected", "converted", "expired"];

export default function EstimatesPage() {
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const supabase = createClient();
  const { toast } = useToast();
  const { profile, loading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading) return;
    if (profile && !profile.company_id) { setLoading(false); return; }
    if (profile?.company_id) fetchEstimates();
    else if (profile === null) setLoading(false);
  }, [statusFilter, profile?.company_id, profile, authLoading]);

  const fetchEstimates = async () => {
    if (!profile?.company_id) return;
    setLoading(true);
    try {
      let query = supabase
        .from("estimates")
        .select("*")
        .eq("company_id", profile.company_id)
        .order("created_at", { ascending: false });
      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      const { data, error } = await query;
      if (error) throw error;
      setEstimates(data || []);
    } catch (error) {
      console.error("Error fetching estimates:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this estimate?")) return;
    const isAdmin = profile?.role === "admin" || profile?.role === "project_manager";
    if (!isAdmin) { toast({ title: "Permission denied", variant: "destructive" }); return; }
    const { data, error } = await supabase.from("estimates").delete().eq("id", id).select();
    if (error || !data?.length) { toast({ title: "Could not delete", variant: "destructive" }); return; }
    toast({ title: "Deleted" });
    fetchEstimates();
  };

  const handleStatusChange = async (id: string, newStatus: EstimateStatus) => {
    const updateData: Partial<Estimate> = { status: newStatus };
    if (newStatus === "sent") updateData.sent_at = new Date().toISOString();
    if (newStatus === "approved") updateData.approved_at = new Date().toISOString();
    if (newStatus === "rejected") updateData.rejected_at = new Date().toISOString();
    const { error } = await supabase.from("estimates").update(updateData).eq("id", id);
    if (!error) setEstimates(estimates.map((e) => e.id === id ? { ...e, ...updateData } : e));
  };

  const filtered = estimates.filter(
    (e) =>
      (e.estimate_number || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (e.title || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (e.client_name || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const pipelineValue = estimates
    .filter((e) => ["sent", "approved"].includes(e.status))
    .reduce((s, e) => s + Number(e.total_amount || 0), 0);

  const stats = [
    { label: "Total",    value: estimates.length,                                           accent: false },
    { label: "Pending",  value: estimates.filter((e) => e.status === "sent").length,        accent: false },
    { label: "Approved", value: estimates.filter((e) => e.status === "approved").length,    accent: false },
    { label: "Pipeline", value: `BSD $${pipelineValue.toLocaleString()}`,                   accent: true  },
  ];

  return (
    <div className="flex flex-col h-full overflow-auto bg-background">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
        <div>
          <p className="text-[11px] font-mono text-foreground-lighter uppercase tracking-widest">Estimates</p>
          <h1 className="text-[16px] font-semibold text-foreground mt-0.5">All Estimates</h1>
        </div>
        <Link
          href="/estimates/builder"
          className="text-[12px] font-medium text-brand hover:opacity-80 transition-opacity"
        >
          + New Estimate
        </Link>
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
                {searchTerm || statusFilter !== "all" ? "No estimates match your filter" : "No estimates yet"}
              </p>
              <Link
                href="/estimates/builder"
                className="inline-block mt-3 text-[12px] text-brand hover:opacity-80"
              >
                Create your first estimate →
              </Link>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">Number</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">Title</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">Client</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">Date</th>
                  <th className="px-5 py-2.5 text-right text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">Amount</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">Status</th>
                  <th className="w-40 px-5 py-2.5" />
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
                    <td className="px-5 py-3 text-[13px] text-foreground-lighter max-w-[180px]">
                      <span className="truncate block">{est.title}</span>
                    </td>
                    <td className="px-5 py-3 text-[13px] text-foreground-lighter">{est.client_name}</td>
                    <td className="px-5 py-3 text-[11px] tabular-nums text-foreground-lighter">{formatDate(est.issue_date)}</td>
                    <td className="px-5 py-3 text-right text-[13px] tabular-nums text-foreground-light">
                      {formatCurrency(est.total_amount)}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className={cn("h-1.5 w-1.5 rounded-full flex-shrink-0", STATUS_DOT[est.status] ?? "bg-surface-400")} />
                        <span className="text-[11px] tabular-nums text-foreground-lighter capitalize">{est.status}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link
                          href={`/estimates/${est.id}`}
                          className="text-[11px] text-foreground-lighter hover:text-foreground-light transition-colors"
                        >
                          View
                        </Link>
                        {est.status === "draft" && (
                          <button
                            onClick={() => handleStatusChange(est.id, "sent")}
                            className="text-[11px] text-info hover:opacity-80 transition-opacity"
                          >
                            Mark sent
                          </button>
                        )}
                        {est.status === "sent" && (
                          <button
                            onClick={() => handleStatusChange(est.id, "approved")}
                            className="text-[11px] text-success hover:opacity-80 transition-opacity"
                          >
                            Approve
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(est.id)}
                          className="text-[11px] text-foreground-lighter hover:text-destructive transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
