"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { X, Plus, Calendar, Check } from "lucide-react";
import { format, parseISO } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Phase {
  id: string;
  name: string;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  progress: number;
  notes: string | null;
}

interface Task {
  id: string;
  section_id: string;
  name: string;
  completed: boolean;
  order_index: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(d: string | null) {
  if (!d) return "—";
  try { return format(parseISO(d), "MMM d"); } catch { return d; }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function PhasePanel({
  phase,
  onClose,
  onProgressUpdate,
}: {
  phase: Phase | null;
  onClose: () => void;
  onProgressUpdate: (phaseId: string, progress: number) => void;
}) {
  const supabase = createClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTask, setNewTask] = useState("");
  const [adding, setAdding] = useState(false);
  const [localProgress, setLocalProgress] = useState(0);

  const open = !!phase;

  useEffect(() => {
    if (phase) {
      setLocalProgress(phase.progress);
      loadTasks(phase.id);
      setTimeout(() => inputRef.current?.focus(), 300);
    } else {
      setTasks([]);
      setNewTask("");
    }
  }, [phase?.id]);

  async function loadTasks(phaseId: string) {
    const { data } = await supabase
      .from("section_tasks")
      .select("*")
      .eq("section_id", phaseId)
      .order("order_index");
    setTasks(data ?? []);
  }

  // Auto-sync progress + actual dates when tasks change
  useEffect(() => {
    if (!phase || tasks.length === 0) return;
    const pct = Math.round((tasks.filter(t => t.completed).length / tasks.length) * 100);
    if (pct === localProgress) return;

    setLocalProgress(pct);

    const today = format(new Date(), "yyyy-MM-dd");
    const payload: { progress: number; actual_start?: string; actual_end?: string } = { progress: pct };

    // Stamp actual_start on first task completion (don't overwrite manual entry)
    if (pct > 0 && !phase.actual_start) payload.actual_start = today;
    // Stamp actual_end when fully complete (don't overwrite manual entry)
    if (pct === 100 && !phase.actual_end) payload.actual_end = today;

    supabase.from("estimate_sections").update(payload).eq("id", phase.id);
    onProgressUpdate(phase.id, pct);
  }, [tasks]);

  async function toggleTask(task: Task) {
    const next = !task.completed;
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, completed: next } : t));
    await supabase.from("section_tasks").update({ completed: next }).eq("id", task.id);
  }

  async function addTask() {
    const name = newTask.trim();
    if (!name || !phase) return;
    setAdding(true);
    const { data } = await supabase
      .from("section_tasks")
      .insert({ section_id: phase.id, name, order_index: tasks.length })
      .select()
      .single();
    if (data) setTasks(prev => [...prev, data]);
    setNewTask("");
    setAdding(false);
  }

  async function deleteTask(id: string) {
    setTasks(prev => prev.filter(t => t.id !== id));
    await supabase.from("section_tasks").delete().eq("id", id);
  }

  const completedCount = tasks.filter(t => t.completed).length;
  const totalCount = tasks.length;

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-30 transition-opacity duration-200",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        style={{ background: "rgba(0,0,0,0.4)" }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={cn(
          "fixed right-0 top-0 h-full z-40 flex flex-col",
          "bg-[#0f0f0f] border-l border-[#242424]",
          "transition-transform duration-200 ease-out"
        )}
        style={{
          width: 360,
          transform: open ? "translateX(0)" : "translateX(100%)",
        }}
      >
        {phase && (
          <>
            {/* Header */}
            <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-[#1e1e1e] flex-shrink-0">
              <div className="flex-1 min-w-0 pr-4">
                <p className="text-[10px] font-mono text-[#555] uppercase tracking-[0.18em] mb-1.5">
                  Phase
                </p>
                <h2 className="text-[15px] font-semibold text-[#ededed] leading-snug">
                  {phase.name}
                </h2>
              </div>
              <button
                onClick={onClose}
                className="text-[#444] hover:text-[#888] transition-colors mt-0.5 flex-shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Meta */}
            <div className="px-5 py-4 border-b border-[#1e1e1e] space-y-3 flex-shrink-0">
              {/* Dates */}
              <div className="flex items-center gap-1.5 text-[12px] text-[#666]">
                <Calendar className="h-3.5 w-3.5 text-[#444]" />
                <span>{fmt(phase.planned_start)} — {fmt(phase.planned_end)}</span>
              </div>

              {/* Progress */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-mono text-[#444] uppercase tracking-wider">
                    Progress
                  </span>
                  <span className="text-[12px] font-mono text-[#F5A623]">
                    {localProgress}%
                  </span>
                </div>
                <div className="h-[3px] bg-[#1e1e1e] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${localProgress}%`,
                      background: localProgress === 100
                        ? "#22C55E"
                        : "linear-gradient(90deg, #F5A623, #f5c842)",
                    }}
                  />
                </div>
                {totalCount > 0 && (
                  <p className="text-[10px] text-[#333] font-mono mt-1">
                    {completedCount}/{totalCount} tasks complete
                  </p>
                )}
              </div>

              {/* Notes */}
              {phase.notes && (
                <p className="text-[11px] text-[#555] leading-relaxed border-l-2 border-[#2a2a2a] pl-2.5">
                  {phase.notes}
                </p>
              )}
            </div>

            {/* Tasks */}
            <div className="flex-1 overflow-y-auto">
              <div className="px-5 pt-4 pb-2">
                <p className="text-[10px] font-mono text-[#444] uppercase tracking-widest">
                  Tasks
                </p>
              </div>

              {/* Task list */}
              <ul className="px-5 space-y-px">
                {tasks.length === 0 ? (
                  <li className="py-3 text-[12px] text-[#333]">
                    No tasks yet — add one below
                  </li>
                ) : (
                  tasks.map((task, idx) => (
                    <li
                      key={task.id}
                      className="flex items-center gap-3 py-2 group"
                    >
                      {/* Custom checkbox */}
                      <button
                        onClick={() => toggleTask(task)}
                        className={cn(
                          "flex-shrink-0 h-4 w-4 rounded border transition-all duration-150 flex items-center justify-center",
                          task.completed
                            ? "bg-[#F5A623] border-[#F5A623]"
                            : "border-[#333] hover:border-[#666] bg-transparent"
                        )}
                      >
                        {task.completed && (
                          <Check className="h-2.5 w-2.5 text-[#0a0a0a]" strokeWidth={3} />
                        )}
                      </button>

                      {/* Task name */}
                      <span
                        className={cn(
                          "flex-1 text-[13px] transition-colors duration-150",
                          task.completed
                            ? "text-[#3a3a3a] line-through"
                            : "text-[#bbb]"
                        )}
                      >
                        {task.name}
                      </span>

                      {/* Index + delete */}
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-[10px] font-mono text-[#333]">
                          {String(idx + 1).padStart(2, "0")}
                        </span>
                        <button
                          onClick={() => deleteTask(task.id)}
                          className="text-[#2a2a2a] hover:text-[#EF4444] transition-colors text-[11px]"
                        >
                          ×
                        </button>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </div>

            {/* Add task input */}
            <div className="flex-shrink-0 border-t border-[#1e1e1e] px-5 py-3">
              <div className="flex items-center gap-2.5">
                <Plus className="h-3.5 w-3.5 text-[#444] flex-shrink-0" />
                <input
                  ref={inputRef}
                  value={newTask}
                  onChange={e => setNewTask(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") addTask();
                    if (e.key === "Escape") onClose();
                  }}
                  placeholder="Add a task..."
                  disabled={adding}
                  className="flex-1 bg-transparent text-[13px] text-[#c0c0c0] placeholder-[#333] focus:outline-none"
                />
                {newTask.trim() && (
                  <button
                    onClick={addTask}
                    className="text-[11px] font-mono text-[#F5A623] hover:text-[#f5a623cc] transition-colors"
                  >
                    add
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
