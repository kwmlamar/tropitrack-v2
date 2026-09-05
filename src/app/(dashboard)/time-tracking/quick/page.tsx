"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { cn, formatCurrency, calculateHours } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AlertTriangle, Check, ChevronDown, Loader2, Plus, Trash2, Users } from "lucide-react";
import type { Project, Worker } from "@/types";

/* ------------------------------------------------------------------ */
/* Constants + date helpers                                            */
/* ------------------------------------------------------------------ */

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DRAFT_KEY = "tropitrack_time_draft_v2";
const TEMPLATES_KEY = "tropitrack_crew_templates";
const REGULAR_DAY_HOURS = 8;

/** Local-date ISO string (no UTC drift). */
function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function todayISO(): string {
  return isoOf(new Date());
}
function parseISO(iso: string): Date {
  return new Date(`${iso}T12:00:00`);
}
function addDays(iso: string, n: number): string {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return isoOf(d);
}
function getWeekDays(anchor: string): string[] {
  const d = parseISO(anchor);
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    return isoOf(day);
  });
}
function dayNum(iso: string): string {
  return String(parseInt(iso.split("-")[2], 10));
}
function shortLabel(iso: string): string {
  return parseISO(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}
function timeOf(minutes: number): string {
  const capped = Math.max(0, Math.min(23 * 60 + 59, Math.round(minutes)));
  return `${String(Math.floor(capped / 60)).padStart(2, "0")}:${String(capped % 60).padStart(2, "0")}`;
}
function uid(): string {
  return `row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface Row {
  id: string;
  worker_id: string;
  worker_name: string;
  hourly_rate: number;
  ot_multiplier: number;
  hours: number;
  hours_overridden: boolean;
  overtime_hours: number;
  ot_overridden: boolean;
  project_id: string; // "" = use the shift-wide project
  notes: string;
}

interface Shift {
  start: string;
  end: string;
  break_minutes: number;
}

interface CrewMember {
  worker_id: string;
  worker_name: string;
  default_hours: number;
  hourly_rate: number;
}

interface CrewTemplate {
  id: string;
  name: string;
  project_id?: string;
  project_name?: string;
  members: CrewMember[];
  created_at: string;
  updated_at: string;
}

interface PlannedEntry {
  date: string;
  row: Row;
  project_id: string;
  regular_hours: number;
  overtime_hours: number;
  start_time: string;
  end_time: string;
}

const SHIFT_PRESETS: { label: string; shift: Shift }[] = [
  { label: "7–4", shift: { start: "07:00", end: "16:00", break_minutes: 60 } },
  { label: "7–5", shift: { start: "07:00", end: "17:00", break_minutes: 60 } },
  { label: "8–4", shift: { start: "08:00", end: "16:00", break_minutes: 0 } },
  { label: "8–5", shift: { start: "08:00", end: "17:00", break_minutes: 60 } },
];

/* ------------------------------------------------------------------ */

export default function QuickTimeEntryPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-foreground-lighter" />
        </div>
      }
    >
      <QuickEntry />
    </Suspense>
  );
}

function QuickEntry() {
  const { user, profile, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const supabase = createClient();
  const searchParams = useSearchParams();

  const initialDate = searchParams.get("date") || todayISO();

  const [anchorDate, setAnchorDate] = useState(initialDate);
  const [selectedDays, setSelectedDays] = useState<string[]>([initialDate]);
  const [shift, setShift] = useState<Shift>({ start: "07:00", end: "16:00", break_minutes: 60 });
  const [globalProject, setGlobalProject] = useState("");
  const [rows, setRows] = useState<Row[]>([]);

  const [projects, setProjects] = useState<Project[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // date|worker_id -> hours already logged; date|worker_id|project_id -> exact match
  const [loggedHours, setLoggedHours] = useState<Map<string, number>>(new Map());
  const [loggedKeys, setLoggedKeys] = useState<Set<string>>(new Set());
  const [weekCounts, setWeekCounts] = useState<Record<string, number>>({});
  const [lastLoggedDay, setLastLoggedDay] = useState<{ date: string; count: number } | null>(null);

  const [templates, setTemplates] = useState<CrewTemplate[]>([]);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [templateName, setTemplateName] = useState("");

  const [pendingDupes, setPendingDupes] = useState<PlannedEntry[] | null>(null);
  const [pendingFresh, setPendingFresh] = useState<PlannedEntry[]>([]);

  const [crewOpen, setCrewOpen] = useState(false);
  const draftLoaded = useRef(false);

  const weekDays = useMemo(() => getWeekDays(anchorDate), [anchorDate]);
  const shiftHours = useMemo(
    () => calculateHours(shift.start, shift.end, shift.break_minutes),
    [shift]
  );
  const selectedWorkerIds = useMemo(() => rows.map((r) => r.worker_id), [rows]);
  const workerIdKey = useMemo(() => [...selectedWorkerIds].sort().join(","), [selectedWorkerIds]);
  const dayKey = useMemo(() => [...selectedDays].sort().join(","), [selectedDays]);

  /* ---------------- data ---------------- */

  useEffect(() => {
    if (authLoading) return;
    if (!profile?.company_id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const [{ data: projectsData }, { data: workersData }] = await Promise.all([
        supabase
          .from("projects")
          .select("*")
          .eq("company_id", profile.company_id)
          .in("status", ["active", "planning"])
          .order("name"),
        supabase
          .from("workers")
          .select("*")
          .eq("company_id", profile.company_id)
          .eq("status", "active")
          .order("last_name"),
      ]);
      if (cancelled) return;
      setProjects(projectsData || []);
      setWorkers(workersData || []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, profile?.company_id]);

  // Week strip counts + "most recent day with entries" suggestion.
  const refreshContext = useCallback(async () => {
    if (!profile?.company_id) return;
    const days = getWeekDays(anchorDate);
    const lookbackFrom = addDays(anchorDate, -21);
    const { data } = await supabase
      .from("time_entries")
      .select("date")
      .eq("company_id", profile.company_id)
      .gte("date", lookbackFrom < days[0] ? lookbackFrom : days[0])
      .lte("date", days[6]);

    const counts: Record<string, number> = {};
    days.forEach((d) => (counts[d] = 0));
    const byDate: Record<string, number> = {};
    data?.forEach((e: { date: string }) => {
      if (counts[e.date] !== undefined) counts[e.date]++;
      byDate[e.date] = (byDate[e.date] || 0) + 1;
    });
    setWeekCounts(counts);

    const prior = Object.keys(byDate)
      .filter((d) => d < anchorDate)
      .sort()
      .pop();
    setLastLoggedDay(prior ? { date: prior, count: byDate[prior] } : null);
  }, [profile?.company_id, anchorDate]);

  useEffect(() => {
    refreshContext();
  }, [refreshContext]);

  // Which of the planned worker/day pairs already have time logged. Debounced
  // and keyed on the worker set + day set only, so typing notes costs nothing.
  const refreshLogged = useCallback(async () => {
    if (!profile?.company_id || selectedDays.length === 0 || selectedWorkerIds.length === 0) {
      setLoggedHours(new Map());
      setLoggedKeys(new Set());
      return;
    }
    const sorted = [...selectedDays].sort();
    const { data } = await supabase
      .from("time_entries")
      .select("worker_id, project_id, date, regular_hours, overtime_hours")
      .eq("company_id", profile.company_id)
      .gte("date", sorted[0])
      .lte("date", sorted[sorted.length - 1])
      .in("worker_id", selectedWorkerIds);

    const hours = new Map<string, number>();
    const keys = new Set<string>();
    data?.forEach((e: any) => {
      if (!selectedDays.includes(e.date)) return;
      const k = `${e.date}|${e.worker_id}`;
      hours.set(k, (hours.get(k) || 0) + Number(e.regular_hours) + Number(e.overtime_hours));
      keys.add(`${k}|${e.project_id}`);
    });
    setLoggedHours(hours);
    setLoggedKeys(keys);
    // Keyed on the day/worker *sets* (dayKey, workerIdKey) rather than the arrays,
    // so editing notes or hours never re-runs this query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.company_id, dayKey, workerIdKey]);

  useEffect(() => {
    const t = setTimeout(refreshLogged, 250);
    return () => clearTimeout(t);
  }, [refreshLogged]);

  /* ---------------- templates + draft ---------------- */

  useEffect(() => {
    try {
      const saved = localStorage.getItem(TEMPLATES_KEY);
      if (saved) setTemplates(JSON.parse(saved));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (draftLoaded.current) return;
    draftLoaded.current = true;
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (!saved) return;
      const draft = JSON.parse(saved);
      if (Date.now() - new Date(draft.savedAt).getTime() > 24 * 60 * 60 * 1000) return;
      if (!draft.rows?.length) return;
      setRows(draft.rows);
      if (draft.days?.length) {
        setSelectedDays(draft.days);
        setAnchorDate(draft.days[0]);
      }
      if (draft.shift) setShift(draft.shift);
      if (draft.globalProject) setGlobalProject(draft.globalProject);
      toast({ title: "Draft restored", description: `${draft.rows.length} unsaved rows.` });
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (rows.length === 0) return;
    const t = setTimeout(() => {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ days: selectedDays, shift, globalProject, rows, savedAt: new Date().toISOString() })
      );
    }, 2000);
    return () => clearTimeout(t);
  }, [rows, selectedDays, shift, globalProject]);

  const clearDraft = () => localStorage.removeItem(DRAFT_KEY);

  /* ---------------- row / crew handling ---------------- */

  const makeRow = useCallback(
    (worker: Worker, overrides: Partial<Row> = {}): Row => {
      const hours = overrides.hours ?? shiftHours;
      return {
        id: uid(),
        worker_id: worker.id,
        worker_name: `${worker.first_name} ${worker.last_name}`,
        hourly_rate: Number(worker.hourly_rate) || 0,
        ot_multiplier: Number(worker.overtime_rate_multiplier) || 1.5,
        hours,
        hours_overridden: false,
        overtime_hours: Math.max(0, hours - REGULAR_DAY_HOURS),
        ot_overridden: false,
        project_id: "",
        notes: "",
        ...overrides,
      };
    },
    [shiftHours]
  );

  const toggleWorker = (worker: Worker) => {
    setRows((prev) =>
      prev.some((r) => r.worker_id === worker.id)
        ? prev.filter((r) => r.worker_id !== worker.id)
        : [...prev, makeRow(worker)]
    );
  };

  const selectAllWorkers = () => {
    setRows((prev) => {
      const have = new Set(prev.map((r) => r.worker_id));
      return [...prev, ...workers.filter((w) => !have.has(w.id)).map((w) => makeRow(w))];
    });
  };

  const patchRow = (id: string, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const setRowHours = (id: string, value: string) => {
    const hours = Math.max(0, Math.min(24, parseFloat(value) || 0));
    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              hours,
              hours_overridden: true,
              overtime_hours: r.ot_overridden
                ? Math.min(r.overtime_hours, hours)
                : Math.max(0, hours - REGULAR_DAY_HOURS),
            }
          : r
      )
    );
  };

  const setRowOt = (id: string, value: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, overtime_hours: Math.max(0, Math.min(r.hours, parseFloat(value) || 0)), ot_overridden: true }
          : r
      )
    );
  };

  // Changing the shift re-flows every row that hasn't been hand-edited.
  const applyShift = (next: Shift) => {
    setShift(next);
    const hours = calculateHours(next.start, next.end, next.break_minutes);
    setRows((prev) =>
      prev.map((r) =>
        r.hours_overridden
          ? r
          : {
              ...r,
              hours,
              overtime_hours: r.ot_overridden
                ? Math.min(r.overtime_hours, hours)
                : Math.max(0, hours - REGULAR_DAY_HOURS),
            }
      )
    );
  };

  const toggleDay = (day: string) =>
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );

  const shiftWeek = (dir: number) => setAnchorDate((d) => addDays(d, dir * 7));

  const selectWorkdays = () => setSelectedDays(weekDays.slice(0, 5));

  /* ---------------- load an existing day ---------------- */

  const loadFromDate = async (date: string) => {
    if (!profile?.company_id) return;
    const { data, error } = await supabase
      .from("time_entries")
      .select("worker_id, project_id, regular_hours, overtime_hours, start_time, end_time, break_duration_minutes")
      .eq("company_id", profile.company_id)
      .eq("date", date);

    if (error || !data?.length) {
      toast({ title: "Nothing to copy", description: `No entries on ${shortLabel(date)}.`, variant: "destructive" });
      return;
    }

    const byWorker = new Map<string, Row>();
    data.forEach((e: any) => {
      const worker = workers.find((w) => w.id === e.worker_id);
      if (!worker || byWorker.has(e.worker_id)) return;
      const total = Number(e.regular_hours) + Number(e.overtime_hours);
      byWorker.set(
        e.worker_id,
        makeRow(worker, {
          hours: total,
          hours_overridden: true,
          overtime_hours: Number(e.overtime_hours),
          ot_overridden: Number(e.overtime_hours) > 0,
          project_id: e.project_id || "",
        })
      );
    });

    const first: any = data[0];
    if (first.start_time && first.end_time) {
      setShift({
        start: first.start_time.slice(0, 5),
        end: first.end_time.slice(0, 5),
        break_minutes: Number(first.break_duration_minutes) || 0,
      });
    }
    setRows([...byWorker.values()]);
    setGlobalProject("");
    toast({ title: `Loaded ${shortLabel(date)}`, description: `${byWorker.size} workers.` });
  };

  /* ---------------- templates ---------------- */

  const loadTemplate = (template: CrewTemplate) => {
    const next = template.members
      .map((m) => {
        const worker = workers.find((w) => w.id === m.worker_id);
        return worker ? makeRow(worker, { hours: m.default_hours, hours_overridden: true }) : null;
      })
      .filter(Boolean) as Row[];
    setRows(next);
    if (template.project_id) setGlobalProject(template.project_id);
    toast({ title: "Crew loaded", description: `${template.name} — ${next.length} workers.` });
  };

  const saveTemplate = () => {
    if (!templateName.trim() || rows.length === 0) return;
    const template: CrewTemplate = {
      id: `template-${Date.now()}`,
      name: templateName.trim(),
      project_id: globalProject || undefined,
      project_name: projects.find((p) => p.id === globalProject)?.name,
      members: rows.map((r) => ({
        worker_id: r.worker_id,
        worker_name: r.worker_name,
        default_hours: r.hours,
        hourly_rate: r.hourly_rate,
      })),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const next = [...templates, template];
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(next));
    setTemplates(next);
    setShowTemplateDialog(false);
    setTemplateName("");
    toast({ title: "Crew saved", description: `"${template.name}" is ready to reuse.` });
  };

  const deleteTemplate = (id: string) => {
    const next = templates.filter((t) => t.id !== id);
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(next));
    setTemplates(next);
  };

  /* ---------------- save ---------------- */

  const plan = useMemo<PlannedEntry[]>(() => {
    const out: PlannedEntry[] = [];
    for (const date of [...selectedDays].sort()) {
      for (const row of rows) {
        if (row.hours <= 0) continue;
        const projectId = row.project_id || globalProject;
        if (!projectId) continue;
        const ot = Math.min(row.overtime_hours, row.hours);
        out.push({
          date,
          row,
          project_id: projectId,
          regular_hours: row.hours - ot,
          overtime_hours: ot,
          start_time: shift.start,
          end_time: timeOf(minutesOf(shift.start) + row.hours * 60 + shift.break_minutes),
        });
      }
    }
    return out;
  }, [selectedDays, rows, globalProject, shift]);

  const missingProject = rows.filter((r) => r.hours > 0 && !r.project_id && !globalProject);

  const insertEntries = async (entries: PlannedEntry[]) => {
    if (!user || !profile?.company_id) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("time_entries").insert(
        entries.map((e) => ({
          worker_id: e.row.worker_id,
          project_id: e.project_id,
          company_id: profile.company_id,
          date: e.date,
          start_time: e.start_time,
          end_time: e.end_time,
          break_duration_minutes: shift.break_minutes,
          regular_hours: e.regular_hours,
          overtime_hours: e.overtime_hours,
          notes: e.row.notes || null,
          created_by: user.id,
        }))
      );
      if (error) throw error;
      clearDraft();
      toast({
        title: "Time logged",
        description: `${entries.length} ${entries.length === 1 ? "entry" : "entries"} saved.`,
        variant: "success",
      });
      refreshLogged();
      refreshContext();
    } catch (err: any) {
      toast({ title: "Error saving", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
      setPendingDupes(null);
      setPendingFresh([]);
    }
  };

  const handleSave = async () => {
    if (!user || !profile?.company_id) {
      toast({ title: "Not ready", description: "Sign in and join a company first.", variant: "destructive" });
      return;
    }
    if (selectedDays.length === 0) {
      toast({ title: "Pick a day", description: "Select at least one day to log.", variant: "destructive" });
      return;
    }
    if (missingProject.length > 0) {
      toast({
        title: "Missing project",
        description: `${missingProject.map((r) => r.worker_name).join(", ")} need a project.`,
        variant: "destructive",
      });
      return;
    }
    if (plan.length === 0) {
      toast({ title: "Nothing to save", description: "Add a worker with hours.", variant: "destructive" });
      return;
    }

    const dupes = plan.filter((e) => loggedKeys.has(`${e.date}|${e.row.worker_id}|${e.project_id}`));
    const fresh = plan.filter((e) => !loggedKeys.has(`${e.date}|${e.row.worker_id}|${e.project_id}`));

    if (dupes.length > 0) {
      setPendingDupes(dupes);
      setPendingFresh(fresh);
      return;
    }
    await insertEntries(plan);
  };

  // Cmd/Ctrl+S
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  /* ---------------- totals ---------------- */

  const totals = useMemo(() => {
    let regular = 0;
    let overtime = 0;
    let cost = 0;
    plan.forEach((e) => {
      regular += e.regular_hours;
      overtime += e.overtime_hours;
      cost += e.regular_hours * e.row.hourly_rate + e.overtime_hours * e.row.hourly_rate * e.row.ot_multiplier;
    });
    return { regular, overtime, cost };
  }, [plan]);

  const warnCount = plan.filter((e) => loggedHours.has(`${e.date}|${e.row.worker_id}`)).length;

  /* ---------------- render ---------------- */

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-foreground-lighter" />
      </div>
    );
  }

  const inputClass =
    "h-8 px-2.5 rounded-md bg-surface-100 border border-strong text-[13px] text-foreground-light outline-none focus:border-brand transition-colors";
  const chipClass = "px-2.5 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-wide transition-colors";

  return (
    <div className="flex flex-col h-full overflow-auto bg-background">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
        <div>
          <p className="text-[11px] font-mono text-foreground-lighter uppercase tracking-widest">Time Tracking</p>
          <h1 className="text-[16px] font-semibold text-foreground mt-0.5">Quick Entry</h1>
        </div>
        <Link
          href={`/time-tracking?date=${anchorDate}`}
          className="text-[12px] text-foreground-lighter hover:text-foreground-light transition-colors"
        >
          ← Back to hours
        </Link>
      </div>

      {/* Day picker — multi-select */}
      <div className="border-b border-border bg-surface-100 flex-shrink-0">
        <div className="flex items-center px-4 py-2 gap-2">
          <button
            onClick={() => shiftWeek(-1)}
            className="text-foreground-lighter hover:text-foreground-light transition-colors px-1 text-[13px]"
          >
            ←
          </button>
          <div className="flex-1 flex items-center gap-1">
            {weekDays.map((day, i) => {
              const active = selectedDays.includes(day);
              const count = weekCounts[day] ?? 0;
              return (
                <button
                  key={day}
                  onClick={() => toggleDay(day)}
                  className={cn(
                    "flex-1 flex flex-col items-center py-2 rounded-md transition-colors border",
                    active ? "bg-surface-300 border-brand" : "border-transparent hover:bg-surface-200"
                  )}
                >
                  <span
                    className={cn(
                      "text-[10px] font-mono uppercase tracking-wide",
                      active ? "text-brand" : "text-foreground-lighter"
                    )}
                  >
                    {DAY_LABELS[i]}
                  </span>
                  <span
                    className={cn(
                      "text-[14px] tabular-nums mt-0.5",
                      active ? "text-foreground" : day === todayISO() ? "text-foreground-light" : "text-foreground-lighter"
                    )}
                  >
                    {dayNum(day)}
                  </span>
                  <div className="h-1 mt-1 flex items-center justify-center">
                    {count > 0 ? (
                      <span className={cn("text-[9px] tabular-nums", active ? "text-brand" : "text-foreground-lighter")}>
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
          <button
            onClick={() => shiftWeek(1)}
            className="text-foreground-lighter hover:text-foreground-light transition-colors px-1 text-[13px]"
          >
            →
          </button>
          <div className="flex items-center gap-1 pl-2 border-l border-border">
            <button
              onClick={selectWorkdays}
              className={cn(chipClass, "text-foreground-lighter hover:text-foreground-light")}
            >
              Mon–Fri
            </button>
            <button
              onClick={() => setSelectedDays([anchorDate])}
              className={cn(chipClass, "text-foreground-lighter hover:text-foreground-light")}
            >
              One day
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 p-6 space-y-5 pb-28">
        {/* Shift + project */}
        <div className="rounded-lg border border-border bg-surface-100 px-5 py-4">
          <div className="flex flex-wrap items-end gap-5">
            <div className="space-y-1">
              <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">Shift</p>
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  value={shift.start}
                  onChange={(e) => applyShift({ ...shift, start: e.target.value })}
                  className={cn(inputClass, "w-[110px]")}
                />
                <span className="text-[12px] text-foreground-lighter">to</span>
                <input
                  type="time"
                  value={shift.end}
                  onChange={(e) => applyShift({ ...shift, end: e.target.value })}
                  className={cn(inputClass, "w-[110px]")}
                />
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">Break (min)</p>
              <input
                type="number"
                min="0"
                step="15"
                value={shift.break_minutes}
                onChange={(e) => applyShift({ ...shift, break_minutes: parseInt(e.target.value) || 0 })}
                className={cn(inputClass, "w-[80px] text-center")}
              />
            </div>

            <div className="space-y-1">
              <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">Day length</p>
              <p className="h-8 flex items-center text-[15px] tabular-nums font-semibold text-foreground">
                {shiftHours.toFixed(1)}h
                {shiftHours > REGULAR_DAY_HOURS && (
                  <span className="text-[11px] tabular-nums text-brand ml-2">
                    {(shiftHours - REGULAR_DAY_HOURS).toFixed(1)}h OT
                  </span>
                )}
              </p>
            </div>

            <div className="flex items-center gap-1 pb-0.5">
              {SHIFT_PRESETS.map((p) => {
                const active =
                  p.shift.start === shift.start &&
                  p.shift.end === shift.end &&
                  p.shift.break_minutes === shift.break_minutes;
                return (
                  <button
                    key={p.label}
                    onClick={() => applyShift(p.shift)}
                    className={cn(
                      chipClass,
                      active
                        ? "bg-surface-300 text-brand border border-strong"
                        : "text-foreground-lighter hover:text-foreground-light"
                    )}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>

            <div className="flex-1 min-w-[220px] space-y-1">
              <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">
                Project (all workers)
              </p>
              <Select
                value={globalProject || "none"}
                onValueChange={(v) => setGlobalProject(v === "none" ? "" : v)}
              >
                <SelectTrigger className="h-8 bg-surface-100 border-strong text-foreground-light text-[13px] focus:ring-0">
                  <SelectValue placeholder="Set per worker" />
                </SelectTrigger>
                <SelectContent className="bg-surface-100 border-strong">
                  <SelectItem value="none" className="text-foreground-light text-[13px]">
                    Set per worker
                  </SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-foreground-light text-[13px]">
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Crew controls */}
        <div className="flex flex-wrap items-center gap-2">
          <Popover open={crewOpen} onOpenChange={setCrewOpen}>
            <PopoverTrigger asChild>
              <button className="flex items-center gap-2 px-3 py-2 rounded-md bg-surface-300 border border-strong text-[12px] text-brand hover:bg-surface-400 transition-colors">
                <Users className="h-3.5 w-3.5" />
                {rows.length > 0 ? `${rows.length} on crew` : "Add crew"}
                <ChevronDown className="h-3.5 w-3.5 opacity-60" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-[320px] p-0 bg-surface-100 border-strong" align="start">
              <Command className="bg-surface-100">
                <CommandInput placeholder="Search workers..." className="text-[13px]" />
                <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                  <button onClick={selectAllWorkers} className="text-[11px] text-brand hover:opacity-80">
                    Select all ({workers.length})
                  </button>
                  <button
                    onClick={() => setRows([])}
                    className="text-[11px] text-foreground-lighter hover:text-foreground-light"
                  >
                    Clear
                  </button>
                </div>
                <CommandList className="max-h-[320px]">
                  <CommandEmpty className="py-6 text-center text-[12px] text-foreground-lighter">
                    No worker found.
                  </CommandEmpty>
                  <CommandGroup>
                    {workers.map((worker) => {
                      const name = `${worker.first_name} ${worker.last_name}`;
                      const picked = rows.some((r) => r.worker_id === worker.id);
                      return (
                        <CommandItem
                          key={worker.id}
                          value={name}
                          onSelect={() => toggleWorker(worker)}
                          className="text-[13px] text-foreground-light aria-selected:bg-surface-200"
                        >
                          <span
                            className={cn(
                              "mr-2 flex h-4 w-4 items-center justify-center rounded border",
                              picked ? "bg-brand border-brand" : "border-strong"
                            )}
                          >
                            {picked && <Check className="h-3 w-3 text-background" />}
                          </span>
                          <span className="flex-1">{name}</span>
                          <span className="text-[11px] tabular-nums text-foreground-lighter">
                            ${worker.hourly_rate ?? 0}/hr
                          </span>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 px-3 py-2 rounded-md border border-strong text-[12px] text-foreground-lighter hover:text-foreground-light transition-colors">
                Saved crews
                <ChevronDown className="h-3.5 w-3.5 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[260px] bg-surface-100 border-strong">
              {templates.length === 0 ? (
                <div className="px-3 py-4 text-center text-[12px] text-foreground-lighter">No saved crews yet</div>
              ) : (
                templates.map((t) => (
                  <DropdownMenuItem
                    key={t.id}
                    className="flex justify-between text-foreground-light"
                    onSelect={(e) => e.preventDefault()}
                  >
                    <button className="flex-1 text-left" onClick={() => loadTemplate(t)}>
                      <div className="text-[13px]">{t.name}</div>
                      <div className="text-[11px] text-foreground-lighter">{t.members.length} workers</div>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteTemplate(t.id);
                      }}
                      className="text-foreground-lighter hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuItem>
                ))
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-[12px] text-foreground-light"
                onSelect={() => rows.length > 0 && setShowTemplateDialog(true)}
              >
                Save current crew…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {lastLoggedDay && (
            <button
              onClick={() => loadFromDate(lastLoggedDay.date)}
              className="px-3 py-2 rounded-md border border-strong text-[12px] text-foreground-lighter hover:text-foreground-light transition-colors"
            >
              Copy {shortLabel(lastLoggedDay.date)} ({lastLoggedDay.count})
            </button>
          )}
          <button
            onClick={() => loadFromDate(addDays(anchorDate, -7))}
            className="px-3 py-2 rounded-md border border-strong text-[12px] text-foreground-lighter hover:text-foreground-light transition-colors"
          >
            Copy last week
          </button>

          <div className="flex-1" />
          {rows.length > 0 && (
            <button
              onClick={() => {
                setRows([]);
                clearDraft();
              }}
              className="px-3 py-2 text-[12px] text-foreground-lighter hover:text-destructive transition-colors"
            >
              Clear crew
            </button>
          )}
        </div>

        {/* Grid */}
        <div className="rounded-lg border border-border bg-surface-100 overflow-hidden">
          {rows.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-[13px] text-foreground-lighter">No workers picked yet</p>
              <button onClick={() => setCrewOpen(true)} className="inline-flex items-center gap-1.5 mt-3 text-[12px] text-brand hover:opacity-80">
                <Plus className="h-3.5 w-3.5" />
                Add crew
              </button>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">
                    Worker
                  </th>
                  <th className="px-3 py-2.5 text-right text-[10px] font-mono uppercase tracking-widest text-foreground-lighter w-[90px]">
                    Hours
                  </th>
                  <th className="px-3 py-2.5 text-right text-[10px] font-mono uppercase tracking-widest text-foreground-lighter w-[90px]">
                    OT
                  </th>
                  <th className="px-3 py-2.5 text-right text-[10px] font-mono uppercase tracking-widest text-foreground-lighter w-[80px]">
                    Rate
                  </th>
                  {!globalProject && (
                    <th className="px-3 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest text-foreground-lighter w-[200px]">
                      Project
                    </th>
                  )}
                  <th className="px-3 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">
                    Notes
                  </th>
                  <th className="px-3 py-2.5 text-right text-[10px] font-mono uppercase tracking-widest text-foreground-lighter w-[90px]">
                    Cost{selectedDays.length > 1 && ` (${selectedDays.length}d)`}
                  </th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => {
                  const clashes = selectedDays.filter((d) => loggedHours.has(`${d}|${row.worker_id}`));
                  const ot = Math.min(row.overtime_hours, row.hours);
                  const cost =
                    ((row.hours - ot) * row.hourly_rate + ot * row.hourly_rate * row.ot_multiplier) *
                    Math.max(1, selectedDays.length);
                  return (
                    <tr key={row.id} className="group hover:bg-surface-200 transition-colors">
                      <td className="px-5 py-2.5">
                        <div className="text-[13px] text-foreground-light">{row.worker_name}</div>
                        {clashes.length > 0 && (
                          <div className="flex items-center gap-1 mt-0.5 text-[11px] text-warning">
                            <AlertTriangle className="h-3 w-3" />
                            <span>
                              Already logged on{" "}
                              {clashes
                                .map((d) => parseISO(d).toLocaleDateString("en-US", { weekday: "short" }))
                                .join(", ")}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <input
                          type="number"
                          min="0"
                          max="24"
                          step="0.5"
                          value={row.hours || ""}
                          onChange={(e) => setRowHours(row.id, e.target.value)}
                          className={cn(inputClass, "w-[70px] text-right tabular-nums")}
                        />
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={row.overtime_hours || ""}
                          placeholder="0"
                          onChange={(e) => setRowOt(row.id, e.target.value)}
                          className={cn(
                            inputClass,
                            "w-[70px] text-right tabular-nums",
                            ot > 0 && "text-brand"
                          )}
                        />
                      </td>
                      <td className="px-3 py-2.5 text-right text-[12px] tabular-nums text-foreground-lighter">
                        ${row.hourly_rate}/hr
                      </td>
                      {!globalProject && (
                        <td className="px-3 py-2.5">
                          <Select
                            value={row.project_id}
                            onValueChange={(v) => patchRow(row.id, { project_id: v })}
                          >
                            <SelectTrigger className="h-8 bg-surface-100 border-strong text-foreground-light text-[12px] focus:ring-0">
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                            <SelectContent className="bg-surface-100 border-strong">
                              {projects.map((p) => (
                                <SelectItem key={p.id} value={p.id} className="text-foreground-light text-[13px]">
                                  {p.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                      )}
                      <td className="px-3 py-2.5">
                        <input
                          value={row.notes}
                          onChange={(e) => patchRow(row.id, { notes: e.target.value })}
                          placeholder="—"
                          className={cn(inputClass, "w-full")}
                        />
                      </td>
                      <td className="px-3 py-2.5 text-right text-[12px] tabular-nums text-foreground-light">
                        {formatCurrency(cost)}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          onClick={() => setRows((prev) => prev.filter((r) => r.id !== row.id))}
                          className="text-foreground-lighter hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Sticky save bar */}
      <div className="sticky bottom-0 border-t border-border bg-surface-100/95 backdrop-blur px-6 py-3 flex items-center gap-5 flex-shrink-0">
        <div className="flex items-center gap-4 text-[12px] text-foreground-lighter">
          <span className="tabular-nums">
            <span className="text-foreground-light">{rows.length}</span> worker{rows.length === 1 ? "" : "s"} ×{" "}
            <span className="text-foreground-light">{selectedDays.length}</span> day
            {selectedDays.length === 1 ? "" : "s"} ={" "}
            <span className="text-foreground font-medium">{plan.length}</span> entries
          </span>
          <span className="text-border">|</span>
          <span className="tabular-nums">
            {totals.regular.toFixed(1)}h
            {totals.overtime > 0 && <span className="text-brand"> + {totals.overtime.toFixed(1)}h OT</span>}
          </span>
          <span className="text-border">|</span>
          <span className="tabular-nums text-brand font-medium">{formatCurrency(totals.cost)}</span>
          {warnCount > 0 && (
            <span className="flex items-center gap-1 text-warning">
              <AlertTriangle className="h-3 w-3" />
              {warnCount} already logged
            </span>
          )}
        </div>
        <div className="flex-1" />
        <span className="text-[11px] font-mono text-foreground-lighter uppercase tracking-wide hidden md:inline">
          ⌘S to save
        </span>
        <button
          onClick={handleSave}
          disabled={saving || plan.length === 0}
          className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-surface-300 border border-strong text-[12px] text-brand hover:bg-surface-400 transition-colors disabled:opacity-40"
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Save {plan.length} {plan.length === 1 ? "entry" : "entries"}
        </button>
      </div>

      {/* Duplicate resolution */}
      <Dialog open={pendingDupes !== null} onOpenChange={(open) => !open && setPendingDupes(null)}>
        <DialogContent className="max-w-md bg-surface-100 border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-foreground text-[15px]">Some entries already exist</DialogTitle>
          </DialogHeader>
          <p className="text-[13px] text-foreground-lighter">
            {pendingDupes?.length} of {plan.length} would duplicate time already logged for the same worker, project
            and day.
          </p>
          <div className="max-h-[220px] overflow-auto space-y-1 my-1">
            {pendingDupes?.map((e, i) => (
              <div
                key={`${e.date}-${e.row.id}-${i}`}
                className="flex items-center justify-between px-3 py-2 rounded-md bg-warning-subtle text-[12px]"
              >
                <span className="text-foreground-light">{e.row.worker_name}</span>
                <span className="text-foreground-lighter tabular-nums">{shortLabel(e.date)}</span>
              </div>
            ))}
          </div>
          <DialogFooter className="gap-2">
            <button
              onClick={() => setPendingDupes(null)}
              className="px-4 py-2 text-[12px] text-foreground-lighter hover:text-foreground-light transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => insertEntries(plan)}
              className="px-4 py-2 rounded-md border border-strong text-[12px] text-foreground-lighter hover:text-foreground-light transition-colors"
            >
              Save all anyway
            </button>
            <button
              onClick={() => insertEntries(pendingFresh)}
              disabled={pendingFresh.length === 0}
              className="px-4 py-2 rounded-md bg-surface-300 border border-strong text-[12px] text-brand hover:bg-surface-400 transition-colors disabled:opacity-40"
            >
              Skip {pendingDupes?.length}, save {pendingFresh.length}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save crew */}
      <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
        <DialogContent className="max-w-sm bg-surface-100 border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-foreground text-[15px]">Save crew</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1">
              <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">Name</p>
              <input
                autoFocus
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveTemplate()}
                placeholder="e.g. Laundromat crew"
                className={cn(inputClass, "w-full")}
              />
            </div>
            <div className="rounded-md border border-border bg-background px-3 py-2 space-y-1">
              {rows.map((r) => (
                <div key={r.id} className="flex justify-between text-[12px]">
                  <span className="text-foreground-light">{r.worker_name}</span>
                  <span className="text-foreground-lighter tabular-nums">{r.hours}h</span>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <button
              onClick={() => setShowTemplateDialog(false)}
              className="px-4 py-2 text-[12px] text-foreground-lighter hover:text-foreground-light transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={saveTemplate}
              disabled={!templateName.trim()}
              className="px-4 py-2 rounded-md bg-surface-300 border border-strong text-[12px] text-brand hover:bg-surface-400 transition-colors disabled:opacity-40"
            >
              Save crew
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
