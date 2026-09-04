"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { ArrowUp, Square, X, Plus, Share2, Trash2, PanelLeftClose, PanelLeftOpen, MessageSquare } from "lucide-react";
import { format, isToday, isYesterday, isThisWeek } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  skill_id?: string;
}

interface PendingWrite {
  id: string;
  tool_name: string;
  tier: "confirm" | "double-confirm";
  summary: string;
  expires_at: string;
}

interface Thread {
  id: string;
  user_id: string;
  company_id: string;
  skill_id: string | null;
  title: string;
  is_shared: boolean;
  created_at: string;
  updated_at: string;
}

interface Skill {
  id: string;
  label: string;
  tag: string;
  description: string;
  placeholder: string;
  /** Theme token name (brand | info | success | warning | destructive),
   *  resolved as hsl(var(--<color>)) so the accent tracks light/dark. */
  color: "brand" | "info" | "success" | "warning" | "destructive";
}

// ─── Skills ───────────────────────────────────────────────────────────────────

const SKILLS: Skill[] = [
  {
    id: "estimate",
    label: "Estimate",
    tag: "ESTIMATE",
    description: "Build a priced estimate with Eleuthera trade sections",
    placeholder: "Describe the job — e.g. 'repair hurricane damage at Governor's Harbour, replace roof sections and repaint exterior'",
    color: "brand",
  },
  {
    id: "timesheet",
    label: "Timesheets",
    tag: "TIMESHEET",
    description: "Log crew hours or review daily time entries",
    placeholder: "Tell me who worked, on which job, and for how long — e.g. 'Omar and Marcus on laundromat, full day today'",
    color: "info",
  },
  {
    id: "payroll",
    label: "Payroll",
    tag: "PAYROLL",
    description: "Calculate pay, NIB deductions, and net amounts",
    placeholder: "Give me hours and rates — e.g. 'Marcus worked 42 hours this week at $18/hr'",
    color: "success",
  },
  {
    id: "client_update",
    label: "Client Update",
    tag: "CLIENT MSG",
    description: "Draft a professional update or message for a client",
    placeholder: "Rough notes are fine — e.g. 'framing done, plumbing starts Monday, need client to pick tile by Friday'",
    color: "destructive",
  },
  {
    id: "job_status",
    label: "Job Status",
    tag: "JOB STATUS",
    description: "Review progress and flag blockers on active jobs",
    placeholder: "Which job? — e.g. 'Sotheby's caretaking properties' or 'laundromat build-out'",
    color: "warning",
  },
];

// ─── Markdown-lite renderer ───────────────────────────────────────────────────

