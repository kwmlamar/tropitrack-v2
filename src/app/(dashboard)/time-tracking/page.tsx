"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatCurrency, calculateHours, calculateOvertimeHours } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
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
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Project, Worker, TimeEntry } from "@/types";

interface TimeEntryWithRelations extends TimeEntry {
  workers: { first_name: string; last_name: string; hourly_rate: number; overtime_rate_multiplier?: number };
  projects: { name: string };
}

function entryCost(e: TimeEntryWithRelations): number {
  const rate = e.workers?.hourly_rate || 0;
  const mult = Number(e.workers?.overtime_rate_multiplier) || 1.5;
  return e.regular_hours * rate + e.overtime_hours * rate * mult;
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function getWeekDays(anchor: string): string[] {
  const d = new Date(anchor + "T12:00:00");
  const dow = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((dow + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    return date.toISOString().split("T")[0];
  });
}

function formatShortDate(iso: string): string {
  const [, , d] = iso.split("-");
  return String(parseInt(d));
}

function formatTime(t: string | null | undefined): string {
  if (!t) return "—";
  const [h, m] = t.split(":");
  const hr = parseInt(h);
  return `${hr % 12 || 12}:${m}${hr < 12 ? "am" : "pm"}`;
}

export default function TimeTrackingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center bg-background">
          <Loader2 className="h-5 w-5 animate-spin text-foreground-lighter" />
        </div>
      }
    >
      <TimeTracking />
    </Suspense>
  );
}

