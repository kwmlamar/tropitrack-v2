"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import type { Project } from "@/types";

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

const STATUS_OPTIONS = ["all", "planning", "active", "on_hold", "completed", "cancelled"];

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const supabase = createClient();
  const { toast } = useToast();
  const { profile, loading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading) return;
    if (profile && !profile.company_id) { setLoading(false); return; }
    if (profile?.company_id) fetchProjects();
    else if (profile === null) setLoading(false);
  }, [statusFilter, profile?.company_id, profile, authLoading]);

  const fetchProjects = async () => {
    if (!profile?.company_id) return;
    setLoading(true);
    try {
      let query = supabase
        .from("projects")
        .select(`*, clients(id, name, email, phone)`)
        .eq("company_id", profile.company_id)
        .order("created_at", { ascending: false });
      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      const { data, error } = await query;
      if (error) throw error;
      setProjects(
        (data || []).map((p: any) => ({
          ...p,
          client_name: p.clients?.name || p.client_name || "—",
          client_email: p.clients?.email || p.client_email,
          client_phone: p.clients?.phone || p.client_phone,
        }))
      );
    } catch (error) {
      console.error("Error fetching projects:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this project?")) return;
    const isAdmin = profile?.role === "admin" || profile?.role === "project_manager";
    if (!isAdmin) { toast({ title: "Permission denied", variant: "destructive" }); return; }
    const { data, error } = await supabase.from("projects").delete().eq("id", id).select();
    if (error || !data?.length) { toast({ title: "Could not delete", variant: "destructive" }); return; }
    toast({ title: "Deleted" });
    fetchProjects();
  };

  const filtered = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.client_name?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
      p.location.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const stats = [
    { label: "Total",     value: projects.length },
    { label: "Active",    value: projects.filter((p) => ["active", "in_progress"].includes(p.status)).length },
    { label: "Planning",  value: projects.filter((p) => p.status === "planning").length },
    { label: "Completed", value: projects.filter((p) => p.status === "completed").length },
  ];

  return (
    <div className="flex flex-col h-full overflow-auto bg-background">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
        <div>
          <p className="text-[11px] font-mono text-foreground-lighter uppercase tracking-widest">Jobs</p>
          <h1 className="text-[16px] font-semibold text-foreground mt-0.5">All Jobs</h1>
        </div>
        <Link
          href="/projects/new"
          className="text-[12px] font-medium text-brand hover:opacity-80 transition-opacity"
        >
          + New Job
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
                  <p className="text-[22px] font-semibold tabular-nums text-foreground mt-1 leading-none">{s.value}</p>
                </div>
              ))
          }
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search jobs..."
            className="flex-1 min-w-[200px] bg-surface-100 border border-border rounded-md px-3 py-2 text-[13px] text-foreground-light placeholder:text-foreground-lighter outline-none focus:border-strong transition-colors"
          />
          <div className="flex items-center gap-1">
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
                {s.replace("_", " ")}
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
                {searchTerm || statusFilter !== "all" ? "No jobs match your filter" : "No jobs yet"}
              </p>
              <Link
                href="/projects/new"
                className="inline-block mt-3 text-[12px] text-brand hover:opacity-80"
              >
                Create your first job →
              </Link>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">Name</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">Client</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">Location</th>
                  <th className="px-5 py-2.5 text-right text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">Budget</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">Start</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">Status</th>
                  <th className="w-36 px-5 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((project) => (
                  <tr key={project.id} className="group hover:bg-surface-200 transition-colors">
                    <td className="px-5 py-3">
                      <Link
                        href={`/projects/${project.id}`}
                        className="text-[13px] text-foreground-light group-hover:text-foreground transition-colors"
                      >
                        {project.name}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-[13px] text-foreground-lighter">{project.client_name}</td>
                    <td className="px-5 py-3 text-[13px] text-foreground-lighter">{project.location}</td>
                    <td className="px-5 py-3 text-right text-[13px] tabular-nums text-foreground-light">
                      {formatCurrency(project.budget)}
                    </td>
                    <td className="px-5 py-3 text-[11px] tabular-nums text-foreground-lighter">
                      {formatDate(project.start_date)}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className={cn("h-1.5 w-1.5 rounded-full flex-shrink-0", STATUS_DOT[project.status] ?? "bg-foreground-lighter")} />
                        <span className="text-[11px] tabular-nums text-foreground-lighter capitalize">
                          {project.status.replace("_", " ")}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link
                          href={`/projects/${project.id}`}
                          className="text-[11px] text-foreground-lighter hover:text-foreground-light transition-colors"
                        >
                          View
                        </Link>
                        <Link
                          href={`/projects/${project.id}/edit`}
                          className="text-[11px] text-foreground-lighter hover:text-foreground-light transition-colors"
                        >
                          Edit
                        </Link>
                        <button
                          onClick={() => handleDelete(project.id)}
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