function renderContent(text: string) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Skill mode header line (━━ SKILL ━━)
    if (line.startsWith("━━")) {
      i++;
      continue;
    }
    if (line.startsWith("### ")) {
      elements.push(
        <p key={i} className="text-[13px] font-semibold text-foreground mt-3 mb-1">{line.slice(4)}</p>
      );
    } else if (line.startsWith("## ")) {
      elements.push(
        <p key={i} className="text-[14px] font-semibold text-foreground mt-4 mb-1">{line.slice(3)}</p>
      );
    } else if (line.startsWith("**") && line.endsWith("**") && line.length > 4) {
      elements.push(
        <p key={i} className="text-[13px] font-medium text-foreground-light mt-2">{line.slice(2, -2)}</p>
      );
    } else if (line.match(/^\|.+\|$/)) {
      // Table row
      const cells = line.split("|").filter(c => c.trim() !== "");
      const isHeader = lines[i + 1]?.match(/^\|[-| ]+\|$/);
      if (isHeader) {
        elements.push(
          <div key={i} className="overflow-x-auto mt-2">
            <table className="w-full text-[12px] tabular-nums">
              <thead>
                <tr className="border-b border-border">
                  {cells.map((c, ci) => (
                    <th key={ci} className="text-left py-1.5 px-2 text-foreground-lighter uppercase tracking-wide font-normal">
                      {c.trim()}
                    </th>
                  ))}
                </tr>
              </thead>
            </table>
          </div>
        );
        i += 2; // skip separator row
        // Collect body rows
        const bodyRows: string[][] = [];
        while (i < lines.length && lines[i].match(/^\|.+\|$/)) {
          bodyRows.push(lines[i].split("|").filter(c => c.trim() !== ""));
          i++;
        }
        if (bodyRows.length > 0) {
          const lastEl = elements[elements.length - 1] as any;
          elements[elements.length - 1] = (
            <div key={`t${i}`} className="overflow-x-auto mt-2">
              <table className="w-full text-[12px] tabular-nums border border-border rounded-lg">
                <thead>
                  <tr className="border-b border-border bg-surface-100">
                    {cells.map((c, ci) => (
                      <th key={ci} className="text-left py-1.5 px-3 text-foreground-lighter uppercase tracking-wide font-normal">
                        {c.trim()}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {bodyRows.map((row, ri) => (
                    <tr key={ri} className="hover:bg-surface-100">
                      {row.map((c, ci) => (
                        <td key={ci} className="py-1.5 px-3 text-foreground-light">{c.trim()}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        continue;
      } else {
        elements.push(
          <div key={i} className="flex gap-3 text-[12px] tabular-nums text-foreground-lighter">
            {cells.map((c, ci) => <span key={ci} className="px-1">{c.trim()}</span>)}
          </div>
        );
      }
    } else if (line.match(/^[-*] /) || line.startsWith("• ")) {
      const content = line.replace(/^[-*•] /, "");
      elements.push(
        <div key={i} className="flex gap-2 text-[13px] text-foreground-light leading-relaxed">
          <span className="text-foreground-lighter mt-px flex-shrink-0">·</span>
          <span>{content}</span>
        </div>
      );
    } else if (line.trim() === "") {
      elements.push(<div key={i} className="h-2" />);
    } else {
      elements.push(
        <p key={i} className="text-[13px] text-foreground-light leading-relaxed">{line}</p>
      );
    }
    i++;
  }

  return <div className="space-y-0.5">{elements}</div>;
}

// ─── Typing indicator ─────────────────────────────────────────────────────────

function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1 w-1 rounded-full bg-surface-400 animate-pulse"
          style={{ animationDelay: `${i * 180}ms`, animationDuration: "900ms" }}
        />
      ))}
    </div>
  );
}

// ─── Skill badge (shown in message thread) ───────────────────────────────────

function SkillBadge({ skill }: { skill: Skill }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] tabular-nums tracking-wider border"
      style={{
        color: `hsl(var(--${skill.color}))`,
        borderColor: `hsl(var(--${skill.color}) / 0.188)`,
        background: `hsl(var(--${skill.color}) / 0.039)`,
      }}
    >
      ✦ {skill.tag}
    </span>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ClaudePage() {
  const { user, profile, session } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [messages, setMessages] = useState<Message[]>([]);
  const [pendingWrite, setPendingWrite] = useState<PendingWrite | null>(null);
  const [doubleConfirmInput, setDoubleConfirmInput] = useState("");
  const [resolvingWrite, setResolvingWrite] = useState(false);
  const [mode, setMode] = useState<"default" | "bypass">("default");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [activeSkill, setActiveSkill] = useState<Skill | null>(null);

  // ── Threads state ──
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [railOpen, setRailOpen] = useState(false);
  const [loadingThreads, setLoadingThreads] = useState(true);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const firstName = profile?.full_name?.split(" ")[0] ?? "there";
  const inChat = messages.length > 0;
  const activeThread = useMemo(
    () => threads.find((t) => t.id === activeThreadId) ?? null,
    [threads, activeThreadId]
  );

  const now = new Date();
  const hour = now.getHours();
  const timeOfDay = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";

  useEffect(() => {
    setMounted(true);
    setTimeout(() => textareaRef.current?.focus(), 100);
  }, []);

  // ── Load thread list when user is ready ──
  useEffect(() => {
    if (!user) return;
    loadThreads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function loadThreads(): Promise<Thread[]> {
    setLoadingThreads(true);
    const { data } = await supabase
      .from("ai_threads")
      .select("*")
      .is("archived_at", null)
      .order("updated_at", { ascending: false });
    const list = data ?? [];
    setThreads(list);
    setLoadingThreads(false);
    return list;
  }

  async function openThread(t: Thread) {
    setActiveThreadId(t.id);
    const skill = SKILLS.find((s) => s.id === t.skill_id) ?? null;
    setActiveSkill(skill);
    const { data } = await supabase
      .from("ai_thread_messages")
      .select("*")
      .eq("thread_id", t.id)
      .order("created_at");
    const msgs: Message[] = (data ?? []).map((m: { id: string; role: "user" | "assistant"; content: string }) => ({
      id: m.id,
      role: m.role,
      content: m.content,
    }));
    setMessages(msgs);
  }

  function startNewThread() {
    setActiveThreadId(null);
    setMessages([]);
    setActiveSkill(null);
    setInput("");
    setTimeout(() => textareaRef.current?.focus(), 50);
  }

  async function toggleShare() {
    if (!activeThread || !user || activeThread.user_id !== user.id) return;
    const next = !activeThread.is_shared;
    setThreads((prev) => prev.map((t) => (t.id === activeThread.id ? { ...t, is_shared: next } : t)));
    await supabase.from("ai_threads").update({ is_shared: next }).eq("id", activeThread.id);
  }

  async function deleteActive() {
    if (!activeThread || !user || activeThread.user_id !== user.id) return;
    if (!confirm("Delete this thread? This cannot be undone.")) return;
    await supabase.from("ai_threads").delete().eq("id", activeThread.id);
    setThreads((prev) => prev.filter((t) => t.id !== activeThread.id));
    startNewThread();
  }

  // ── Group threads for the rail ──
  const grouped = useMemo(() => {
    const mine: Thread[] = [];
    const shared: Thread[] = [];
    for (const t of threads) {
      if (user && t.user_id === user.id) mine.push(t);
      else shared.push(t);
    }
    function bucket(ts: Thread[]) {
      const today: Thread[] = [];
      const yest: Thread[] = [];
      const week: Thread[] = [];
      const older: Thread[] = [];
      for (const t of ts) {
        const d = new Date(t.updated_at);
        if (isToday(d)) today.push(t);
        else if (isYesterday(d)) yest.push(t);
        else if (isThisWeek(d, { weekStartsOn: 1 })) week.push(t);
        else older.push(t);
      }
      return { today, yest, week, older };
    }
    return { mine: bucket(mine), shared };
  }, [threads, user?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [input]);

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: trimmed,
      skill_id: activeSkill?.id,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          thread_id: activeThreadId,
          skill_id: activeSkill?.id ?? null,
          message: trimmed,
          mode,
        }),
        signal: abortRef.current.signal,
      });

      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: data.message ?? "Something went wrong. Try again.",
        },
      ]);

      if (data.pending_write) {
        setPendingWrite(data.pending_write);
        setDoubleConfirmInput("");
      }

      // Server creates a thread on first send — adopt its id and refresh the list
      if (data.thread_id) {
        if (!activeThreadId) setActiveThreadId(data.thread_id);
        loadThreads();
      }
    } catch (e: unknown) {
      if ((e as Error)?.name === "AbortError") return;
      setMessages((prev) => [
        ...prev,
        { id: (Date.now() + 1).toString(), role: "assistant", content: "Connection error. Try again." },
      ]);
    } finally {
      setLoading(false);
      abortRef.current = null;
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [loading, session, activeSkill, activeThreadId, mode]);

  const stop = () => {
    abortRef.current?.abort();
    setLoading(false);
  };

  const confirmPending = useCallback(async () => {
    if (!pendingWrite || resolvingWrite) return;
    if (pendingWrite.tier === "double-confirm" && !doubleConfirmInput.trim()) return;
    setResolvingWrite(true);
    try {
      const res = await fetch("/api/ai/chat/confirm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          pending_write_id: pendingWrite.id,
          typed_answer: pendingWrite.tier === "double-confirm" ? doubleConfirmInput.trim() : undefined,
        }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: data.message ?? (data.success ? "Applied." : `Failed: ${data.error ?? "unknown"}`),
        },
      ]);
      setPendingWrite(null);
      setDoubleConfirmInput("");
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: (Date.now() + 1).toString(), role: "assistant", content: "Confirm failed. Try again." },
      ]);
    } finally {
      setResolvingWrite(false);
    }
  }, [pendingWrite, doubleConfirmInput, session, resolvingWrite]);

  const cancelPending = useCallback(async () => {
    if (!pendingWrite || resolvingWrite) return;
    setResolvingWrite(true);
    try {
      const res = await fetch("/api/ai/chat/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ pending_write_id: pendingWrite.id }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: data.message ?? "Cancelled.",
        },
      ]);
      setPendingWrite(null);
      setDoubleConfirmInput("");
    } finally {
      setResolvingWrite(false);
    }
  }, [pendingWrite, session, resolvingWrite]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const selectSkill = (skill: Skill) => {
    if (activeSkill?.id === skill.id) {
      setActiveSkill(null);
    } else {
      setActiveSkill(skill);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  };

  const clearSkill = () => {
    setActiveSkill(null);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  return (
    <div className="flex h-full bg-background overflow-hidden">

      {/* ── Thread rail ── */}
      <aside
        className={cn(
          "flex-shrink-0 border-r border-border bg-background overflow-hidden transition-[width] duration-200 ease-out",
          railOpen ? "w-[240px]" : "w-0"
        )}
      >
        <div className="w-[240px] h-full flex flex-col">
          {/* Rail header */}
          <div className="flex items-center justify-between px-3 pt-3.5 pb-3 border-b border-border">
            <p className="text-[9px] font-mono text-foreground-lighter uppercase tracking-[0.2em]">Threads</p>
            <button
              onClick={() => setRailOpen(false)}
              className="p-1 text-foreground-lighter hover:text-foreground-lighter transition-colors"
              title="Hide threads"
            >
              <PanelLeftClose className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* New thread */}
          <div className="px-3 pt-3 pb-2">
            <button
              onClick={startNewThread}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-[12px] font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> New thread
            </button>
          </div>

          {/* Thread list */}
          <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-3">
            {loadingThreads ? (
              <p className="text-[10px] tabular-nums text-foreground-lighter text-center py-6">loading…</p>
            ) : threads.length === 0 ? (
              <p className="text-[11px] text-foreground-lighter text-center px-2 py-6 leading-relaxed">
                No threads yet.<br />Start one above.
              </p>
            ) : (
              <>
                <RailBucket label="Today"     items={grouped.mine.today} activeId={activeThreadId} onPick={openThread} />
                <RailBucket label="Yesterday" items={grouped.mine.yest}  activeId={activeThreadId} onPick={openThread} />
                <RailBucket label="This week" items={grouped.mine.week}  activeId={activeThreadId} onPick={openThread} />
                <RailBucket label="Earlier"   items={grouped.mine.older} activeId={activeThreadId} onPick={openThread} />
                {grouped.shared.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 px-1.5 mb-1.5 mt-1">
                      <Share2 className="h-2.5 w-2.5 text-brand/70" />
                      <p className="text-[9px] font-mono text-brand/70 uppercase tracking-[0.18em]">Shared</p>
                    </div>
                    {grouped.shared.map((t) => (
                      <RailItem key={t.id} thread={t} active={t.id === activeThreadId} onPick={openThread} sharedBadge />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </aside>

      {/* ── Main column ── */}
      <div className="relative flex flex-col flex-1 min-w-0 overflow-hidden">

      {/* ── Floating rail toggle (when closed) ── */}
      {!railOpen && (
        <button
          onClick={() => setRailOpen(true)}
          className="absolute top-3 left-3 z-20 flex items-center gap-1.5 px-2 py-1 text-[10px] font-mono text-muted-foreground uppercase tracking-wider border border-border rounded-md hover:text-foreground hover:border-muted-foreground transition-colors bg-background/80 backdrop-blur"
          title="Show threads"
        >
          <PanelLeftOpen className="h-3 w-3" />
          Threads
        </button>
      )}

      {/* ── Chat header (when in an active thread) ── */}
      {inChat && activeThread && (
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 border-b border-border bg-background/60">
          <div className="flex items-center gap-2.5 min-w-0">
            <MessageSquare className="h-3.5 w-3.5 text-foreground-lighter flex-shrink-0" />
            <p className="text-[13px] text-foreground truncate font-medium">{activeThread.title}</p>
            {activeThread.is_shared && (
              <span className="inline-flex items-center gap-1 text-[9px] font-mono text-brand/80 uppercase tracking-[0.18em] border border-primary/30 rounded-full px-1.5 py-0.5 flex-shrink-0">
                <Share2 className="h-2.5 w-2.5" /> shared
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {user && activeThread.user_id === user.id && (
              <>
                <button
                  onClick={toggleShare}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider border rounded-md transition-colors",
                    activeThread.is_shared
                      ? "text-brand border-primary/40 hover:bg-primary/10"
                      : "text-foreground-lighter border-border hover:text-foreground-lighter hover:border-strong"
                  )}
                >
                  <Share2 className="h-2.5 w-2.5" />
                  {activeThread.is_shared ? "shared" : "share"}
                </button>
                <button
                  onClick={deleteActive}
                  className="p-1.5 text-foreground-lighter hover:text-destructive transition-colors"
                  title="Delete thread"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Messages area ── */}
      <div className="flex-1 overflow-y-auto">
        {!inChat ? (
          /* ── Empty state ── */
          <div
            className={cn(
              "flex flex-col items-center justify-center h-full px-6 transition-opacity duration-500",
              mounted ? "opacity-100" : "opacity-0"
            )}
          >
            <div className="w-full max-w-[640px] space-y-6">
              {/* Greeting */}
              <div>
                <p className="text-[11px] font-mono text-foreground-lighter uppercase tracking-[0.2em] mb-3">
                  Bedrock · Claude
                </p>
                <h1 className="text-[28px] font-semibold text-foreground leading-tight tracking-tight">
                  Good {timeOfDay}, {firstName}.
                </h1>
                <p className="text-[15px] text-foreground-lighter mt-1.5">What can I help you with?</p>
              </div>

              {/* Input */}
              <InputBox
                value={input}
                onChange={setInput}
                onSend={() => send(input)}
                onStop={stop}
                loading={loading}
                textareaRef={textareaRef}
                onKeyDown={onKeyDown}
                activeSkill={activeSkill}
                onClearSkill={clearSkill}
              />

              {/* Skills */}
              <div className="space-y-2.5">
                <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">Skills</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {SKILLS.map((skill) => {
                    const isActive = activeSkill?.id === skill.id;
                    return (
                      <button
                        key={skill.id}
                        onClick={() => selectSkill(skill)}
                        className={cn(
                          "text-left px-3.5 py-3 rounded-lg border transition-all duration-150",
                          isActive
                            ? "bg-surface-100"
                            : "bg-surface-100 border-border hover:border-strong hover:bg-surface-200"
                        )}
                        style={isActive ? {
                          borderColor: `hsl(var(--${skill.color}) / 0.314)`,
                          boxShadow: `0 0 0 1px hsl(var(--${skill.color}) / 0.125)`,
                        } : {}}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span
                            className="text-[9px] tabular-nums tracking-widest"
                            style={{ color: isActive ? `hsl(var(--${skill.color}))` : "hsl(var(--foreground-lighter))" }}
                          >
                            {skill.tag}
                          </span>
                          {isActive && (
                            <span
                              className="text-[9px] tabular-nums"
                              style={{ color: `hsl(var(--${skill.color}))` }}
                            >
                              ✦ active
                            </span>
                          )}
                        </div>
                        <p className={cn(
                          "text-[13px] font-medium leading-none mb-1",
                          isActive ? "text-foreground" : "text-foreground-light"
                        )}>
                          {skill.label}
                        </p>
                        <p className="text-[11px] text-foreground-lighter leading-relaxed">{skill.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* ── Chat thread ── */
          <div className="max-w-[680px] mx-auto px-6 py-8 space-y-6">
            {messages.map((msg) => {
              const msgSkill = SKILLS.find(s => s.id === msg.skill_id);
              return (
                <div key={msg.id} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                  {msg.role === "user" ? (
                    <div className="max-w-[80%] space-y-1.5">
                      {msgSkill && (
                        <div className="flex justify-end">
                          <SkillBadge skill={msgSkill} />
                        </div>
                      )}
                      <div className="px-4 py-2.5 rounded-2xl bg-surface-100 border border-strong">
                        <p className="text-[13px] text-foreground leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="max-w-[90%]">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[10px] font-mono text-foreground-lighter uppercase tracking-wider">Claude</span>
                      </div>
                      {renderContent(msg.content)}
                    </div>
                  )}
                </div>
              );
            })}

            {loading && (
              <div className="flex justify-start">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-mono text-foreground-lighter uppercase tracking-wider">Claude</span>
                    {activeSkill && <SkillBadge skill={activeSkill} />}
                  </div>
                  <TypingDots />
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* ── Sticky bottom input (chat mode only) ── */}
      {inChat && (
        <div className="flex-shrink-0 border-t border-border px-6 py-4 bg-background">
          <div className="max-w-[680px] mx-auto space-y-3">
            {pendingWrite && (
              <PendingWriteCard
                pending={pendingWrite}
                typedInput={doubleConfirmInput}
                onTypedInputChange={setDoubleConfirmInput}
                onConfirm={confirmPending}
                onCancel={cancelPending}
                busy={resolvingWrite}
              />
            )}
            {/* Skill chips in chat mode */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {SKILLS.map((skill) => {
                const isActive = activeSkill?.id === skill.id;
                return (
                  <button
                    key={skill.id}
                    onClick={() => selectSkill(skill)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border transition-all text-[11px] tabular-nums"
                    style={isActive ? {
                      borderColor: `hsl(var(--${skill.color}) / 0.314)`,
                      color: `hsl(var(--${skill.color}))`,
                      background: `hsl(var(--${skill.color}) / 0.051)`,
                    } : {
                      borderColor: "hsl(var(--border))",
                      color: "hsl(var(--foreground-lighter))",
                    }}
                  >
                    {isActive && <span>✦</span>}
                    {skill.tag}
                  </button>
                );
              })}
              <button
                onClick={() => setMode((m) => (m === "bypass" ? "default" : "bypass"))}
                className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-md border transition-all text-[11px] tabular-nums"
                style={mode === "bypass" ? {
                  borderColor: "hsl(var(--destructive))",
                  color: "hsl(var(--destructive))",
                  background: "hsl(var(--destructive-subtle))",
                } : {
                  borderColor: "hsl(var(--border))",
                  color: "hsl(var(--foreground-lighter))",
                }}
                title={mode === "bypass" ? "Bypass mode ON — confirm-tier writes commit instantly. Click to turn off." : "Default mode — every write asks for confirmation. Click to bypass."}
              >
                {mode === "bypass" ? "⚠ BYPASS" : "BYPASS"}
              </button>
            </div>

            {mode === "bypass" && (
              <div className="px-3 py-2 rounded-md border text-[11px] tabular-nums" style={{ borderColor: "hsl(var(--destructive))", background: "hsl(var(--destructive-subtle))", color: "hsl(var(--destructive))" }}>
                Bypass mode: writes commit instantly without a confirmation card. Deletes and voids still require typed confirmation.
              </div>
            )}

            <InputBox
              value={input}
              onChange={setInput}
              onSend={() => send(input)}
              onStop={stop}
              loading={loading}
              textareaRef={textareaRef}
              onKeyDown={onKeyDown}
              activeSkill={activeSkill}
              onClearSkill={clearSkill}
            />
            <p className="text-[10px] text-foreground-lighter text-center tabular-nums">
              Enter · Shift+Enter for newline
            </p>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

// ─── Rail sub-components ─────────────────────────────────────────────────────

function RailBucket({
  label,
  items,
  activeId,
  onPick,
}: {
  label: string;
  items: Thread[];
  activeId: string | null;
  onPick: (t: Thread) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-[9px] font-mono text-foreground-lighter uppercase tracking-[0.18em] px-1.5 mb-1.5">
        {label}
      </p>
      {items.map((t) => (
        <RailItem key={t.id} thread={t} active={t.id === activeId} onPick={onPick} />
      ))}
    </div>
  );
}

function RailItem({
  thread,
  active,
  onPick,
  sharedBadge,
}: {
  thread: Thread;
  active: boolean;
  onPick: (t: Thread) => void;
  sharedBadge?: boolean;
}) {
  const skill = SKILLS.find((s) => s.id === thread.skill_id);
  return (
    <button
      onClick={() => onPick(thread)}
      className={cn(
        "w-full text-left px-2 py-1.5 rounded-md mb-0.5 transition-colors",
        active ? "bg-surface-100" : "hover:bg-background"
      )}
    >
      <div className="flex items-start gap-2">
        <div
          className="h-3 w-3 mt-0.5 flex-shrink-0 flex items-center justify-center"
          style={{ color: active && skill ? `hsl(var(--${skill.color}))` : "hsl(var(--muted-foreground))" }}
        >
          <span className="text-[10px]">{skill ? "✦" : "·"}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn(
            "text-[12px] truncate leading-tight",
            active ? "text-foreground" : "text-foreground-lighter"
          )}>
            {thread.title}
          </p>
          <p className="text-[9px] tabular-nums text-foreground-lighter mt-0.5">
            {format(new Date(thread.updated_at), "MMM d · h:mma").toLowerCase()}
            {sharedBadge && " · shared"}
          </p>
        </div>
        {!sharedBadge && thread.is_shared && (
          <Share2 className="h-2.5 w-2.5 text-brand/60 flex-shrink-0 mt-1" />
        )}
      </div>
    </button>
  );
}

// ─── Input box ────────────────────────────────────────────────────────────────

function InputBox({
  value,
  onChange,
  onSend,
  onStop,
  loading,
  textareaRef,
  onKeyDown,
  activeSkill,
  onClearSkill,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  loading: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  activeSkill: Skill | null;
  onClearSkill: () => void;
}) {
  return (
    <div
      className="rounded-xl border bg-surface-100 transition-all duration-150 focus-within:border-strong"
      style={activeSkill ? {
        borderColor: `hsl(var(--${activeSkill.color}) / 0.251)`,
        boxShadow: `0 0 0 1px hsl(var(--${activeSkill.color}) / 0.082)`,
      } : {}}
    >
      {/* Active skill indicator bar */}
      {activeSkill && (
        <div
          className="flex items-center justify-between px-4 pt-3 pb-2"
          style={{ borderBottom: `1px solid hsl(var(--${activeSkill.color}) / 0.125)` }}
        >
          <div className="flex items-center gap-2">
            <span
              className="text-[9px] tabular-nums tracking-widest"
              style={{ color: `hsl(var(--${activeSkill.color}))` }}
            >
              ✦ {activeSkill.tag} MODE
            </span>
            <span className="text-[11px] text-foreground-lighter">{activeSkill.label}</span>
          </div>
          <button
            onClick={onClearSkill}
            className="p-0.5 rounded-md transition-opacity hover:opacity-70"
            style={{ color: `hsl(var(--${activeSkill.color}))` }}
            title="Deactivate skill"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={activeSkill?.placeholder ?? "Message Claude..."}
        rows={1}
        disabled={loading}
        className="w-full bg-transparent px-4 py-3.5 pr-12 text-[13px] text-foreground placeholder:text-foreground-lighter resize-none focus:outline-none leading-relaxed"
        style={{ minHeight: "52px", maxHeight: "200px" }}
      />

      <button
        onClick={loading ? onStop : onSend}
        disabled={!loading && !value.trim()}
        className={cn(
          "absolute right-3 bottom-3 h-7 w-7 rounded-md flex items-center justify-center transition-all"
        )}
        style={{
          position: "absolute",
          right: "12px",
          bottom: "12px",
          height: "28px",
          width: "28px",
          borderRadius: "6px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.15s",
          background: loading
            ? (activeSkill ? `hsl(var(--${activeSkill.color}))` : "hsl(var(--primary))")
            : value.trim()
            ? (activeSkill ? `hsl(var(--${activeSkill.color}))` : "hsl(var(--primary))")
            : "hsl(var(--secondary))",
          color: loading || value.trim() ? "hsl(var(--primary-foreground))" : "hsl(var(--muted-foreground))",
          cursor: !loading && !value.trim() ? "not-allowed" : "pointer",
        }}
        title={loading ? "Stop" : "Send"}
      >
        {loading ? <Square className="h-3 w-3 fill-current" /> : <ArrowUp className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

// ─── Pending write confirmation card ──────────────────────────────────────────

function PendingWriteCard({
  pending,
  typedInput,
  onTypedInputChange,
  onConfirm,
  onCancel,
  busy,
}: {
  pending: PendingWrite;
  typedInput: string;
  onTypedInputChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const isDouble = pending.tier === "double-confirm";
  const canConfirm = !busy && (!isDouble || typedInput.trim().length > 0);
  return (
    <div
      className="rounded-lg border px-4 py-3 space-y-3"
      style={{
        borderColor: isDouble ? "hsl(var(--destructive))" : "hsl(var(--border))",
        background: isDouble ? "hsl(var(--destructive-subtle))" : "hsl(var(--surface-200))",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="text-[10px] font-mono uppercase tracking-wider" style={{ color: isDouble ? "hsl(var(--destructive))" : "hsl(var(--foreground-lighter))" }}>
            {isDouble ? "Confirm — destructive" : "Confirm write"}
          </div>
          <div className="text-[13px] text-foreground leading-relaxed">{pending.summary}</div>
          <div className="text-[10px] tabular-nums text-foreground-lighter">{pending.tool_name}</div>
        </div>
      </div>
      {isDouble && (
        <input
          type="text"
          value={typedInput}
          onChange={(e) => onTypedInputChange(e.target.value)}
          placeholder="Type to confirm"
          className="w-full px-3 py-2 text-[13px] rounded-md bg-background border border-strong text-foreground focus:outline-none focus:border-destructive"
        />
      )}
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={onCancel}
          disabled={busy}
          className="px-3 py-1.5 text-[12px] tabular-nums rounded-md border border-strong text-foreground-light hover:bg-surface-100 disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={!canConfirm}
          className="px-3 py-1.5 text-[12px] tabular-nums rounded-md disabled:opacity-40"
          style={{
            background: isDouble ? "hsl(var(--destructive))" : "hsl(var(--success))",
            color: isDouble ? "hsl(var(--destructive-foreground))" : "hsl(var(--success-foreground))",
          }}
        >
          {busy ? "Working…" : "Confirm"}
        </button>
      </div>
    </div>
  );
}
