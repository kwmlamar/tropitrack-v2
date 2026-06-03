"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  GanttChartSquare,
  Pencil,
  X,
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
  crew_size: number | null;
  notes: string | null;
}

interface EditingPhase {
  id: string | null;
  estimate_id: string;
  name: string;
  planned_start: string;
  planned_end: string;
  progress: number;
  crew_size: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const WEEKS_VISIBLE = 12;
const COL_W = 40; // px per day column
const ROW_H = 36; // px per row
const LABEL_W = 220; // px for left label column

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
}: {
  phase: Phase;
  viewStart: Date;
  totalDays: number;
  onClick: () => void;
  onCommitDates: (phaseId: string, plannedStart: string, plannedEnd: string) => void;
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
        title={`${phase.name} · ${phase.progress}% complete · Drag to reschedule`}
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
              {phase.crew_size ? ` · ${phase.crew_size} crew` : ""}
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
          className="fixed z-50 pointer-events-none px-2.5 py-1.5 rounded bg-[#0a0a0a] border border-[#F5A623]/40 shadow-lg"
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

          <div className="grid grid-cols-2 gap-3">
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
            <div>
              <label className="block text-[11px] font-mono text-[#444] uppercase tracking-wider mb-1.5">
                Crew size
              </label>
              <input
                type="number"
                min={0}
                value={form.crew_size}
                onChange={(e) => set("crew_size", e.target.value)}
                className="w-full bg-[#18191b] border border-[#222] rounded px-3 py-2 text-[13px] text-[#d0d0d0] focus:outline-none focus:border-[#F5A623] transition-colors"
                placeholder="0"
              />
            </div>
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

  // Resolve the project's estimate (single-source), then load its sections as phases
  async function loadEstimateAndPhases(projectId: string) {
    const { data: est, error: estErr } = await supabase
      .from("estimates")
      .select("id")
      .eq("project_id", projectId)
      .maybeSingle();

    if (estErr) {
      console.error("estimates lookup error:", estErr);
      setActiveEstimateId(null);
      setPhases([]);
      return;
    }
    if (!est) {
      // Project somehow has no estimate — shouldn't happen after the auto-create trigger
      setActiveEstimateId(null);
      setPhases([]);
      return;
    }

    setActiveEstimateId(est.id);

    const { data, error } = await supabase
      .from("estimate_sections")
      .select("*")
      .eq("estimate_id", est.id)
      .order("order_index");
    if (error) console.error("estimate_sections error:", error);
    setPhases(data ?? []);
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
      crew_size: "",
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
      crew_size: phase.crew_size?.toString() ?? "",
    });
  }

  async function savePhase(form: EditingPhase) {
    const payload = {
      estimate_id: form.estimate_id,
      name: form.name.trim(),
      planned_start: form.planned_start || null,
      planned_end: form.planned_end || null,
      progress: form.progress,
      crew_size: form.crew_size ? Number(form.crew_size) : null,
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
              phases.map((phase, rowIdx) => (
                <div
                  key={phase.id}
                  className={cn(
                    "flex border-b border-[#23252a] hover:bg-[#1b1c1e] transition-colors",
                    rowIdx % 2 === 0 ? "" : ""
                  )}
                  style={{ height: ROW_H, minWidth: LABEL_W + totalDays * COL_W }}
                >
                  {/* Phase name */}
                  <div
                    className="flex-shrink-0 flex items-center gap-2 px-4 border-r border-[#2b2e33] group"
                    style={{ width: LABEL_W }}
                  >
                    <button
                      onClick={() => setPanelPhase(phase)}
                      className="text-[13px] text-[#777] hover:text-[#b8b8b8] truncate flex-1 text-left transition-colors"
                    >
                      {phase.name}
                    </button>
                    <button
                      onClick={() => openEdit(phase)}
                      className="opacity-0 group-hover:opacity-100 text-[#333] hover:text-[#666] transition-all flex-shrink-0"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  </div>

                  {/* Bar area */}
                  <div className="relative flex-1" style={{ width: totalDays * COL_W }}>
                    {/* Weekend shading + today line */}
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

                    {/* Phase bar */}
                    <PhaseBar
                      phase={phase}
                      viewStart={viewStart}
                      totalDays={totalDays}
                      onClick={() => openEdit(phase)}
                      onCommitDates={commitPhaseDates}
                    />
                  </div>
                </div>
              ))
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
