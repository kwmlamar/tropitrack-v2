"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronRight as ChevronRightSmall,
  GanttChartSquare,
  Pencil,
  X,
  DollarSign,
  Trash2,
} from "lucide-react";
import { addDays, addWeeks, subWeeks, format, startOfWeek, differenceInDays, parseISO, isValid } from "date-fns";
import { PhasePanel } from "@/components/gantt/PhasePanel";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Project {
  id: string;
  name: string;
  status: string;
}

interface Phase {
  id: string;
  estimate_id: string;
  name: string;
  order_index: number;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  progress: number;
  notes: string | null;
}

interface EditingPhase {
  id: string | null;
  estimate_id: string;
  name: string;
  planned_start: string;
  planned_end: string;
  progress: number;
}

interface LaborRole {
  id: string;
  name: string;
  daily_rate: number;
}

type DailyWorkers = Record<string, number>; // { "YYYY-MM-DD": workerCount }

interface LineItem {
  id: string;
  section_id: string;
  estimate_id: string;
  description: string;
  role_id: string | null;
  daily_workers: DailyWorkers;
  labor_cost: number;
  material_cost: number;
  equipment_cost: number;
  order_index: number;
  show_to_client: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const WEEKS_VISIBLE = 12;
const COL_W = 40;  // px per day column
const ROW_H = 36;  // px per phase row
const TASK_H = 40; // px per task row
const HEAD_H = 22; // px column-header row inside expanded phase
const LABEL_W = 390; // px for left label column

// Amber heatmap intensities for worker counts 1..9+
function heatmapStyle(count: number): { background: string; color: string } {
  if (!count || count <= 0) return { background: "transparent", color: "#3a3d42" };
  const alpha = Math.min(0.10 + count * 0.10, 0.85);
  return {
    background: `rgba(245, 166, 35, ${alpha})`,
    color: count >= 5 ? "#18191b" : "#ededed",
  };
}

// Sum the daily worker counts → ManDays
function sumDailyWorkers(daily: DailyWorkers | null | undefined): number {
  if (!daily) return 0;
  return Object.values(daily).reduce((s, n) => s + (Number(n) || 0), 0);
}

function computeLaborCost(role: LaborRole | undefined, daily: DailyWorkers): number {
  if (!role) return 0;
  return role.daily_rate * sumDailyWorkers(daily);
}

const STATUS_COLOR: Record<string, string> = {
  active:    "#22C55E",
  planning:  "#3B82F6",
  on_hold:   "#F5A623",
  completed: "#555",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysBetween(a: Date, b: Date) {
  return Math.max(0, differenceInDays(b, a));
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function safeDate(s: string | null): Date | null {
  if (!s) return null;
  const d = parseISO(s);
  return isValid(d) ? d : null;
}

// ─── Phase Bar ────────────────────────────────────────────────────────────────

type DragMode = "move" | "resize-start" | "resize-end" | null;
const EDGE_PX = 8;        // edge hit zone for resize cursors
const CLICK_THRESHOLD = 4; // px of movement before drag overrides click

function PhaseBar({
  phase,
  viewStart,
  totalDays,
  onClick,
  onCommitDates,
  crewSummary,
}: {
  phase: Phase;
  viewStart: Date;
  totalDays: number;
  onClick: () => void;
  onCommitDates: (phaseId: string, plannedStart: string, plannedEnd: string) => void;
  crewSummary?: { peak: number; avg: number; mandays: number; distinctDays: number; hasData: boolean };
}) {
  // Local override during drag — null when not dragging
  const [drag, setDrag] = useState<{
    mode: Exclude<DragMode, null>;
    startX: number;
    origStart: Date;
    origEnd: Date;
    curStart: Date;
    curEnd: Date;
    moved: boolean;
    cursorX: number;
    cursorY: number;
  } | null>(null);

  // Hover-aware cursor: which zone the pointer is over when NOT dragging
  const [hoverZone, setHoverZone] = useState<Exclude<DragMode, null> | null>(null);

  const ps = safeDate(phase.planned_start);
  const pe = safeDate(phase.planned_end);

  if (!ps || !pe) return (
    <div className="flex items-center h-full px-3" onClick={onClick}>
      <span className="text-[11px] text-[#333] italic cursor-pointer">No dates set — click to edit</span>
    </div>
  );

  // Use drag-local dates if dragging, else committed dates
  const liveStart = drag ? drag.curStart : ps;
  const liveEnd   = drag ? drag.curEnd   : pe;

  const startOff = clamp(differenceInDays(liveStart, viewStart), 0, totalDays);
  const endOff   = clamp(differenceInDays(liveEnd, viewStart) + 1, 0, totalDays);
  const width    = Math.max(endOff - startOff, 0) * COL_W;
  const left     = startOff * COL_W;

  if (width === 0) return (
    <div className="flex items-center h-full px-3" onClick={onClick}>
      <span className="text-[11px] text-[#333] italic cursor-pointer">Outside view — scroll to see</span>
    </div>
  );

  function pickMode(e: React.PointerEvent<HTMLDivElement>): Exclude<DragMode, null> {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x <= EDGE_PX) return "resize-start";
    if (x >= rect.width - EDGE_PX) return "resize-end";
    return "move";
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const mode = pickMode(e);
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    setDrag({
      mode,
      startX: e.clientX,
      origStart: ps!,
      origEnd: pe!,
      curStart: ps!,
      curEnd: pe!,
      moved: false,
      cursorX: e.clientX,
      cursorY: e.clientY,
    });
  }

  function onHoverMove(e: React.PointerEvent<HTMLDivElement>) {
    if (drag) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const zone: Exclude<DragMode, null> =
      x <= EDGE_PX ? "resize-start" : x >= rect.width - EDGE_PX ? "resize-end" : "move";
    if (zone !== hoverZone) setHoverZone(zone);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag) return;
    const dxPx = e.clientX - drag.startX;
    const dxDays = Math.round(dxPx / COL_W); // snap-to-day
    const moved = Math.abs(dxPx) > CLICK_THRESHOLD;

    let curStart = drag.origStart;
    let curEnd   = drag.origEnd;

    if (drag.mode === "move") {
      curStart = addDays(drag.origStart, dxDays);
      curEnd   = addDays(drag.origEnd, dxDays);
    } else if (drag.mode === "resize-start") {
      const candidate = addDays(drag.origStart, dxDays);
      // Don't allow start to pass end
      curStart = differenceInDays(drag.origEnd, candidate) >= 0 ? candidate : drag.origEnd;
    } else if (drag.mode === "resize-end") {
      const candidate = addDays(drag.origEnd, dxDays);
      curEnd = differenceInDays(candidate, drag.origStart) >= 0 ? candidate : drag.origStart;
    }

    setDrag({
      ...drag,
      curStart,
      curEnd,
      moved: moved || drag.moved,
      cursorX: e.clientX,
      cursorY: e.clientY,
    });
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag) return;
    (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);

    if (!drag.moved) {
      setDrag(null);
      onClick();
      return;
    }

    const newStart = format(drag.curStart, "yyyy-MM-dd");
    const newEnd   = format(drag.curEnd, "yyyy-MM-dd");
    const origStart = format(drag.origStart, "yyyy-MM-dd");
    const origEnd   = format(drag.origEnd, "yyyy-MM-dd");

    setDrag(null);
    if (newStart !== origStart || newEnd !== origEnd) {
      onCommitDates(phase.id, newStart, newEnd);
    }
  }