function TimeTracking() {
  const { user, profile, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const supabase = createClient();

  const [entries, setEntries] = useState<TimeEntryWithRelations[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const today = new Date().toISOString().split("T")[0];
  const [selectedDate, setSelectedDate] = useState(searchParams.get("date") || today);
  const [selectedProject, setSelectedProject] = useState("all");
  const [weekCounts, setWeekCounts] = useState<Record<string, number>>({});

  const weekDays = getWeekDays(selectedDate);
  const weekStart = weekDays[0];
  const weekEnd = weekDays[6];

  const [formData, setFormData] = useState({
    worker_id: "",
    project_id: "",
    date: today,
    start_time: "07:00",
    end_time: "16:00",
    break_duration_minutes: 60,
    notes: "",
  });

  useEffect(() => {
    if (authLoading) return;
    if (profile && !profile.company_id) { setLoading(false); return; }
    if (profile?.company_id) fetchData();
    else if (profile === null) setLoading(false);
  }, [selectedDate, selectedProject, profile?.company_id, profile, authLoading]);

  const fetchData = useCallback(async () => {
    if (!profile?.company_id) return;
    setLoading(true);
    try {
      const [{ data: projectsData }, { data: workersData }] = await Promise.all([
        supabase.from("projects").select("*").eq("company_id", profile.company_id).in("status", ["active", "planning"]).order("name"),
        supabase.from("workers").select("*").eq("company_id", profile.company_id).eq("status", "active").order("last_name"),
      ]);
      setProjects(projectsData || []);
      setWorkers(workersData || []);

      let query = supabase
        .from("time_entries")
        .select("*, workers(first_name, last_name, hourly_rate, overtime_rate_multiplier), projects(name)")
        .eq("company_id", profile.company_id)
        .eq("date", selectedDate);
      if (selectedProject !== "all") query = query.eq("project_id", selectedProject);
      const { data: entriesData } = await query.order("created_at", { ascending: false });
      setEntries((entriesData || []) as TimeEntryWithRelations[]);

      // Fetch week entry counts for the strip
      const days = getWeekDays(selectedDate);
      const { data: weekData } = await supabase
        .from("time_entries")
        .select("date")
        .eq("company_id", profile.company_id)
        .gte("date", days[0])
        .lte("date", days[6]);
      const counts: Record<string, number> = {};
      days.forEach(d => counts[d] = 0);
      weekData?.forEach((e: any) => { if (counts[e.date] !== undefined) counts[e.date]++; });
      setWeekCounts(counts);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  }, [profile?.company_id, selectedDate, selectedProject]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile?.company_id) return;
    setSubmitting(true);
    try {
      const { data: existing } = await supabase
        .from("time_entries").select("id")
        .eq("company_id", profile.company_id)
        .eq("worker_id", formData.worker_id)
        .eq("project_id", formData.project_id)
        .eq("date", formData.date)
        .limit(1);
      if (existing?.length) {
        toast({ title: "Duplicate entry", description: "This worker already has an entry for this project on this date.", variant: "destructive" });
        setSubmitting(false);
        return;
      }
      const totalHours = calculateHours(formData.start_time, formData.end_time, formData.break_duration_minutes);
      const { regular, overtime } = calculateOvertimeHours(totalHours);
      const { error } = await supabase.from("time_entries").insert({
        ...formData,
        company_id: profile.company_id,
        regular_hours: regular,
        overtime_hours: overtime,
        created_by: user.id,
      });
      if (error) throw error;
      toast({ title: "Entry logged" });
      setDialogOpen(false);
      setFormData(f => ({ ...f, worker_id: "", notes: "" }));
      fetchData();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this time entry?")) return;
    const { data, error } = await supabase.from("time_entries").delete().eq("id", id).select("id");
    if (error || !data?.length) {
      toast({ title: "Could not delete", variant: "destructive" });
      return;
    }
    setEntries(entries.filter(e => e.id !== id));
    toast({ title: "Deleted" });
  };

  const shiftWeek = (dir: number) => {
    const d = new Date(selectedDate + "T12:00:00");
    d.setDate(d.getDate() + dir * 7);
    setSelectedDate(d.toISOString().split("T")[0]);
  };

  const totalReg = entries.reduce((s, e) => s + e.regular_hours, 0);
  const totalOT = entries.reduce((s, e) => s + e.overtime_hours, 0);
  const totalLabor = entries.reduce((s, e) => s + entryCost(e), 0);

  const calcHours = () => {
    if (!formData.start_time || !formData.end_time) return null;
    return calculateHours(formData.start_time, formData.end_time, formData.break_duration_minutes);
  };
  const previewHours = calcHours();

  const isToday = (iso: string) => iso === today;
  const selectedDayLabel = new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return (
    <div className="flex flex-col h-full overflow-auto bg-background">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
        <div>
          <p className="text-[11px] font-mono text-foreground-lighter uppercase tracking-widest">Time Tracking</p>
          <h1 className="text-[16px] font-semibold text-foreground mt-0.5">Hours</h1>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href={`/time-tracking/quick?date=${selectedDate}`}
            className="text-[12px] text-foreground-lighter hover:text-foreground-light transition-colors"
          >
            Quick entry
          </Link>
          <button
            onClick={() => { setFormData(f => ({ ...f, date: selectedDate })); setDialogOpen(true); }}
            className="text-[12px] font-medium text-brand hover:opacity-80 transition-opacity"
          >
            + Log Time
          </button>
        </div>
      </div>

      {/* Week strip */}
      <div className="border-b border-border bg-surface-100 flex-shrink-0">
        <div className="flex items-center px-4 py-2 gap-2">
          {/* Week navigation */}
          <button onClick={() => shiftWeek(-1)} className="text-foreground-lighter hover:text-foreground-light transition-colors px-1 text-[13px]">←</button>
          <div className="flex-1 flex items-center gap-1">
            {weekDays.map((day, i) => {
              const isSelected = day === selectedDate;
              const count = weekCounts[day] ?? 0;
              return (
                <button
                  key={day}
                  onClick={() => setSelectedDate(day)}
                  className={cn(
                    "flex-1 flex flex-col items-center py-2 rounded-md transition-colors",
                    isSelected ? "bg-surface-300 border border-strong" : "hover:bg-surface-200"
                  )}
                >
                  <span className={cn("text-[10px] font-mono uppercase tracking-wide", isSelected ? "text-brand" : "text-foreground-lighter")}>
                    {DAY_LABELS[i]}
                  </span>
                  <span className={cn("text-[14px] tabular-nums mt-0.5", isSelected ? "text-foreground" : isToday(day) ? "text-foreground-light" : "text-foreground-lighter")}>
                    {formatShortDate(day)}
                  </span>
                  <div className="h-1 mt-1 flex items-center justify-center">
                    {count > 0 ? (
                      <span className={cn("text-[9px] tabular-nums", isSelected ? "text-brand" : "text-foreground-lighter")}>
                        {count}
                      </span>
                    ) : (
                      <span className="h-1 w-1 rounded-full bg-surface-300" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          <button onClick={() => shiftWeek(1)} className="text-foreground-lighter hover:text-foreground-light transition-colors px-1 text-[13px]">→</button>
        </div>
      </div>

      <div className="flex-1 p-6 space-y-5">
        {/* Day stats */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Entries",   value: entries.length,              mono: false },
            { label: "Reg Hours", value: `${totalReg.toFixed(1)}h`,   mono: true },
            { label: "OT Hours",  value: `${totalOT.toFixed(1)}h`,    mono: true, accent: totalOT > 0 },
            { label: "Labor Cost",value: formatCurrency(totalLabor),  mono: true, amber: true },
          ].map(s => (
            <div key={s.label} className="rounded-lg border border-border bg-surface-100 px-4 py-3.5">
              <p className="text-[11px] font-mono text-foreground-lighter uppercase tracking-wider">{s.label}</p>
              <p className={cn(
                "text-[20px] font-semibold tabular-nums mt-1 leading-none",
                s.amber ? "text-brand" : s.accent ? "text-brand" : "text-foreground"
              )}>
                {s.value}
              </p>
            </div>
          ))}
        </div>

        {/* Project filter */}
        <div className="flex items-center gap-3">
          <p className="text-[11px] font-mono text-foreground-lighter uppercase tracking-widest flex-shrink-0">{selectedDayLabel}</p>
          <div className="flex-1" />
          <div className="flex items-center gap-1">
            <button
              onClick={() => setSelectedProject("all")}
              className={cn("px-2.5 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-wide transition-colors",
                selectedProject === "all" ? "bg-surface-300 text-brand border border-strong" : "text-foreground-lighter hover:text-foreground-light")}
            >
              All Projects
            </button>
            {projects.slice(0, 4).map(p => (
              <button
                key={p.id}
                onClick={() => setSelectedProject(selectedProject === p.id ? "all" : p.id)}
                className={cn("px-2.5 py-1.5 rounded-md text-[10px] tabular-nums transition-colors max-w-[100px] truncate",
                  selectedProject === p.id ? "bg-surface-300 text-brand border border-strong" : "text-foreground-lighter hover:text-foreground-light")}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>

        {/* Entries table */}
        <div className="rounded-lg border border-border bg-surface-100 overflow-hidden">
          {loading ? (
            <div className="divide-y divide-border">
              {Array(4).fill(0).map((_, i) => <div key={i} className="h-[52px] animate-pulse" />)}
            </div>
          ) : entries.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-[13px] text-foreground-lighter">No entries for {selectedDayLabel}</p>
              <div className="flex items-center justify-center gap-4 mt-3">
                <Link href={`/time-tracking/quick?date=${selectedDate}`} className="text-[12px] text-brand hover:opacity-80">
                  Log the crew →
                </Link>
                <span className="text-border">|</span>
                <button
                  onClick={() => { setFormData(f => ({ ...f, date: selectedDate })); setDialogOpen(true); }}
                  className="text-[12px] text-foreground-lighter hover:text-foreground-light transition-colors"
                >
                  One entry
                </button>
              </div>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">Worker</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">Project</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">Time</th>
                  <th className="px-5 py-2.5 text-right text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">Reg</th>
                  <th className="px-5 py-2.5 text-right text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">OT</th>
                  <th className="px-5 py-2.5 text-right text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">Cost</th>
                  <th className="w-16 px-5 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {entries.map(entry => {
                  const cost = entryCost(entry);
                  return (
                    <tr key={entry.id} className="group hover:bg-surface-200 transition-colors">
                      <td className="px-5 py-3 text-[13px] text-foreground-light">
                        {entry.workers?.first_name} {entry.workers?.last_name}
                      </td>
                      <td className="px-5 py-3 text-[13px] text-foreground-lighter">{entry.projects?.name}</td>
                      <td className="px-5 py-3 text-[12px] tabular-nums text-foreground-lighter">
                        {formatTime(entry.start_time)} – {formatTime(entry.end_time)}
                        {entry.break_duration_minutes > 0 && (
                          <span className="text-foreground-lighter ml-1">({entry.break_duration_minutes}m brk)</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right text-[12px] tabular-nums text-foreground-lighter">
                        {entry.regular_hours.toFixed(1)}h
                      </td>
                      <td className="px-5 py-3 text-right text-[12px] tabular-nums">
                        {entry.overtime_hours > 0
                          ? <span className="text-brand">{entry.overtime_hours.toFixed(1)}h</span>
                          : <span className="text-foreground-lighter">—</span>
                        }
                      </td>
                      <td className="px-5 py-3 text-right text-[12px] tabular-nums text-foreground-light">
                        {formatCurrency(cost)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={() => handleDelete(entry.id)}
                          className="text-[11px] text-foreground-lighter hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {/* Day total footer */}
              <tfoot>
                <tr className="border-t border-border bg-surface-100">
                  <td colSpan={3} className="px-5 py-2.5">
                    <span className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">Day total</span>
                  </td>
                  <td className="px-5 py-2.5 text-right text-[12px] tabular-nums text-foreground-lighter">{totalReg.toFixed(1)}h</td>
                  <td className="px-5 py-2.5 text-right text-[12px] tabular-nums text-brand">
                    {totalOT > 0 ? `${totalOT.toFixed(1)}h` : "—"}
                  </td>
                  <td className="px-5 py-2.5 text-right text-[13px] tabular-nums font-semibold text-brand">
                    {formatCurrency(totalLabor)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>

      {/* Log Time Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md bg-surface-100 border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-foreground text-[15px]">Log Time Entry</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">Project *</p>
                <Select value={formData.project_id} onValueChange={v => setFormData(f => ({ ...f, project_id: v }))}>
                  <SelectTrigger className="h-8 bg-surface-100 border-strong text-foreground-light text-[13px] focus:ring-0 focus:border-strong">
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent className="bg-surface-100 border-strong">
                    {projects.map(p => (
                      <SelectItem key={p.id} value={p.id} className="text-foreground-light focus:bg-surface-100 focus:text-foreground">{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">Worker *</p>
                <Select value={formData.worker_id} onValueChange={v => setFormData(f => ({ ...f, worker_id: v }))}>
                  <SelectTrigger className="h-8 bg-surface-100 border-strong text-foreground-light text-[13px] focus:ring-0 focus:border-strong">
                    <SelectValue placeholder="Select worker" />
                  </SelectTrigger>
                  <SelectContent className="bg-surface-100 border-strong">
                    {workers.map(w => (
                      <SelectItem key={w.id} value={w.id} className="text-foreground-light focus:bg-surface-100 focus:text-foreground">
                        {w.first_name} {w.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">Date *</p>
                <input
                  type="date"
                  value={formData.date}
                  onChange={e => setFormData(f => ({ ...f, date: e.target.value }))}
                  className="w-full h-8 px-2.5 rounded-md bg-surface-100 border border-strong text-[13px] text-foreground-light outline-none focus:border-strong transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">Start</p>
                  <input
                    type="time"
                    value={formData.start_time}
                    onChange={e => setFormData(f => ({ ...f, start_time: e.target.value }))}
                    className="w-full h-8 px-2.5 rounded-md bg-surface-100 border border-strong text-[13px] text-foreground-light outline-none focus:border-strong transition-colors"
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">End</p>
                  <input
                    type="time"
                    value={formData.end_time}
                    onChange={e => setFormData(f => ({ ...f, end_time: e.target.value }))}
                    className="w-full h-8 px-2.5 rounded-md bg-surface-100 border border-strong text-[13px] text-foreground-light outline-none focus:border-strong transition-colors"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">Break (minutes)</p>
                <input
                  type="number"
                  min="0"
                  value={formData.break_duration_minutes}
                  onChange={e => setFormData(f => ({ ...f, break_duration_minutes: parseInt(e.target.value) || 0 }))}
                  className="w-full h-8 px-2.5 rounded-md bg-surface-100 border border-strong text-[13px] text-foreground-light outline-none focus:border-strong transition-colors"
                />
              </div>

              <div className="space-y-1">
                <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">Notes</p>
                <textarea
                  rows={2}
                  value={formData.notes}
                  onChange={e => setFormData(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Optional notes..."
                  className="w-full px-2.5 py-2 rounded-md bg-surface-100 border border-strong text-[13px] text-foreground-light placeholder:text-foreground-lighter outline-none focus:border-strong transition-colors resize-none"
                />
              </div>

              {previewHours !== null && previewHours > 0 && (
                <div className="px-3 py-2.5 rounded-lg border border-border bg-background flex items-center justify-between">
                  <span className="text-[11px] tabular-nums text-foreground-lighter">Calculated hours</span>
                  <div className="text-right">
                    <span className="text-[15px] tabular-nums font-semibold text-foreground">{previewHours.toFixed(2)}h</span>
                    {previewHours > 8 && (
                      <span className="text-[10px] tabular-nums text-brand ml-2">
                        {(previewHours - 8).toFixed(2)}h OT
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="pt-2">
              <button type="button" onClick={() => setDialogOpen(false)} className="px-4 py-2 text-[12px] text-foreground-lighter hover:text-foreground-light transition-colors">
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !formData.worker_id || !formData.project_id}
                className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-surface-300 border border-strong text-[12px] text-brand hover:bg-surface-400 transition-colors disabled:opacity-40"
              >
                {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Save Entry
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
