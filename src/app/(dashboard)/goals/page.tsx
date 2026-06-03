"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { Target, Plus, Check, X, Pencil, Circle } from "lucide-react";

interface Goal {
  id: string;
  title: string;
  description: string | null;
  status: "active" | "complete" | "paused";
  target_date: string | null;
  progress: number;
  notes: string | null;
  updated_at: string;
}

interface GoalForm {
  id: string | null;
  title: string;
  description: string;
  status: "active" | "complete" | "paused";
  target_date: string;
  progress: number;
  notes: string;
}

const STATUS_LABEL: Record<string, string> = {
  active:   "active",
  complete: "done",
  paused:   "paused",
};

const STATUS_COLOR: Record<string, string> = {
  active:   "text-[#22C55E] border-[#22C55E]/20 bg-[#22C55E]/5",
  complete: "text-[#555] border-[#222] bg-transparent",
  paused:   "text-[#F5A623] border-[#F5A623]/20 bg-[#F5A623]/5",
};

function blankForm(): GoalForm {
  return { id: null, title: "", description: "", status: "active", target_date: "", progress: 0, notes: "" };
}

export default function GoalsPage() {
  const { profile } = useAuth();
  const supabase = createClient();

  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<GoalForm | null>(null);
  const [filter, setFilter] = useState<"active" | "all">("active");

  useEffect(() => {
    if (!profile?.company_id) return;
    load();
  }, [profile?.company_id]);

  async function load() {
    setLoading(true);
    const q = supabase
      .from("business_goals")
      .select("*")
      .eq("company_id", profile!.company_id)
      .order("created_at", { ascending: false });
    const { data } = await q;
    setGoals(data ?? []);
    setLoading(false);
  }

  async function save(form: GoalForm) {
    const payload = {
      company_id: profile!.company_id,
      title: form.title.trim(),
      description: form.description.trim() || null,
      status: form.status,
      target_date: form.target_date || null,
      progress: form.progress,
      notes: form.notes.trim() || null,
    };
    if (form.id) {
      await supabase.from("business_goals").update(payload).eq("id", form.id);
    } else {
      await supabase.from("business_goals").insert(payload);
    }
    setEditing(null);
    load();
  }

  async function deleteGoal(id: string) {
    await supabase.from("business_goals").delete().eq("id", id);
    setEditing(null);
    load();
  }

  async function quickProgress(goal: Goal, delta: number) {
    const next = Math.max(0, Math.min(100, goal.progress + delta));
    await supabase.from("business_goals").update({ progress: next, status: next === 100 ? "complete" : goal.status }).eq("id", goal.id);
    load();
  }

  const displayed = filter === "active" ? goals.filter((g) => g.status === "active") : goals;

  return (
    <div className="flex flex-col h-full bg-[#18191b] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#2b2e33] flex-shrink-0">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-[#F5A623]" />
          <span className="text-[13px] font-semibold text-[#d0d0d0]">Goals</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex text-[11px] font-mono">
            <button
              onClick={() => setFilter("active")}
              className={cn("px-2.5 py-1 rounded-l border border-r-0 border-[#222] transition-colors", filter === "active" ? "bg-[#292c31] text-[#d0d0d0]" : "text-[#444] hover:text-[#666]")}
            >
              Active
            </button>
            <button
              onClick={() => setFilter("all")}
              className={cn("px-2.5 py-1 rounded-r border border-[#222] transition-colors", filter === "all" ? "bg-[#292c31] text-[#d0d0d0]" : "text-[#444] hover:text-[#666]")}
            >
              All
            </button>
          </div>
          <button
            onClick={() => setEditing(blankForm())}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium bg-[#F5A623] text-[#18191b] rounded hover:bg-[#f5a623cc] transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Goal
          </button>
        </div>
      </div>

      {/* Goals list */}
      <div className="flex-1 overflow-auto p-5">
        {loading ? (
          <div className="space-y-3">
            {Array(3).fill(0).map((_, i) => (
              <div key={i} className="h-20 rounded bg-[#202224] animate-pulse" />
            ))}
          </div>
        ) : displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <Target className="h-8 w-8 text-[#2b2e33]" />
            <p className="text-[13px] text-[#333]">
              {filter === "active" ? "No active goals" : "No goals yet"}
            </p>
            <button
              onClick={() => setEditing(blankForm())}
              className="flex items-center gap-1.5 text-[12px] text-[#F5A623] hover:text-[#f5a623cc] transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> Add first goal
            </button>
          </div>
        ) : (
          <div className="space-y-3 max-w-2xl">
            {displayed.map((goal) => (
              <div
                key={goal.id}
                className="rounded border border-[#2b2e33] bg-[#202224] p-4 group"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 mb-2">
                      <span className="text-[14px] font-medium text-[#c8c8c8]">{goal.title}</span>
                      <span className={cn("text-[10px] font-mono px-1.5 py-0.5 rounded border", STATUS_COLOR[goal.status])}>
                        {STATUS_LABEL[goal.status]}
                      </span>
                    </div>

                    {goal.description && (
                      <p className="text-[12px] text-[#555] mb-3">{goal.description}</p>
                    )}

                    {/* Progress bar */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => quickProgress(goal, -10)}
                            className="text-[10px] font-mono text-[#333] hover:text-[#666] transition-colors px-1"
                          >
                            −10
                          </button>
                          <button
                            onClick={() => quickProgress(goal, 10)}
                            className="text-[10px] font-mono text-[#333] hover:text-[#666] transition-colors px-1"
                          >
                            +10
                          </button>
                          <button
                            onClick={() => quickProgress(goal, 100 - goal.progress)}
                            className="text-[10px] font-mono text-[#333] hover:text-[#22C55E] transition-colors px-1"
                          >
                            Done
                          </button>
                        </div>
                        <span className="text-[12px] font-mono text-[#F5A623]">{goal.progress}%</span>
                      </div>
                      <div className="h-[3px] bg-[#292c31] rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all duration-500",
                            goal.progress === 100 ? "bg-[#22C55E]" : "bg-[#F5A623]"
                          )}
                          style={{ width: `${goal.progress}%` }}
                        />
                      </div>
                    </div>

                    {goal.target_date && (
                      <p className="text-[11px] text-[#333] mt-2 font-mono">
                        Target: {new Date(goal.target_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                    )}
                  </div>

                  <button
                    onClick={() => setEditing({
                      id: goal.id, title: goal.title,
                      description: goal.description ?? "",
                      status: goal.status, target_date: goal.target_date ?? "",
                      progress: goal.progress, notes: goal.notes ?? "",
                    })}
                    className="opacity-0 group-hover:opacity-100 text-[#333] hover:text-[#666] transition-all mt-0.5"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#202224] border border-[#222] rounded-lg w-[440px] shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#2b2e33]">
              <span className="text-[13px] font-semibold text-[#d0d0d0]">
                {editing.id ? "Edit goal" : "New goal"}
              </span>
              <button onClick={() => setEditing(null)} className="text-[#333] hover:text-[#666]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-[11px] font-mono text-[#444] uppercase tracking-wider mb-1.5">Title</label>
                <input
                  value={editing.title}
                  onChange={(e) => setEditing((f) => f && ({ ...f, title: e.target.value }))}
                  className="w-full bg-[#18191b] border border-[#222] rounded px-3 py-2 text-[13px] text-[#d0d0d0] focus:outline-none focus:border-[#F5A623] transition-colors"
                  placeholder="e.g. Open the laundromat, Sundays off..."
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono text-[#444] uppercase tracking-wider mb-1.5">Description</label>
                <textarea
                  value={editing.description}
                  onChange={(e) => setEditing((f) => f && ({ ...f, description: e.target.value }))}
                  rows={2}
                  className="w-full bg-[#18191b] border border-[#222] rounded px-3 py-2 text-[13px] text-[#d0d0d0] focus:outline-none focus:border-[#F5A623] transition-colors resize-none"
                  placeholder="What does success look like?"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-mono text-[#444] uppercase tracking-wider mb-1.5">Status</label>
                  <select
                    value={editing.status}
                    onChange={(e) => setEditing((f) => f && ({ ...f, status: e.target.value as Goal["status"] }))}
                    className="w-full bg-[#18191b] border border-[#222] rounded px-3 py-2 text-[13px] text-[#d0d0d0] focus:outline-none focus:border-[#F5A623] transition-colors"
                  >
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="complete">Complete</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-mono text-[#444] uppercase tracking-wider mb-1.5">Target date</label>
                  <input
                    type="date"
                    value={editing.target_date}
                    onChange={(e) => setEditing((f) => f && ({ ...f, target_date: e.target.value }))}
                    className="w-full bg-[#18191b] border border-[#222] rounded px-3 py-2 text-[13px] text-[#d0d0d0] focus:outline-none focus:border-[#F5A623] transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-mono text-[#444] uppercase tracking-wider mb-1.5">
                  Progress — {editing.progress}%
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={editing.progress}
                  onChange={(e) => setEditing((f) => f && ({ ...f, progress: Number(e.target.value) }))}
                  className="w-full accent-[#F5A623]"
                />
              </div>
            </div>

            <div className="flex items-center justify-between px-5 py-4 border-t border-[#2b2e33]">
              {editing.id ? (
                <button
                  onClick={() => editing.id && deleteGoal(editing.id)}
                  className="text-[12px] text-[#EF4444]/60 hover:text-[#EF4444] transition-colors"
                >
                  Delete
                </button>
              ) : <div />}
              <div className="flex gap-2">
                <button
                  onClick={() => setEditing(null)}
                  className="px-3 py-1.5 text-[12px] text-[#555] hover:text-[#888] border border-[#222] rounded transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => editing && save(editing)}
                  disabled={!editing.title.trim()}
                  className="px-3 py-1.5 text-[12px] font-medium bg-[#F5A623] text-[#18191b] rounded hover:bg-[#f5a623cc] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
