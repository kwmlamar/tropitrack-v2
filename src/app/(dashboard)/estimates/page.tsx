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
  draft:     "bg-[#555]",
  sent:      "bg-[#3B82F6]",
  approved:  "bg-[#22C55E]",
  rejected:  "bg-[#EF4444]",
  converted: "bg-[#A855F7]",
  expired:   "bg-[#F5A623]",
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
      e.estimate_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.client_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const pipelineValue = estimates
    .filter((e) => ["sent", "approved"].includes(e.status))
    .reduce((s, e) => s + e.total_amount, 0);

  const stats = [
    { label: "Total",    value: estimates.length,                                           accent: false },
    { label: "Pending",  value: estimates.filter((e) => e.status === "sent").length,        accent: false },
    { label: "Approved", value: estimates.filter((e) => e.status === "approved").length,    accent: false },
    { label: "Pipeline", value: `BSD $${pipelineValue.toLocaleString()}`,                   accent: true  },
  ];

  return (
    <div className="flex flex-col h-full overflow-auto bg-[#18191b]">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#34373c] flex-shrink-0">
        <div>
          <p className="text-[11px] font-mono text-[#666] uppercase tracking-widest">Estimates</p>
          <h1 className="text-[16px] font-semibold text-[#d0d0d0] mt-0.5">All Estimates</h1>
        </div>
        <Link
          href="/estimates/builder"
          className="text-[12px] font-medium text-[#F5A623] hover:opacity-80 transition-opacity"
        >
          + New Estimate
        </Link>
      </div>

      <div className="flex-1 p-6 space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-3">
          {loading
            ? Array(4).fill(0).map((_, i) => (
                <div key={i} className="h-[72px] rounded border border-[#34373c] bg-[#202224] animate-pulse" />
              ))
            : stats.map((s) => (
                <div key={s.label} className="rounded border border-[#34373c] bg-[#202224] px-4 py-3.5">
                  <p className="text-[11px] font-mono text-[#666] uppercase tracking-wider">{s.label}</p>
                  <p className={cn(
                    "text-[22px] font-semibold font-mono mt-1 leading-none",
                    s.accent ? "text-[#F5A623]" : "text-[#d0d0d0]"
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
            className="flex-1 min-w-[200px] bg-[#202224] border border-[#34373c] rounded px-3 py-2 text-[13px] text-[#aaa] placeholder:text-[#444] outline-none focus:border-[#333] transition-colors"
          />
          <div className="flex items-center gap-1 flex-wrap">
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "px-2.5 py-1.5 rounded text-[10px] font-mono uppercase tracking-wide transition-colors",
                  statusFilter === s
                    ? "bg-[#2d3035] text-[#F5A623] border border-[#333]"
                    : "text-[#555] hover:text-[#999]"
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="rounded border border-[#34373c] bg-[#202224] overflow-hidden">
          {loading ? (
            <div className="divide-y divide-[#292c31]">
              {Array(6).fill(0).map((_, i) => (
                <div key={i} className="h-[52px] animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-[13px] text-[#555]">
                {searchTerm || statusFilter !== "all" ? "No estimates match your filter" : "No estimates yet"}
              </p>
              <Link
                href="/estimates/builder"
                className="inline-block mt-3 text-[12px] text-[#F5A623] hover:opacity-80"
              >
                Create your first estimate →
              </Link>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#2d3035]">
                  <th className="px-5 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest text-[#555]">Number</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest text-[#555]">Title</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest text-[#555]">Client</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest text-[#555]">Date</th>
                  <th className="px-5 py-2.5 text-right text-[10px] font-mono uppercase tracking-widest text-[#555]">Amount</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest text-[#555]">Status</th>
                  <th className="w-40 px-5 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#292c31]">
                {filtered.map((est) => (
                  <tr key={est.id} className="group hover:bg-[#23252a] transition-colors">
                    <td className="px-5 py-3">
                      <Link
                        href={`/estimates/${est.id}`}
                        className="text-[13px] font-mono text-[#aaa] group-hover:text-[#c4c4c4] transition-colors"
                      >
                        {est.estimate_number}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-[13px] text-[#777] max-w-[180px]">
                      <span className="truncate block">{est.title}</span>
                    </td>
                    <td className="px-5 py-3 text-[13px] text-[#777]">{est.client_name}</td>
                    <td className="px-5 py-3 text-[11px] font-mono text-[#555]">{formatDate(est.issue_date)}</td>
                    <td className="px-5 py-3 text-right text-[13px] font-mono text-[#aaa]">
                      {formatCurrency(est.total_amount)}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className={cn("h-1.5 w-1.5 rounded-full flex-shrink-0", STATUS_DOT[est.status] ?? "bg-[#404040]")} />
                        <span className="text-[11px] font-mono text-[#666] capitalize">{est.status}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link
                          href={`/estimates/${est.id}`}
                          className="text-[11px] text-[#666] hover:text-[#aaa] transition-colors"
                        >
                          View
                        </Link>
                        {est.status === "draft" && (
                          <button
                            onClick={() => handleStatusChange(est.id, "sent")}
                            className="text-[11px] text-[#3B82F6] hover:opacity-80 transition-opacity"
                          >
                            Mark sent
                          </button>
                        )}
                        {est.status === "sent" && (
                          <button
                            onClick={() => handleStatusChange(est.id, "approved")}
                            className="text-[11px] text-[#22C55E] hover:opacity-80 transition-opacity"
                          >
                            Approve
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(est.id)}
                          className="text-[11px] text-[#666] hover:text-[#EF4444] transition-colors"
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
