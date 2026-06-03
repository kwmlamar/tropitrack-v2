"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import type { Worker } from "@/types";

const STATUS_DOT: Record<string, string> = {
  active:     "bg-[#22C55E]",
  inactive:   "bg-[#F5A623]",
  terminated: "bg-[#EF4444]",
};

const STATUS_OPTIONS = ["all", "active", "inactive", "terminated"];

export default function WorkersPage() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const supabase = createClient();
  const { toast } = useToast();
  const { profile, loading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading) return;
    if (profile && !profile.company_id) { setLoading(false); return; }
    if (profile?.company_id) fetchWorkers();
    else if (profile === null) setLoading(false);
  }, [statusFilter, profile?.company_id, profile, authLoading]);

  const fetchWorkers = async () => {
    if (!profile?.company_id) return;
    setLoading(true);
    try {
      let query = supabase
        .from("workers")
        .select("*")
        .eq("company_id", profile.company_id)
        .order("last_name");
      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      const { data, error } = await query;
      if (error) throw error;
      setWorkers(data || []);
    } catch (error) {
      console.error("Error fetching workers:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this worker?")) return;
    const isAdmin = profile?.role === "admin" || profile?.role === "project_manager";
    if (!isAdmin) { toast({ title: "Permission denied", variant: "destructive" }); return; }

    const { count: timeCount } = await supabase
      .from("time_entries").select("*", { count: "exact", head: true }).eq("worker_id", id);
    if (timeCount && timeCount > 0) {
      toast({ title: "Cannot delete", description: `Has ${timeCount} time entries — mark inactive instead.`, variant: "destructive" });
      return;
    }
    const { count: payCount } = await supabase
      .from("payroll_entries").select("*", { count: "exact", head: true }).eq("worker_id", id);
    if (payCount && payCount > 0) {
      toast({ title: "Cannot delete", description: `Has ${payCount} payroll entries — mark inactive instead.`, variant: "destructive" });
      return;
    }
    const { data, error } = await supabase.from("workers").delete().eq("id", id).select();
    if (error || !data?.length) { toast({ title: "Could not delete", variant: "destructive" }); return; }
    toast({ title: "Deleted" });
    fetchWorkers();
  };

  const filtered = workers.filter((w) =>
    `${w.first_name} ${w.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (w.email?.toLowerCase() || "").includes(searchTerm.toLowerCase())
  );

  const stats = [
    { label: "Active",    value: workers.filter(w => w.status === "active").length },
    { label: "Hourly",    value: workers.filter(w => w.worker_type === "hourly").length },
    { label: "Salaried",  value: workers.filter(w => w.worker_type === "salary").length },
    { label: "Total",     value: workers.length },
  ];

  return (
    <div className="flex flex-col h-full overflow-auto bg-[#18191b]">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#34373c] flex-shrink-0">
        <div>
          <p className="text-[11px] font-mono text-[#666] uppercase tracking-widest">Crew</p>
          <h1 className="text-[16px] font-semibold text-[#d0d0d0] mt-0.5">All Workers</h1>
        </div>
        <Link href="/workers/new" className="text-[12px] font-medium text-[#F5A623] hover:opacity-80 transition-opacity">
          + Add Worker
        </Link>
      </div>

      <div className="flex-1 p-6 space-y-5">
        <div className="grid grid-cols-4 gap-3">
          {loading
            ? Array(4).fill(0).map((_, i) => <div key={i} className="h-[72px] rounded border border-[#34373c] bg-[#202224] animate-pulse" />)
            : stats.map(s => (
                <div key={s.label} className="rounded border border-[#34373c] bg-[#202224] px-4 py-3.5">
                  <p className="text-[11px] font-mono text-[#666] uppercase tracking-wider">{s.label}</p>
                  <p className="text-[22px] font-semibold font-mono text-[#d0d0d0] mt-1 leading-none">{s.value}</p>
                </div>
              ))
          }
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search workers..."
            className="flex-1 min-w-[200px] bg-[#202224] border border-[#34373c] rounded px-3 py-2 text-[13px] text-[#aaa] placeholder:text-[#444] outline-none focus:border-[#333] transition-colors"
          />
          <div className="flex items-center gap-1">
            {STATUS_OPTIONS.map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "px-2.5 py-1.5 rounded text-[10px] font-mono uppercase tracking-wide transition-colors",
                  statusFilter === s ? "bg-[#2d3035] text-[#F5A623] border border-[#333]" : "text-[#555] hover:text-[#999]"
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded border border-[#34373c] bg-[#202224] overflow-hidden">
          {loading ? (
            <div className="divide-y divide-[#292c31]">
              {Array(5).fill(0).map((_, i) => <div key={i} className="h-[52px] animate-pulse" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-[13px] text-[#555]">{searchTerm || statusFilter !== "all" ? "No workers match" : "No workers yet"}</p>
              <Link href="/workers/new" className="inline-block mt-3 text-[12px] text-[#F5A623] hover:opacity-80">
                Add your first worker →
              </Link>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#2d3035]">
                  <th className="px-5 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest text-[#555]">Name</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest text-[#555]">Type</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest text-[#555]">Rate</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest text-[#555]">Phone</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest text-[#555]">Hired</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest text-[#555]">Status</th>
                  <th className="w-32 px-5 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#292c31]">
                {filtered.map(worker => (
                  <tr key={worker.id} className="group hover:bg-[#23252a] transition-colors">
                    <td className="px-5 py-3">
                      <Link href={`/workers/${worker.id}`} className="text-[13px] text-[#aaa] group-hover:text-[#c4c4c4] transition-colors">
                        {worker.first_name} {worker.last_name}
                      </Link>
                      {worker.email && <p className="text-[11px] text-[#555] mt-0.5">{worker.email}</p>}
                    </td>
                    <td className="px-5 py-3 text-[12px] font-mono text-[#666] capitalize">{worker.worker_type}</td>
                    <td className="px-5 py-3 text-[12px] font-mono text-[#aaa]">
                      {worker.worker_type === "hourly" && worker.hourly_rate
                        ? `${formatCurrency(worker.hourly_rate)}/hr`
                        : worker.salary_amount
                        ? `${formatCurrency(worker.salary_amount)}/yr`
                        : "—"}
                    </td>
                    <td className="px-5 py-3 text-[12px] font-mono text-[#666]">{worker.phone || "—"}</td>
                    <td className="px-5 py-3 text-[11px] font-mono text-[#555]">{formatDate(worker.hire_date)}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className={cn("h-1.5 w-1.5 rounded-full flex-shrink-0", STATUS_DOT[worker.status] ?? "bg-[#404040]")} />
                        <span className="text-[11px] font-mono text-[#666] capitalize">{worker.status}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link href={`/workers/${worker.id}`} className="text-[11px] text-[#666] hover:text-[#aaa] transition-colors">View</Link>
                        <Link href={`/workers/${worker.id}/edit`} className="text-[11px] text-[#666] hover:text-[#aaa] transition-colors">Edit</Link>
                        <button onClick={() => handleDelete(worker.id)} className="text-[11px] text-[#666] hover:text-[#EF4444] transition-colors">Delete</button>
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
