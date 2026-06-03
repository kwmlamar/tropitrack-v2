"use client";

import { useEffect, useState, useCallback } from "react";
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
import type { Project, Worker, TimeEntry } from "@/types";

interface TimeEntryWithRelations extends TimeEntry {
  workers: { first_name: string; last_name: string; hourly_rate: number };
  projects: { name: string };
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
  const { user, profile, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const supabase = createClient();

  const [entries, setEntries] = useState<TimeEntryWithRelations[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const today = new Date().toISOString().split("T")[0];
  const [selectedDate, setSelectedDate] = useState(today);
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
        .select("*, workers(first_name, last_name, hourly_rate), projects(name)")
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
  const totalLabor = entries.reduce((s, e) => {
    const r = e.workers?.hourly_rate || 0;
    return s + e.regular_hours * r + e.overtime_hours * r * 1.5;
  }, 0);

  const calcHours = () => {
    if (!formData.start_time || !formData.end_time) return null;
    return calculateHours(formData.start_time, formData.end_time, formData.break_duration_minutes);
  };
  const previewHours = calcHours();

  const isToday = (iso: string) => iso === today;
  const selectedDayLabel = new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return (
    <div className="flex flex-col h-full overflow-auto bg-[#18191b]">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#34373c] flex-shrink-0">
        <div>
          <p className="text-[11px] font-mono text-[#666] uppercase tracking-widest">Time Tracking</p>
          <h1 className="text-[16px] font-semibold text-[#d0d0d0] mt-0.5">Hours</h1>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/time-tracking/quick" className="text-[12px] text-[#666] hover:text-[#aaa] transition-colors">
            Quick entry
          </Link>
          <button
            onClick={() => { setFormData(f => ({ ...f, date: selectedDate })); setDialogOpen(true); }}
            className="text-[12px] font-medium text-[#F5A623] hover:opacity-80 transition-opacity"
          >
            + Log Time
          </button>
        </div>
      </div>

      {/* Week strip */}
      <div className="border-b border-[#34373c] bg-[#202224] flex-shrink-0">
        <div className="flex items-center px-4 py-2 gap-2">
          {/* Week navigation */}
          <button onClick={() => shiftWeek(-1)} className="text-[#555] hover:text-[#999] transition-colors px-1 text-[13px]">←</button>
          <div className="flex-1 flex items-center gap-1">
            {weekDays.map((day, i) => {
              const isSelected = day === selectedDate;
              const count = weekCounts[day] ?? 0;
              return (
                <button
                  key={day}
                  onClick={() => setSelectedDate(day)}
                  className={cn(
                    "flex-1 flex flex-col items-center py-2 rounded transition-colors",
                    isSelected ? "bg-[#2d3035] border border-[#333]" : "hover:bg-[#272a2c]"
                  )}
                >
                  <span className={cn("text-[10px] font-mono uppercase tracking-wide", isSelected ? "text-[#F5A623]" : "text-[#555]")}>
                    {DAY_LABELS[i]}
                  </span>
                  <span className={cn("text-[14px] font-mono mt-0.5", isSelected ? "text-[#d0d0d0]" : isToday(day) ? "text-[#aaa]" : "text-[#666]")}>
                    {formatShortDate(day)}
                  </span>
                  <div className="h-1 mt-1 flex items-center justify-center">
                    {count > 0 ? (
                      <span className={cn("text-[9px] font-mono", isSelected ? "text-[#F5A623]" : "text-[#444]")}>
                        {count}
                      </span>
                    ) : (
                      <span className="h-1 w-1 rounded-full bg-[#2d3035]" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          <button onClick={() => shiftWeek(1)} className="text-[#555] hover:text-[#999] transition-colors px-1 text-[13px]">→</button>
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
            <div key={s.label} className="rounded border border-[#34373c] bg-[#202224] px-4 py-3.5">
              <p className="text-[11px] font-mono text-[#666] uppercase tracking-wider">{s.label}</p>
              <p className={cn(
                "text-[20px] font-semibold font-mono mt-1 leading-none",
                s.amber ? "text-[#F5A623]" : s.accent ? "text-[#F5A623]" : "text-[#d0d0d0]"
              )}>
                {s.value}
              </p>
            </div>
          ))}
        </div>

        {/* Project filter */}
        <div className="flex items-center gap-3">
          <p className="text-[11px] font-mono text-[#555] uppercase tracking-widest flex-shrink-0">{selectedDayLabel}</p>
          <div className="flex-1" />
          <div className="flex items-center gap-1">
            <button
              onClick={() => setSelectedProject("all")}
              className={cn("px-2.5 py-1.5 rounded text-[10px] font-mono uppercase tracking-wide transition-colors",
                selectedProject === "all" ? "bg-[#2d3035] text-[#F5A623] border border-[#333]" : "text-[#555] hover:text-[#999]")}
            >
              All Projects
            </button>
            {projects.slice(0, 4).map(p => (
              <button
                key={p.id}
                onClick={() => setSelectedProject(selectedProject === p.id ? "all" : p.id)}
                className={cn("px-2.5 py-1.5 rounded text-[10px] font-mono transition-colors max-w-[100px] truncate",
                  selectedProject === p.id ? "bg-[#2d3035] text-[#F5A623] border border-[#333]" : "text-[#555] hover:text-[#999]")}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>

        {/* Entries table */}
        <div className="rounded border border-[#34373c] bg-[#202224] overflow-hidden">
          {loading ? (
            <div className="divide-y divide-[#292c31]">
              {Array(4).fill(0).map((_, i) => <div key={i} className="h-[52px] animate-pulse" />)}
            </div>
          ) : entries.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-[13px] text-[#555]">No entries for {selectedDayLabel}</p>
              <button
                onClick={() => { setFormData(f => ({ ...f, date: selectedDate })); setDialogOpen(true); }}
                className="inline-block mt-3 text-[12px] text-[#F5A623] hover:opacity-80"
              >
                + Log hours →
              </button>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#2d3035]">
                  <th className="px-5 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest text-[#555]">Worker</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest text-[#555]">Project</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest text-[#555]">Time</th>
                  <th className="px-5 py-2.5 text-right text-[10px] font-mono uppercase tracking-widest text-[#555]">Reg</th>
                  <th className="px-5 py-2.5 text-right text-[10px] font-mono uppercase tracking-widest text-[#555]">OT</th>
                  <th className="px-5 py-2.5 text-right text-[10px] font-mono uppercase tracking-widest text-[#555]">Cost</th>
                  <th className="w-16 px-5 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#292c31]">
                {entries.map(entry => {
                  const rate = entry.workers?.hourly_rate || 0;
                  const cost = entry.regular_hours * rate + entry.overtime_hours * rate * 1.5;
                  return (
                    <tr key={entry.id} className="group hover:bg-[#23252a] transition-colors">
                      <td className="px-5 py-3 text-[13px] text-[#aaa]">
                        {entry.workers?.first_name} {entry.workers?.last_name}
                      </td>
                      <td className="px-5 py-3 text-[13px] text-[#777]">{entry.projects?.name}</td>
                      <td className="px-5 py-3 text-[12px] font-mono text-[#666]">
                        {formatTime(entry.start_time)} – {formatTime(entry.end_time)}
                        {entry.break_duration_minutes > 0 && (
                          <span className="text-[#444] ml-1">({entry.break_duration_minutes}m brk)</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right text-[12px] font-mono text-[#666]">
                        {entry.regular_hours.toFixed(1)}h
                      </td>
                      <td className="px-5 py-3 text-right text-[12px] font-mono">
                        {entry.overtime_hours > 0
                          ? <span className="text-[#F5A623]">{entry.overtime_hours.toFixed(1)}h</span>
                          : <span className="text-[#333]">—</span>
                        }
                      </td>
                      <td className="px-5 py-3 text-right text-[12px] font-mono text-[#aaa]">
                        {formatCurrency(cost)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={() => handleDelete(entry.id)}
                          className="text-[11px] text-[#444] hover:text-[#EF4444] transition-colors opacity-0 group-hover:opacity-100"
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
                <tr className="border-t border-[#34373c] bg-[#202224]">
                  <td colSpan={3} className="px-5 py-2.5">
                    <span className="text-[10px] font-mono text-[#444] uppercase tracking-widest">Day total</span>
                  </td>
                  <td className="px-5 py-2.5 text-right text-[12px] font-mono text-[#666]">{totalReg.toFixed(1)}h</td>
                  <td className="px-5 py-2.5 text-right text-[12px] font-mono text-[#F5A623]">
                    {totalOT > 0 ? `${totalOT.toFixed(1)}h` : "—"}
                  </td>
                  <td className="px-5 py-2.5 text-right text-[13px] font-mono font-semibold text-[#F5A623]">
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
        <DialogContent className="max-w-md bg-[#202224] border-[#34373c] text-[#d0d0d0]">
          <DialogHeader>
            <DialogTitle className="text-[#d0d0d0] text-[15px]">Log Time Entry</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <p className="text-[10px] font-mono text-[#555] uppercase tracking-widest">Project *</p>
                <Select value={formData.project_id} onValueChange={v => setFormData(f => ({ ...f, project_id: v }))}>
                  <SelectTrigger className="h-8 bg-[#292c31] border-[#3a3d42] text-[#aaa] text-[13px] focus:ring-0 focus:border-[#333]">
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#202224] border-[#3a3d42]">
                    {projects.map(p => (
                      <SelectItem key={p.id} value={p.id} className="text-[#aaa] focus:bg-[#292c31] focus:text-[#d0d0d0]">{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <p className="text-[10px] font-mono text-[#555] uppercase tracking-widest">Worker *</p>
                <Select value={formData.worker_id} onValueChange={v => setFormData(f => ({ ...f, worker_id: v }))}>
                  <SelectTrigger className="h-8 bg-[#292c31] border-[#3a3d42] text-[#aaa] text-[13px] focus:ring-0 focus:border-[#333]">
                    <SelectValue placeholder="Select worker" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#202224] border-[#3a3d42]">
                    {workers.map(w => (
                      <SelectItem key={w.id} value={w.id} className="text-[#aaa] focus:bg-[#292c31] focus:text-[#d0d0d0]">
                        {w.first_name} {w.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <p className="text-[10px] font-mono text-[#555] uppercase tracking-widest">Date *</p>
                <input
                  type="date"
                  value={formData.date}
                  onChange={e => setFormData(f => ({ ...f, date: e.target.value }))}
                  className="w-full h-8 px-2.5 rounded bg-[#292c31] border border-[#3a3d42] text-[13px] text-[#aaa] outline-none focus:border-[#333] transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <p className="text-[10px] font-mono text-[#555] uppercase tracking-widest">Start</p>
                  <input
                    type="time"
                    value={formData.start_time}
                    onChange={e => setFormData(f => ({ ...f, start_time: e.target.value }))}
                    className="w-full h-8 px-2.5 rounded bg-[#292c31] border border-[#3a3d42] text-[13px] text-[#aaa] outline-none focus:border-[#333] transition-colors"
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-mono text-[#555] uppercase tracking-widest">End</p>
                  <input
                    type="time"
                    value={formData.end_time}
                    onChange={e => setFormData(f => ({ ...f, end_time: e.target.value }))}
                    className="w-full h-8 px-2.5 rounded bg-[#292c31] border border-[#3a3d42] text-[13px] text-[#aaa] outline-none focus:border-[#333] transition-colors"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-[10px] font-mono text-[#555] uppercase tracking-widest">Break (minutes)</p>
                <input
                  type="number"
                  min="0"
                  value={formData.break_duration_minutes}
                  onChange={e => setFormData(f => ({ ...f, break_duration_minutes: parseInt(e.target.value) || 0 }))}
                  className="w-full h-8 px-2.5 rounded bg-[#292c31] border border-[#3a3d42] text-[13px] text-[#aaa] outline-none focus:border-[#333] transition-colors"
                />
              </div>

              <div className="space-y-1">
                <p className="text-[10px] font-mono text-[#555] uppercase tracking-widest">Notes</p>
                <textarea
                  rows={2}
                  value={formData.notes}
                  onChange={e => setFormData(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Optional notes..."
                  className="w-full px-2.5 py-2 rounded bg-[#292c31] border border-[#3a3d42] text-[13px] text-[#aaa] placeholder:text-[#444] outline-none focus:border-[#333] transition-colors resize-none"
                />
              </div>

              {previewHours !== null && previewHours > 0 && (
                <div className="px-3 py-2.5 rounded border border-[#34373c] bg-[#18191b] flex items-center justify-between">
                  <span className="text-[11px] font-mono text-[#555]">Calculated hours</span>
                  <div className="text-right">
                    <span className="text-[15px] font-mono font-semibold text-[#d0d0d0]">{previewHours.toFixed(2)}h</span>
                    {previewHours > 8 && (
                      <span className="text-[10px] font-mono text-[#F5A623] ml-2">
                        {(previewHours - 8).toFixed(2)}h OT
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="pt-2">
              <button type="button" onClick={() => setDialogOpen(false)} className="px-4 py-2 text-[12px] text-[#555] hover:text-[#aaa] transition-colors">
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !formData.worker_id || !formData.project_id}
                className="flex items-center gap-1.5 px-4 py-2 rounded bg-[#2d3035] border border-[#333] text-[12px] text-[#F5A623] hover:bg-[#353840] transition-colors disabled:opacity-40"
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
