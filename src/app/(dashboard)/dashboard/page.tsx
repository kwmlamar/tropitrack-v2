"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import {
  FolderKanban,
  Clock,
  DollarSign,
  ArrowRight,
  Plus,
  GanttChartSquare,
  ScanLine,
  Target,
  Users,
} from "lucide-react";
import { ClaudeIcon } from "@/components/icons/claude-icon";
import Link from "next/link";

interface Stat {
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
}

interface Project {
  id: string;
  name: string;
  status: string;
  location?: string;
}

interface Goal {
  id: string;
  title: string;
  status: string;
  progress: number;
}

const STATUS_DOT: Record<string, string> = {
  active:      "bg-success",
  in_progress: "bg-success",
  not_started: "bg-info",
  completed:   "bg-surface-400",
  paused:      "bg-warning",
  on_hold:     "bg-warning",
  cancelled:   "bg-destructive",
};

export default function DashboardPage() {
  const { profile } = useAuth();
  const supabase = createClient();

  const [stats, setStats] = useState<Stat[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);

  const now = new Date();
  const greeting = now.getHours() < 12 ? "Morning" : now.getHours() < 17 ? "Afternoon" : "Evening";
  const dateStr = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }).toUpperCase();

  useEffect(() => {
    if (!profile?.company_id) { setLoading(false); return; }
    load();
  }, [profile?.company_id]);

  async function load() {
    const cid = profile!.company_id;
    setLoading(true);
    try {
      const [
        { count: activeJobs },
        { count: activeCrew },
        { data: recentProjects },
        { data: recentGoals },
        { data: weekPayroll },
      ] = await Promise.all([
        supabase.from("projects").select("*", { count: "exact", head: true }).eq("company_id", cid).in("status", ["active", "in_progress"]),
        supabase.from("workers").select("*", { count: "exact", head: true }).eq("company_id", cid).eq("status", "active"),
        supabase.from("projects").select("id,name,status,location").eq("company_id", cid).order("created_at", { ascending: false }).limit(6),
        supabase.from("business_goals").select("id,title,status,progress").eq("company_id", cid).eq("status", "active").order("created_at", { ascending: false }).limit(4),
        supabase.from("payroll_entries").select("net_pay").eq("company_id", cid).gte("created_at", new Date(now.getFullYear(), now.getMonth(), 1).toISOString()),
      ]);

      const payrollTotal = weekPayroll?.reduce((s, r) => s + (r.net_pay || 0), 0) ?? 0;

      setStats([
        { label: "Active Jobs",  value: activeJobs ?? 0,   sub: "in progress" },
        { label: "Crew",         value: activeCrew ?? 0,   sub: "on payroll" },
        { label: "Payroll MTD",  value: `BSD $${payrollTotal.toLocaleString()}`, sub: "this month", accent: true },
      ]);
      setProjects(recentProjects ?? []);
      setGoals(recentGoals ?? []);
    } finally {
      setLoading(false);
    }
  }

  const quickActions = [
    { label: "New Job",      href: "/projects/new",  icon: FolderKanban },
    { label: "Gantt",        href: "/gantt",          icon: GanttChartSquare },
    { label: "Scan Receipt", href: "/receipts",       icon: ScanLine },
    { label: "Log Time",     href: "/time-tracking",  icon: Clock },
  ];

  return (
    <div className="flex flex-col h-full overflow-auto bg-background">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
        <div>
          <p className="text-[11px] font-mono text-foreground-lighter uppercase tracking-widest">{dateStr}</p>
          <h1 className="text-[16px] font-semibold text-foreground mt-0.5">
            {greeting}, {profile?.full_name?.split(" ")[0] ?? "—"}
          </h1>
        </div>
        <Link
          href="/assistant"
          className="flex items-center gap-1.5 text-[12px] font-medium text-foreground-lighter hover:text-foreground-light transition-colors"
        >
          <ClaudeIcon className="h-3.5 w-3.5" />
          <span>Ask Claude</span>
        </Link>
      </div>

      <div className="flex-1 p-6 space-y-5">
        {/* Stat row */}
        <div className="grid grid-cols-3 gap-3">
          {loading
            ? Array(3).fill(0).map((_, i) => (
                <div key={i} className="h-[76px] rounded-lg bg-surface-100 animate-pulse" />
              ))
            : stats.map((s) => (
                <div key={s.label} className="rounded-lg border border-border bg-surface-100 px-4 py-3.5">
                  <p className="text-[11px] font-mono text-foreground-lighter uppercase tracking-wider">{s.label}</p>
                  <p className={cn(
                    "text-[24px] font-semibold tabular-nums mt-1 leading-none",
                    s.accent ? "text-brand" : "text-foreground"
                  )}>
                    {s.value}
                  </p>
                  {s.sub && <p className="text-[11px] text-foreground-lighter mt-1">{s.sub}</p>}
                </div>
              ))
          }
        </div>

        {/* Quick actions */}
        <div>
          <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest mb-2">Quick actions</p>
          <div className="grid grid-cols-4 gap-2">
            {quickActions.map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className="flex flex-col items-center justify-center gap-2 rounded-md border border-border bg-surface-100 hover:bg-surface-200 hover:border-strong transition-colors py-4 text-[12px] font-medium text-foreground-lighter hover:text-foreground-light group"
              >
                <a.icon className="h-4 w-4 text-foreground-lighter group-hover:text-brand transition-colors" />
                {a.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Two-col grid */}
        <div className="grid grid-cols-2 gap-4">
          {/* Jobs */}
          <div className="rounded-lg border border-border bg-surface-100">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="text-[11px] font-mono text-foreground-lighter uppercase tracking-widest">Jobs</span>
              <Link href="/projects" className="flex items-center gap-1 text-[11px] text-foreground-lighter hover:text-foreground-light transition-colors">
                All <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="divide-y divide-border">
              {loading ? (
                Array(4).fill(0).map((_, i) => (
                  <div key={i} className="px-4 py-3 h-10 animate-pulse" />
                ))
              ) : projects.length === 0 ? (
                <div className="px-4 py-6 text-center">
                  <p className="text-[12px] text-foreground-lighter">No jobs yet</p>
                  <Link href="/projects/new" className="inline-flex items-center gap-1 mt-2 text-[12px] text-brand hover:opacity-80">
                    <Plus className="h-3 w-3" /> Add first job
                  </Link>
                </div>
              ) : (
                projects.map((p) => (
                  <Link
                    key={p.id}
                    href={`/projects/${p.id}`}
                    className="flex items-center justify-between px-4 py-2.5 hover:bg-surface-200 transition-colors group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className={cn("h-1.5 w-1.5 rounded-full flex-shrink-0", STATUS_DOT[p.status] ?? "bg-surface-400")} />
                      <span className="text-[13px] text-foreground-light group-hover:text-foreground truncate transition-colors">{p.name}</span>
                    </div>
                    <span className="text-[11px] text-foreground-lighter tabular-nums capitalize flex-shrink-0 ml-3">
                      {p.status.replace("_", " ")}
                    </span>
                  </Link>
                ))
              )}
            </div>
          </div>

          {/* Goals */}
          <div className="rounded-lg border border-border bg-surface-100">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="text-[11px] font-mono text-foreground-lighter uppercase tracking-widest">Goals</span>
              <Link href="/goals" className="flex items-center gap-1 text-[11px] text-foreground-lighter hover:text-foreground-light transition-colors">
                All <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="divide-y divide-border">
              {loading ? (
                Array(3).fill(0).map((_, i) => (
                  <div key={i} className="px-4 py-3 h-14 animate-pulse" />
                ))
              ) : goals.length === 0 ? (
                <div className="px-4 py-6 text-center">
                  <p className="text-[12px] text-foreground-lighter">No active goals</p>
                  <Link href="/goals" className="inline-flex items-center gap-1 mt-2 text-[12px] text-brand hover:opacity-80">
                    <Plus className="h-3 w-3" /> Add a goal
                  </Link>
                </div>
              ) : (
                goals.map((g) => (
                  <div key={g.id} className="px-4 py-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[13px] text-foreground-light truncate">{g.title}</span>
                      <span className="text-[11px] tabular-nums text-brand ml-3 flex-shrink-0">{g.progress}%</span>
                    </div>
                    <div className="h-[2px] bg-border rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-500"
                        style={{ width: `${g.progress}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="px-4 py-3 border-t border-border">
              <Link
                href="/goals"
                className="flex items-center gap-1.5 text-[12px] text-foreground-lighter hover:text-foreground-light transition-colors"
              >
                <Target className="h-3.5 w-3.5" />
                Manage goals
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