  function onPointerCancel() {
    setDrag(null);
  }

  // Cursor reflects: active drag mode if dragging, else hover zone
  const activeMode = drag?.mode ?? hoverZone;
  const cursor = drag
    ? drag.mode === "move" ? "grabbing" : "ew-resize"
    : activeMode === "move" ? "grab"
    : activeMode ? "ew-resize" : "grab";

  return (
    <>
      <div
        className={cn(
          "absolute inset-y-1.5 rounded group overflow-hidden select-none touch-none",
          drag && "opacity-70"
        )}
        style={{ left, width, cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={(e) => {
          onHoverMove(e);
          onPointerMove(e);
        }}
        onPointerLeave={() => !drag && setHoverZone(null)}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        title={
          `${phase.name} · ${phase.progress}% complete · Drag to reschedule` +
          (crewSummary?.hasData
            ? `\nPeak ${crewSummary.peak} crew · avg ${crewSummary.avg}/day · ${crewSummary.mandays} mandays across ${crewSummary.distinctDays} days`
            : "")
        }
      >
        {/* Planned bar (background) */}
        <div className="absolute inset-0 rounded bg-[#2d3035] border border-[#3a3d42]" />
        {/* Actual progress fill */}
        <div
          className="absolute inset-y-0 left-0 rounded transition-[width] duration-300"
          style={{
            width: `${phase.progress}%`,
            background: phase.progress === 100
              ? "rgba(34,197,94,0.25)"
              : "rgba(245,166,35,0.2)",
            borderRight: phase.progress > 0 && phase.progress < 100
              ? "1px solid rgba(245,166,35,0.5)"
              : undefined,
          }}
        />
        {/* Label */}
        {width > 60 && (
          <div className="absolute inset-0 flex items-center px-2 pointer-events-none">
            <span className="text-[11px] font-mono text-[#888] truncate">
              {phase.progress > 0 ? `${phase.progress}%` : "—"}
              {crewSummary?.hasData
                ? ` · ${crewSummary.peak} peak · ${crewSummary.distinctDays} ${crewSummary.distinctDays === 1 ? "day" : "days"}`
                : ""}
            </span>
          </div>
        )}
        {/* Edge grip — left */}
        <div
          className={cn(
            "absolute inset-y-0 left-0 w-1.5 flex items-center justify-center pointer-events-none transition-opacity duration-150",
            activeMode === "resize-start" ? "opacity-100" : "opacity-0 group-hover:opacity-60"
          )}
        >
          <div className="h-3/5 w-[2px] rounded-full bg-[#F5A623]" />
        </div>
        {/* Edge grip — right */}
        <div
          className={cn(
            "absolute inset-y-0 right-0 w-1.5 flex items-center justify-center pointer-events-none transition-opacity duration-150",
            activeMode === "resize-end" ? "opacity-100" : "opacity-0 group-hover:opacity-60"
          )}
        >
          <div className="h-3/5 w-[2px] rounded-full bg-[#F5A623]" />
        </div>
        {/* Hover ring */}
        <div className="absolute inset-0 rounded border border-[#F5A623]/0 group-hover:border-[#F5A623]/40 transition-colors pointer-events-none" />
      </div>

      {/* Floating drag tooltip — anchored to cursor */}
      {drag && drag.moved && (
        <div
          className="fixed z-50 pointer-events-none px-2.5 py-1.5 rounded bg-card border text-card-foreground shadow-lg"
          style={{
            top: drag.cursorY - 56,
            left: drag.cursorX,
            transform: "translateX(-50%)",
          }}
        >
          <div className="text-[10px] font-mono text-[#888] uppercase tracking-wider mb-0.5">
            {drag.mode === "move" ? "Reschedule" : drag.mode === "resize-start" ? "Start" : "End"}
          </div>
          <div className="text-[12px] font-mono text-[#F5A623] whitespace-nowrap">
            {format(drag.curStart, "MMM d")} → {format(drag.curEnd, "MMM d")}
            <span className="text-[#666] ml-1.5">
              ({differenceInDays(drag.curEnd, drag.curStart) + 1}d)
            </span>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Edit Panel ───────────────────────────────────────────────────────────────

function EditPanel({
  phase,
  onSave,
  onDelete,
  onClose,
}: {
  phase: EditingPhase;
  onSave: (p: EditingPhase) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState(phase);
  const set = (k: keyof EditingPhase, v: string | number) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#202224] border border-[#222] rounded-lg w-[420px] shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2b2e33]">
          <span className="text-[13px] font-semibold text-[#d0d0d0]">
            {phase.id ? "Edit phase" : "Add phase"}
          </span>
          <button onClick={onClose} className="text-[#333] hover:text-[#666]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-[11px] font-mono text-[#444] uppercase tracking-wider mb-1.5">
              Phase name
            </label>
            <input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              className="w-full bg-[#18191b] border border-[#222] rounded px-3 py-2 text-[13px] text-[#d0d0d0] focus:outline-none focus:border-[#F5A623] transition-colors"
              placeholder="e.g. Foundation, Roof, Electrical..."
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-mono text-[#444] uppercase tracking-wider mb-1.5">
                Planned start
              </label>
              <input
                type="date"
                value={form.planned_start}
                onChange={(e) => set("planned_start", e.target.value)}
                className="w-full bg-[#18191b] border border-[#222] rounded px-3 py-2 text-[13px] text-[#d0d0d0] focus:outline-none focus:border-[#F5A623] transition-colors"
              />
            </div>
            <div>
              <label className="block text-[11px] font-mono text-[#444] uppercase tracking-wider mb-1.5">
                Planned end
              </label>
              <input
                type="date"
                value={form.planned_end}
                onChange={(e) => set("planned_end", e.target.value)}
                className="w-full bg-[#18191b] border border-[#222] rounded px-3 py-2 text-[13px] text-[#d0d0d0] focus:outline-none focus:border-[#F5A623] transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-mono text-[#444] uppercase tracking-wider mb-1.5">
              Progress — {form.progress}%
            </label>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={form.progress}
              onChange={(e) => set("progress", Number(e.target.value))}
              className="w-full accent-[#F5A623]"
            />
          </div>
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-t border-[#2b2e33]">
          {phase.id ? (
            <button
              onClick={onDelete}
              className="text-[12px] text-[#EF4444]/60 hover:text-[#EF4444] transition-colors"
            >
              Delete phase
            </button>
          ) : <div />}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-[12px] text-[#555] hover:text-[#888] border border-[#222] rounded transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => onSave(form)}
              disabled={!form.name.trim()}
              className="px-3 py-1.5 text-[12px] font-medium bg-[#F5A623] text-[#18191b] rounded hover:bg-[#f5a623cc] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function GanttPage() {
  const { profile } = useAuth();
  const supabase = createClient();

  const [projects, setProjects] = useState<Project[]>([]);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [activeProject, setActiveProject] = useState<string | null>(null);
  const [activeEstimateId, setActiveEstimateId] = useState<string | null>(null);
  const [laborRoles, setLaborRoles] = useState<LaborRole[]>([]);
  const [ratesOpen, setRatesOpen] = useState(false);
  const [tasksByPhase, setTasksByPhase] = useState<Record<string, LineItem[]>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [viewStart, setViewStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EditingPhase | null>(null);
  const [panelPhase, setPanelPhase] = useState<Phase | null>(null);

  const totalDays = WEEKS_VISIBLE * 7;
  const viewEnd = addDays(viewStart, totalDays - 1);

  useEffect(() => {
    if (!profile?.company_id) return;
    loadProjects();
  }, [profile?.company_id]);

  useEffect(() => {
    if (activeProject) loadEstimateAndPhases(activeProject);
  }, [activeProject]);

  async function loadProjects() {
    setLoading(true);
    const { data } = await supabase
      .from("projects")
      .select("id,name,status")
      .eq("company_id", profile!.company_id)
      .in("status", ["active", "in_progress", "not_started", "planning", "in progress"])
      .order("created_at", { ascending: false });
    setProjects(data ?? []);
    if (data && data.length > 0 && !activeProject) setActiveProject(data[0].id);
    setLoading(false);
  }

  // Resolve the project's estimate (single-source), then load its sections + line items
  async function loadEstimateAndPhases(projectId: string) {
    const { data: est, error: estErr } = await supabase
      .from("estimates")
      .select("id, labor_roles")
      .eq("project_id", projectId)
      .maybeSingle();

    if (estErr) {
      console.error("estimates lookup error:", estErr);
      setActiveEstimateId(null);
      setLaborRoles([]);
      setPhases([]);
      setTasksByPhase({});
      return;
    }
    if (!est) {
      setActiveEstimateId(null);
      setLaborRoles([]);
      setPhases([]);
      setTasksByPhase({});
      return;
    }

    setActiveEstimateId(est.id);
    setLaborRoles(Array.isArray(est.labor_roles) ? (est.labor_roles as LaborRole[]) : []);

    const { data: sections, error } = await supabase
      .from("estimate_sections")
      .select("*")
      .eq("estimate_id", est.id)
      .order("order_index");
    if (error) console.error("estimate_sections error:", error);
    setPhases(sections ?? []);

    // Eager-load all line items for live totals
    const { data: items } = await supabase
      .from("estimate_line_items")
      .select("id, section_id, estimate_id, description, role_id, daily_workers, labor_cost, material_cost, equipment_cost, order_index, show_to_client")
      .eq("estimate_id", est.id)
      .order("order_index");
    const byPhase: Record<string, LineItem[]> = {};
    for (const it of (items ?? []) as LineItem[]) {
      const normalised: LineItem = {
        ...it,
        daily_workers: (it.daily_workers as DailyWorkers) ?? {},
      };
      (byPhase[it.section_id] ??= []).push(normalised);
    }
    setTasksByPhase(byPhase);
  }

  // ── Rate card (estimate.labor_roles) ────────────────────────────────────────
  async function saveLaborRoles(roles: LaborRole[]) {
    if (!activeEstimateId) return;
    setLaborRoles(roles);
    const { error } = await supabase
      .from("estimates")
      .update({ labor_roles: roles })
      .eq("id", activeEstimateId);
    if (error) console.error("Failed to save labor roles:", error);
  }

  // ── Tasks (line items) ──────────────────────────────────────────────────────
  function toggleExpand(phaseId: string) {
    setExpanded((p) => ({ ...p, [phaseId]: !p[phaseId] }));
  }

  function patchTaskLocal(phaseId: string, taskId: string, patch: Partial<LineItem>) {
    setTasksByPhase((prev) => ({
      ...prev,
      [phaseId]: (prev[phaseId] ?? []).map((t) => (t.id === taskId ? { ...t, ...patch } : t)),
    }));
  }

  async function saveTask(phaseId: string, taskId: string, patch: Partial<LineItem>) {
    patchTaskLocal(phaseId, taskId, patch);
    const { error } = await supabase
      .from("estimate_line_items")
      .update(patch)
      .eq("id", taskId);
    if (error) console.error("Failed to update task:", error);
  }

  // Edit one day's worker count → recompute labor_cost and persist both.
  async function saveDailyWorker(phaseId: string, task: LineItem, dateKey: string, workers: number) {
    const next = { ...task.daily_workers };
    if (!workers || workers <= 0) delete next[dateKey];
    else next[dateKey] = Math.floor(workers);
    const role = laborRoles.find((r) => r.id === task.role_id);
    const labor_cost = computeLaborCost(role, next);
    await saveTask(phaseId, task.id, { daily_workers: next, labor_cost });
  }

  async function addTask(phase: Phase) {
    if (!activeEstimateId) return;
    const current = tasksByPhase[phase.id] ?? [];
    const defaultRole = laborRoles[0];
    const { data, error } = await supabase
      .from("estimate_line_items")
      .insert({
        section_id: phase.id,
        estimate_id: activeEstimateId,
        description: "",
        quantity: 1,
        role_id: defaultRole?.id ?? null,
        daily_workers: {},
        labor_cost: 0,
        material_cost: 0,
        equipment_cost: 0,
        order_index: current.length,
        show_to_client: true,
      })
      .select("id, section_id, estimate_id, description, role_id, daily_workers, labor_cost, material_cost, equipment_cost, order_index, show_to_client")
      .single();
    if (error || !data) {
      console.error("Failed to add task:", error);
      return;
    }
    const normalised: LineItem = { ...(data as LineItem), daily_workers: (data.daily_workers as DailyWorkers) ?? {} };
    setTasksByPhase((prev) => ({ ...prev, [phase.id]: [...current, normalised] }));
    setExpanded((prev) => ({ ...prev, [phase.id]: true }));
  }

  async function deleteTask(phaseId: string, taskId: string) {
    setTasksByPhase((prev) => ({
      ...prev,
      [phaseId]: (prev[phaseId] ?? []).filter((t) => t.id !== taskId),
    }));
    await supabase.from("estimate_line_items").delete().eq("id", taskId);
  }

  // Totals
  function phaseTotals(phaseId: string) {
    const tasks = tasksByPhase[phaseId] ?? [];
    let labor = 0, material = 0, equipment = 0;
    for (const t of tasks) {
      labor += Number(t.labor_cost) || 0;
      material += Number(t.material_cost) || 0;
      equipment += Number(t.equipment_cost) || 0;
    }
    return { labor, material, equipment, total: labor + material + equipment };
  }

  // Derive a phase's crew picture from its task day-cells.
  // peak = busiest single day, avg = mandays / days-with-work, mandays = sum.
  function phaseCrew(phaseId: string) {
    const tasks = tasksByPhase[phaseId] ?? [];
    const dayTotals: Record<string, number> = {};
    let mandays = 0;
    for (const t of tasks) {
      for (const [date, n] of Object.entries(t.daily_workers ?? {})) {
        const v = Number(n) || 0;
        dayTotals[date] = (dayTotals[date] ?? 0) + v;
        mandays += v;
      }
    }
    const dayValues = Object.values(dayTotals);
    const peak = dayValues.length > 0 ? Math.max(...dayValues) : 0;
    const distinctDays = dayValues.length;
    const avg = distinctDays > 0 ? Math.round((mandays / distinctDays) * 10) / 10 : 0;
    return { peak, avg, mandays, distinctDays, hasData: distinctDays > 0 };
  }

  function estimateTotal() {
    let labor = 0, material = 0, equipment = 0;
    for (const ph of phases) {
      const t = phaseTotals(ph.id);
      labor += t.labor; material += t.material; equipment += t.equipment;
    }
    return { labor, material, equipment, total: labor + material + equipment };
  }

  function openNew() {
    if (!activeEstimateId) return;
    setEditing({
      id: null,
      estimate_id: activeEstimateId,
      name: "",
      planned_start: format(new Date(), "yyyy-MM-dd"),
      planned_end: format(addDays(new Date(), 14), "yyyy-MM-dd"),
      progress: 0,
    });
  }

  function openEdit(phase: Phase) {
    setEditing({
      id: phase.id,
      estimate_id: phase.estimate_id,
      name: phase.name,
      planned_start: phase.planned_start ?? "",
      planned_end: phase.planned_end ?? "",
      progress: phase.progress,
    });
  }

  async function savePhase(form: EditingPhase) {
    const payload = {
      estimate_id: form.estimate_id,
      name: form.name.trim(),
      planned_start: form.planned_start || null,
      planned_end: form.planned_end || null,
      progress: form.progress,
      order_index: form.id ? undefined : phases.length,
    };

    if (form.id) {
      await supabase.from("estimate_sections").update(payload).eq("id", form.id);
    } else {
      await supabase.from("estimate_sections").insert(payload);
    }
    setEditing(null);
    if (activeProject) loadEstimateAndPhases(activeProject);
  }

  async function deletePhase() {
    if (!editing?.id) return;
    await supabase.from("estimate_sections").delete().eq("id", editing.id);
    setEditing(null);
    if (activeProject) loadEstimateAndPhases(activeProject);
  }

  // Optimistic date update from drag — rollback on failure
  async function commitPhaseDates(phaseId: string, plannedStart: string, plannedEnd: string) {
    const prev = phases;
    setPhases((p) =>
      p.map((ph) =>
        ph.id === phaseId ? { ...ph, planned_start: plannedStart, planned_end: plannedEnd } : ph
      )
    );
    const { error } = await supabase
      .from("estimate_sections")
      .update({ planned_start: plannedStart, planned_end: plannedEnd })
      .eq("id", phaseId);
    if (error) {
      console.error("Failed to update phase dates:", error);
      setPhases(prev); // rollback
    }
  }

  // Build week headers
  const weeks: { label: string; days: Date[] }[] = [];
  let cursor = viewStart;
  for (let w = 0; w < WEEKS_VISIBLE; w++) {
    const days = Array.from({ length: 7 }, (_, d) => addDays(cursor, d));
    weeks.push({ label: format(cursor, "MMM d"), days });
    cursor = addWeeks(cursor, 1);
  }

  const activeProj = projects.find((p) => p.id === activeProject);
  const today = new Date();
  const todayOff = clamp(differenceInDays(today, viewStart), 0, totalDays);

  return (
    <div className="flex flex-col h-full bg-[#18191b] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-4 px-5 py-3.5 border-b border-[#2b2e33] flex-shrink-0">
        <div className="flex items-center gap-2">
          <GanttChartSquare className="h-4 w-4 text-[#F5A623]" />
          <span className="text-[13px] font-semibold text-[#d0d0d0]">Gantt</span>
        </div>

        {/* Project tabs */}
        <div className="flex items-center gap-1 ml-4 overflow-x-auto">
          {projects.map((p) => (
            <button
              key={p.id}
              onClick={() => setActiveProject(p.id)}
              className={cn(
                "px-3 py-1 rounded text-[12px] font-medium transition-colors whitespace-nowrap",
                activeProject === p.id
                  ? "bg-[#292c31] text-[#d0d0d0] border border-[#3a3d42]"
                  : "text-[#444] hover:text-[#777]"
              )}
            >
              <span
                className={cn("inline-block h-1.5 w-1.5 rounded-full mr-1.5 mb-px", STATUS_COLOR[p.status] ? "" : "bg-[#333]")}
                style={{ background: STATUS_COLOR[p.status] ?? "#333" }}
              />
              {p.name}
            </button>
          ))}
          {projects.length === 0 && !loading && (
            <span className="text-[12px] text-[#333]">No active jobs — add one in Jobs</span>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Week navigation */}
          <button
            onClick={() => setViewStart((v) => subWeeks(v, 4))}
            className="p-1.5 text-[#333] hover:text-[#666] transition-colors"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="text-[11px] font-mono text-[#444] min-w-[120px] text-center">
            {format(viewStart, "MMM d")} – {format(viewEnd, "MMM d, yyyy")}
          </span>
          <button
            onClick={() => setViewStart((v) => addWeeks(v, 4))}
            className="p-1.5 text-[#333] hover:text-[#666] transition-colors"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setViewStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
            className="px-2 py-1 text-[11px] font-mono text-[#444] hover:text-[#888] border border-[#2b2e33] rounded transition-colors"
          >
            Today
          </button>

          {activeEstimateId && (() => {
            const t = estimateTotal();
            return (
              <>
                <div
                  className="flex items-center gap-2 px-2.5 py-1.5 text-[11px] font-mono border border-[#2b2e33] rounded ml-2"
                  title={`Labor $${t.labor.toLocaleString()} · Material $${t.material.toLocaleString()} · Equipment $${t.equipment.toLocaleString()}`}
                >
                  <span className="text-[#444] uppercase tracking-wider text-[9px]">Total</span>
                  <span className="text-[#F5A623] font-semibold tabular-nums">
                    ${t.total.toLocaleString()}
                  </span>
                </div>
                <button
                  onClick={() => setRatesOpen(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-mono text-[#666] border border-[#2b2e33] rounded hover:text-[#aaa] hover:border-[#3a3d42] transition-colors"
                  title="Edit labor rate card for this estimate"
                >
                  <DollarSign className="h-3 w-3" />
                  {laborRoles.length > 0 ? (
                    <span>
                      {laborRoles.slice(0, 2).map((r) => `${r.name.split(/\s/)[0]} $${r.daily_rate}`).join(" · ")}
                      {laborRoles.length > 2 && ` · +${laborRoles.length - 2}`}
                    </span>
                  ) : (
                    <span>Rates</span>
                  )}
                </button>
              </>
            );
          })()}

          {activeProject && (
            <button
              onClick={openNew}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium bg-[#F5A623] text-[#18191b] rounded hover:bg-[#f5a623cc] transition-colors ml-2"
            >
              <Plus className="h-3.5 w-3.5" />
              Phase
            </button>
          )}
        </div>
      </div>

      {/* Gantt body */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-[12px] font-mono text-[#333]">Loading...</div>
          </div>
        ) : !activeProject ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <GanttChartSquare className="h-8 w-8 text-[#222]" />
            <p className="text-[13px] text-[#333]">No active jobs to display</p>
          </div>
        ) : (
          <div className="relative">
            {/* Sticky header row */}
            <div
              className="sticky top-0 z-10 flex bg-[#18191b] border-b border-[#2b2e33]"
              style={{ minWidth: LABEL_W + totalDays * COL_W }}
            >
              {/* Phase label column */}
              <div
                className="flex-shrink-0 border-r border-[#2b2e33] flex items-end pb-2 px-4"
                style={{ width: LABEL_W }}
              >
                <span className="text-[10px] font-mono text-[#333] uppercase tracking-widest">Phase</span>
              </div>
              {/* Week/day headers */}
              <div className="relative" style={{ width: totalDays * COL_W }}>
                {/* Week labels */}
                <div className="flex h-7 border-b border-[#2b2e33]">
                  {weeks.map((w, i) => (
                    <div
                      key={i}
                      className="border-r border-[#2b2e33] flex items-center px-2"
                      style={{ width: 7 * COL_W }}
                    >
                      <span className="text-[10px] font-mono text-[#444]">{w.label}</span>
                    </div>
                  ))}
                </div>
                {/* Day labels */}
                <div className="flex h-6">
                  {weeks.flatMap((w) => w.days).map((day, i) => {
                    const isToday = format(day, "yyyy-MM-dd") === format(today, "yyyy-MM-dd");
                    const isWeekend = [0, 6].includes(day.getDay());
                    return (
                      <div
                        key={i}
                        className={cn(
                          "flex items-center justify-center border-r border-[#23252a]",
                          isToday ? "bg-[#F5A623]/10" : isWeekend ? "bg-[#0e0e0e]" : ""
                        )}
                        style={{ width: COL_W }}
                      >
                        <span className={cn(
                          "text-[9px] font-mono",
                          isToday ? "text-[#F5A623]" : isWeekend ? "text-[#3a3d42]" : "text-[#3a3d42]"
                        )}>
                          {format(day, "d")}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Phase rows */}
            {phases.length === 0 ? (
              <div
                className="flex items-center justify-center py-16"
                style={{ minWidth: LABEL_W + totalDays * COL_W }}
              >
                <div className="text-center">
                  <p className="text-[13px] text-[#333]">No phases yet</p>
                  <button
                    onClick={openNew}
                    className="mt-3 flex items-center gap-1.5 mx-auto text-[12px] text-[#F5A623] hover:text-[#f5a623cc] transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add first phase
                  </button>
                </div>
              </div>
            ) : (
              phases.map((phase) => {
                const isOpen = !!expanded[phase.id];
                const tasks = tasksByPhase[phase.id] ?? [];
                const t = phaseTotals(phase.id);
                return (
                  <Fragment key={phase.id}>
                    {/* ── Phase row ── */}
                    <div
                      className="flex border-b border-[#23252a] hover:bg-[#1b1c1e] transition-colors"
                      style={{ height: ROW_H, minWidth: LABEL_W + totalDays * COL_W }}
                    >
                      <div
                        className="flex-shrink-0 flex items-center gap-1.5 pl-1 pr-3 border-r border-[#2b2e33] group"
                        style={{ width: LABEL_W }}
                      >
                        <button
                          onClick={() => toggleExpand(phase.id)}
                          className="flex-shrink-0 p-1 text-[#444] hover:text-[#aaa] transition-colors"
                          title={isOpen ? "Collapse tasks" : "Expand tasks"}
                        >
                          {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRightSmall className="h-3 w-3" />}
                        </button>
                        <button
                          onClick={() => toggleExpand(phase.id)}
                          className="text-[13px] text-[#777] hover:text-[#b8b8b8] truncate flex-1 text-left transition-colors min-w-0"
                        >
                          {phase.name}
                        </button>
                        {t.total > 0 && (
                          <span
                            className="text-[10px] font-mono text-[#666] tabular-nums flex-shrink-0"
                            title={`Labor $${t.labor.toLocaleString()} · Material $${t.material.toLocaleString()} · Equipment $${t.equipment.toLocaleString()}`}
                          >
                            ${t.total.toLocaleString()}
                          </span>
                        )}
                        <button
                          onClick={() => addTask(phase)}
                          className="opacity-0 group-hover:opacity-100 text-[#333] hover:text-[#F5A623] transition-all flex-shrink-0"
                          title="Add task"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => openEdit(phase)}
                          className="opacity-0 group-hover:opacity-100 text-[#333] hover:text-[#666] transition-all flex-shrink-0"
                          title="Edit phase"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      </div>

                      <div className="relative flex-1" style={{ width: totalDays * COL_W }}>
                        {weeks.flatMap((w) => w.days).map((day, i) => {
                          const isToday = format(day, "yyyy-MM-dd") === format(today, "yyyy-MM-dd");
                          const isWeekend = [0, 6].includes(day.getDay());
                          return (isToday || isWeekend) ? (
                            <div
                              key={i}
                              className={cn(
                                "absolute inset-y-0",
                                isToday ? "bg-[#F5A623]/5 border-l border-[#F5A623]/20" : "bg-[#1b1c1e]"
                              )}
                              style={{ left: i * COL_W, width: COL_W }}
                            />
                          ) : null;
                        })}
                        <PhaseBar
                          phase={phase}
                          viewStart={viewStart}
                          totalDays={totalDays}
                          onClick={() => openEdit(phase)}
                          onCommitDates={commitPhaseDates}
                          crewSummary={phaseCrew(phase.id)}
                        />
                      </div>
                    </div>

                    {/* ── Task column header (one per expanded phase) ── */}
                    {isOpen && tasks.length > 0 && (
                      <div
                        className="flex border-b border-[#1f2125] bg-[#0e0f11]"
                        style={{ height: HEAD_H, minWidth: LABEL_W + totalDays * COL_W }}
                      >
                        <div
                          className="flex-shrink-0 flex items-center pl-7 pr-3 border-r border-[#1f2125] text-[8px] font-mono uppercase tracking-[0.18em] text-[#4a4d52]"
                          style={{ width: LABEL_W }}
                        >
                          <div
                            className="grid items-center gap-2 w-full"
                            style={{ gridTemplateColumns: "1fr 72px 56px 75px 75px" }}
                          >
                            <span>Task</span>
                            <span>Role</span>
                            <span className="text-right">Labor</span>
                            <span className="text-right">Material</span>
                            <span className="text-right">Equip</span>
                          </div>
                        </div>
                        <div
                          className="flex-1 flex items-center px-3 text-[8px] font-mono uppercase tracking-[0.18em] text-[#3a3d42]"
                          style={{ width: totalDays * COL_W }}
                        >
                          workers per day → click any cell to enter
                        </div>
                      </div>
                    )}

                    {/* ── Task rows (when expanded) ── */}
                    {isOpen && tasks.map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        roles={laborRoles}
                        viewStart={viewStart}
                        totalDays={totalDays}
                        weeks={weeks}
                        today={today}
                        onPatchLocal={(patch) => patchTaskLocal(phase.id, task.id, patch)}
                        onSave={(patch) => saveTask(phase.id, task.id, patch)}
                        onDelete={() => deleteTask(phase.id, task.id)}
                        onSetDailyWorker={(dateKey, workers) =>
                          saveDailyWorker(phase.id, task, dateKey, workers)
                        }
                      />
                    ))}

                    {/* ── Add-task footer (when expanded) ── */}
                    {isOpen && (
                      <div
                        className="flex border-b border-[#23252a]"
                        style={{ height: 28, minWidth: LABEL_W + totalDays * COL_W }}
                      >
                        <div
                          className="flex-shrink-0 flex items-center pl-7 pr-3 border-r border-[#1f2125]"
                          style={{ width: LABEL_W }}
                        >
                          <button
                            onClick={() => addTask(phase)}
                            className="flex items-center gap-1 text-[10px] font-mono text-[#F5A623]/70 hover:text-[#F5A623] transition-colors"
                          >
                            <Plus className="h-2.5 w-2.5" /> add task
                          </button>
                        </div>
                        <div className="flex-1" style={{ width: totalDays * COL_W }} />
                      </div>
                    )}
                  </Fragment>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Edit / Add panel */}
      {editing && (
        <EditPanel
          phase={editing}
          onSave={savePhase}
          onDelete={deletePhase}
          onClose={() => setEditing(null)}
        />
      )}

      {ratesOpen && (
        <RateCardEditor
          roles={laborRoles}
          onSave={(next) => {
            saveLaborRoles(next);
            setRatesOpen(false);
          }}
          onClose={() => setRatesOpen(false)}
        />
      )}

      <PhasePanel
        phase={panelPhase}
        onClose={() => setPanelPhase(null)}
        onProgressUpdate={(phaseId, progress) => {
          setPhases(prev => prev.map(p => p.id === phaseId ? { ...p, progress } : p));
        }}
      />
    </div>
  );
}

// ─── Task Row ────────────────────────────────────────────────────────────────
// One row per line item. Label area = name + role + labor + material + equip.
// Chart area = one editable DailyCell per day. Cells drive labor cost.

function TaskRow({
  task,
  roles,
  viewStart,
  totalDays,
  weeks,
  today,
  onPatchLocal,
  onSave,
  onDelete,
  onSetDailyWorker,
}: {
  task: LineItem;
  roles: LaborRole[];
  viewStart: Date;
  totalDays: number;
  weeks: { label: string; days: Date[] }[];
  today: Date;
  onPatchLocal: (patch: Partial<LineItem>) => void;
  onSave: (patch: Partial<LineItem>) => void;
  onDelete: () => void;
  onSetDailyWorker: (dateKey: string, workers: number) => void;
}) {
  const role = roles.find((r) => r.id === task.role_id);
  const mandays = sumDailyWorkers(task.daily_workers);
  const liveLabor = role ? role.daily_rate * mandays : 0;

  function commitRole(roleId: string | null) {
    const newRole = roles.find((r) => r.id === roleId);
    const labor_cost = computeLaborCost(newRole, task.daily_workers);
    onSave({ role_id: roleId, labor_cost });
  }

  return (
    <div
      className="flex border-b border-[#1b1c1e] bg-[#121315] hover:bg-[#15171a] transition-colors group relative"
      style={{ height: TASK_H, minWidth: LABEL_W + totalDays * COL_W }}
    >
      {/* Soft left rail tying this task to its phase */}
      <div className="absolute left-4 top-0 bottom-0 w-px bg-[#23252a]" />

      {/* Label area — single line, 5-column grid */}
      <div
        className="flex-shrink-0 pl-7 pr-2 border-r border-[#1f2125] flex items-center relative"
        style={{ width: LABEL_W }}
      >
        <div
          className="grid items-center gap-2 w-full"
          style={{ gridTemplateColumns: "1fr 72px 56px 75px 75px" }}
        >
          {/* Name */}
          <input
            value={task.description}
            onChange={(e) => onPatchLocal({ description: e.target.value })}
            onBlur={(e) => onSave({ description: e.target.value })}
            placeholder="Task name…"
            className="min-w-0 bg-transparent text-[12px] text-[#cfcfcf] placeholder:text-[#3a3d42] focus:outline-none focus:text-[#ededed] tracking-tight pr-1"
          />

          {/* Role */}
          <select
            value={task.role_id ?? ""}
            onChange={(e) => commitRole(e.target.value || null)}
            className={cn(
              "bg-[#0f1011] border border-[#23252a] rounded-md py-1 pl-2 pr-1 text-[10px] font-mono truncate transition-colors focus:outline-none focus:border-[#3a3d42] cursor-pointer h-7",
              task.role_id ? "text-[#d4d4d4]" : "text-[#777]"
            )}
            title={role ? `${role.name} @ $${role.daily_rate}/day` : "Pick a labor role"}
          >
            <option value="">—</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>

          {/* Labor (auto, computed from daily cells) */}
          <span
            className="text-[11px] font-mono font-semibold tabular-nums text-right pr-1"
            style={{ color: liveLabor > 0 ? "var(--primary)" : "var(--muted-foreground)" }}
            title={role ? `${role.name} × ${mandays} mandays = $${Math.round(liveLabor)}` : "Pick a role, then fill day cells"}
          >
            ${Math.round(liveLabor) || 0}
          </span>

          {/* Material */}
          <MoneyCell
            value={task.material_cost}
            title="Material $"
            onLocal={(v) => onPatchLocal({ material_cost: v })}
            onSave={(v) => onSave({ material_cost: v })}
          />

          {/* Equipment */}
          <MoneyCell
            value={task.equipment_cost}
            title="Equipment $"
            onLocal={(v) => onPatchLocal({ equipment_cost: v })}
            onSave={(v) => onSave({ equipment_cost: v })}
          />
        </div>

        {/* Delete button: positioned on the far left, always slightly visible (low opacity) and highlighting on hover */}
        <button
          onClick={onDelete}
          className="absolute left-1 top-1/2 -translate-y-1/2 w-[18px] h-[18px] flex items-center justify-center rounded-md bg-background border border-border/20 text-muted-foreground/50 hover:text-red-500 hover:border-red-500/30 hover:bg-red-500/10 transition-all z-10 shadow-sm"
          title="Delete task"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      </div>

      {/* Chart area — weekend shading + daily cells */}
      <div className="relative flex-1" style={{ width: totalDays * COL_W }}>
        {/* Weekend / today background */}
        {weeks.flatMap((w) => w.days).map((day, i) => {
          const isToday = format(day, "yyyy-MM-dd") === format(today, "yyyy-MM-dd");
          const isWeekend = [0, 6].includes(day.getDay());
          return (isToday || isWeekend) ? (
            <div
              key={`bg-${i}`}
              className={cn(
                "absolute inset-y-0 pointer-events-none",
                isToday ? "bg-[#F5A623]/5 border-l border-[#F5A623]/20" : "bg-[#161718]"
              )}
              style={{ left: i * COL_W, width: COL_W }}
            />
          ) : null;
        })}

        {/* Daily cells (editable worker counts) */}
        {weeks.flatMap((w) => w.days).map((day, i) => {
          const dateKey = format(day, "yyyy-MM-dd");
          const workers = task.daily_workers?.[dateKey] || 0;
          return (
            <DailyCell
              key={`cell-${i}`}
              dateKey={dateKey}
              left={i * COL_W}
              workers={workers}
              onCommit={(n) => onSetDailyWorker(dateKey, n)}
            />
          );
        })}
      </div>
    </div>
  );
}

// ─── Money cell (material / equipment input) ─────────────────────────────────

function MoneyCell({
  value,
  title,
  onLocal,
  onSave,
}: {
  value: number;
  title: string;
  onLocal: (v: number) => void;
  onSave: (v: number) => void;
}) {
  const hasValue = (value ?? 0) > 0;
  return (
    <div className="relative w-full" title={title}>
      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] pointer-events-none font-mono text-[#3a3d42]">
        $
      </span>
      <input
        type="number"
        min={0}
        value={value || ""}
        onChange={(e) => onLocal(Number(e.target.value) || 0)}
        onBlur={(e) => onSave(Number(e.target.value) || 0)}
        placeholder="0"
        className="w-full bg-[#0f1011] border border-[#23252a] rounded-md pl-5 pr-1.5 py-1 h-7 text-[11px] font-mono tabular-nums text-right focus:outline-none focus:border-[#3a3d42] transition-colors"
        style={{ color: hasValue ? "var(--foreground)" : "var(--muted-foreground)" }}
      />
    </div>
  );
}

// ─── Daily Cell ──────────────────────────────────────────────────────────────
// Excel-style worker count per day. Click to edit. Amber heatmap.

function DailyCell({
  dateKey,
  left,
  workers,
  onCommit,
}: {
  dateKey: string;
  left: number;
  workers: number;
  onCommit: (workers: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  function openEdit() {
    setDraft(workers > 0 ? String(workers) : "");
    setEditing(true);
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  }

  function commit() {
    const n = Math.max(0, Math.floor(Number(draft) || 0));
    setEditing(false);
    if (n !== workers) onCommit(n);
  }

  function cancel() {
    setEditing(false);
    setDraft("");
  }

  const style = heatmapStyle(workers);

  return (
    <div
      className="absolute top-0 bottom-0 flex items-center justify-center"
      style={{ left, width: COL_W }}
    >
      {editing ? (
        <input
          ref={inputRef}
          type="number"
          min={0}
          max={99}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            else if (e.key === "Escape") cancel();
          }}
          className="h-7 w-9 rounded text-center text-[12px] font-mono font-semibold tabular-nums bg-[#0f1011] border border-[#F5A623] text-[#ededed] focus:outline-none"
          aria-label={`Workers on ${dateKey}`}
        />
      ) : (
        <button
          onClick={openEdit}
          className="h-7 w-9 rounded flex items-center justify-center text-[12px] font-mono font-semibold tabular-nums transition-all hover:ring-1 hover:ring-[#F5A623]/40 hover:bg-[#F5A623]/[0.04]"
          style={style}
          aria-label={`Workers on ${dateKey}: ${workers || "none"}`}
        >
          {workers > 0 ? workers : <span className="text-[#2b2e33]">·</span>}
        </button>
      )}
    </div>
  );
}

// ─── Rate Card Editor ────────────────────────────────────────────────────────

function RateCardEditor({
  roles,
  onSave,
  onClose,
}: {
  roles: LaborRole[];
  onSave: (roles: LaborRole[]) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<LaborRole[]>(() =>
    roles.length > 0 ? roles : [{ id: `role_${Date.now()}`, name: "", daily_rate: 0 }]
  );

  function update(idx: number, patch: Partial<LaborRole>) {
    setDraft((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }
  function addRole() {
    setDraft((prev) => [
      ...prev,
      { id: `role_${Date.now()}_${prev.length}`, name: "", daily_rate: 0 },
    ]);
  }
  function removeRole(idx: number) {
    setDraft((prev) => prev.filter((_, i) => i !== idx));
  }
  function handleSave() {
    const cleaned = draft
      .map((r) => ({ ...r, name: r.name.trim(), daily_rate: Number(r.daily_rate) || 0 }))
      .filter((r) => r.name.length > 0);
    onSave(cleaned);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-[#202224] border border-[#222] rounded-lg w-[480px] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2b2e33]">
          <div>
            <span className="text-[13px] font-semibold text-[#d0d0d0]">Labor rate card</span>
            <p className="text-[10px] font-mono text-[#555] mt-0.5">
              SELL rates for this estimate · not synced from workers
            </p>
          </div>
          <button onClick={onClose} className="text-[#333] hover:text-[#666]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-2.5 max-h-[60vh] overflow-y-auto">
          <div className="grid grid-cols-[1fr_120px_28px] gap-2 px-1 pb-1">
            <span className="text-[9px] font-mono text-[#444] uppercase tracking-widest">Role name</span>
            <span className="text-[9px] font-mono text-[#444] uppercase tracking-widest">$ / day</span>
            <span />
          </div>

          {draft.map((r, i) => (
            <div key={r.id} className="grid grid-cols-[1fr_120px_28px] gap-2 items-center">
              <input
                value={r.name}
                onChange={(e) => update(i, { name: e.target.value })}
                placeholder="e.g. Foreman, Skilled, General"
                className="bg-[#18191b] border border-[#222] rounded px-2.5 py-1.5 text-[13px] text-[#d0d0d0] focus:outline-none focus:border-[#F5A623] transition-colors"
              />
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] font-mono text-[#555]">$</span>
                <input
                  type="number"
                  min={0}
                  step={5}
                  value={r.daily_rate || ""}
                  onChange={(e) => update(i, { daily_rate: Number(e.target.value) })}
                  placeholder="0"
                  className="w-full bg-[#18191b] border border-[#222] rounded pl-6 pr-2.5 py-1.5 text-[13px] text-[#d0d0d0] focus:outline-none focus:border-[#F5A623] transition-colors text-right font-mono"
                />
              </div>
              <button
                onClick={() => removeRole(i)}
                className="p-1.5 text-[#333] hover:text-[#EF4444] transition-colors"
                title="Remove role"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}

          <button
            onClick={addRole}
            className="flex items-center gap-1.5 text-[11px] font-mono text-[#F5A623] hover:text-[#f5b955] transition-colors mt-2 pt-2 border-t border-[#2b2e33] w-full justify-center py-2"
          >
            <Plus className="h-3 w-3" /> Add role
          </button>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#2b2e33]">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-[12px] text-[#555] hover:text-[#888] border border-[#222] rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-3 py-1.5 text-[12px] font-medium bg-[#F5A623] text-[#18191b] rounded hover:bg-[#f5a623cc] transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
