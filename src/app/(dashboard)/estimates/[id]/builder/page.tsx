"use client";

/**
 * Estimate Builder — full-width, inline-editable Gantt editor.
 *
 * Theme contract: this page is theme-aware. Colors come from shadcn CSS vars
 * (background / card / muted / accent / border / foreground / muted-foreground)
 * and the `brand`/`primary` accent tokens. No hardcoded hex values —
 * dark/light modes both render correctly via globals.css `:root` + `.dark`.
 *
 * Schema notes (project_bedrock_materials_calc_design.md):
 *   - estimate_line_items.amount, .unit_rate are GENERATED — never write to them.
 *   - daily_workers is jsonb keyed by ISO date string ("YYYY-MM-DD") → number (crew count).
 *   - No `category` column on line items; each line is composite (labor+material+equipment).
 */

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ChangeEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Lock, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { canSeeCosts } from "@/lib/permissions";
import {
  computeLaborCost,
  resolveMaterialMarkupPct,
  resolveEquipmentMarkupPct,
  type Estimate,
  type EstimateLineItem,
} from "@/types";

type Section = {
  id: string;
  estimate_id: string;
  name: string;
  /** Optional client-facing label override — see issue #13. */
  client_name?: string | null;
  order_index: number;
  show_to_client: boolean;
};

const DAY_PAD_BEFORE = 2;
const DAY_PAD_AFTER = 14;

export default function EstimateBuilderEditorPage() {
  const params = useParams();
  const router = useRouter();
  const estimateId = params.id as string;
  const { toast } = useToast();
  const { profile, loading: authLoading } = useAuth();
  const supabase = createClient();

  // Role gate — workers can't open the editor.
  useEffect(() => {
    if (authLoading) return;
    if (!canSeeCosts(profile)) router.replace(`/estimates/${estimateId}`);
  }, [authLoading, profile, estimateId, router]);

  const [loading, setLoading] = useState(true);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [lineItems, setLineItems] = useState<EstimateLineItem[]>([]);
  const [savingCount, setSavingCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [estRes, secRes, itemsRes] = await Promise.all([
          supabase.from("estimates").select("*").eq("id", estimateId).single(),
          supabase.from("estimate_sections").select("*").eq("estimate_id", estimateId).order("order_index"),
          supabase.from("estimate_line_items").select("*").eq("estimate_id", estimateId).order("order_index"),
        ]);
        if (cancelled) return;
        if (estRes.error) throw estRes.error;
        setEstimate(estRes.data);
        setSections((secRes.data as Section[]) || []);
        setLineItems((itemsRes.data as EstimateLineItem[]) || []);
      } catch (err: any) {
        if (!cancelled) toast({ title: "Failed to load estimate", description: err.message, variant: "destructive" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estimateId]);

  const isEditable = !!estimate && estimate.status === "draft";
  const lockReason = !estimate
    ? null
    : estimate.status !== "draft"
      ? `Estimate is ${estimate.status} — only drafts are editable.`
      : null;

  const trackSave = async <T,>(fn: () => Promise<T>): Promise<T | null> => {
    setSavingCount((n) => n + 1);
    try {
      return await fn();
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
      return null;
    } finally {
      setSavingCount((n) => Math.max(0, n - 1));
    }
  };

  const updateEstimate = async (patch: Partial<Estimate>) => {
    if (!estimate) return;
    const prev = estimate;
    setEstimate({ ...prev, ...patch });
    const ok = await trackSave(async () => {
      const { error } = await supabase.from("estimates").update(patch).eq("id", estimateId);
      if (error) throw error;
      return true;
    });
    if (!ok) setEstimate(prev);
  };

  const updateLineItem = async (id: string, patch: Partial<EstimateLineItem>) => {
    const prevItems = lineItems;
    setLineItems((items) => items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
    const ok = await trackSave(async () => {
      const { error } = await supabase.from("estimate_line_items").update(patch).eq("id", id);
      if (error) throw error;
      return true;
    });
    if (!ok) setLineItems(prevItems);
  };

  const updateSection = async (id: string, patch: Partial<Section>) => {
    const prev = sections;
    setSections((ss) => ss.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    const ok = await trackSave(async () => {
      const { error } = await supabase.from("estimate_sections").update(patch).eq("id", id);
      if (error) throw error;
      return true;
    });
    if (!ok) setSections(prev);
  };

  const addSection = async () => {
    if (!isEditable) return;
    const order = sections.length > 0 ? Math.max(...sections.map((s) => s.order_index)) + 1 : 0;
    const { data, error } = await supabase
      .from("estimate_sections")
      .insert({ estimate_id: estimateId, name: "New section", order_index: order, show_to_client: true })
      .select()
      .single();
    if (error) {
      toast({ title: "Couldn't add section", description: error.message, variant: "destructive" });
      return;
    }
    setSections((ss) => [...ss, data as Section]);
  };

  const addTask = async (sectionId: string) => {
    if (!isEditable) return;
    const sectionItems = lineItems.filter((it) => it.section_id === sectionId);
    const order = sectionItems.length > 0
      ? Math.max(...sectionItems.map((it) => it.order_index ?? 0)) + 1
      : (lineItems.length > 0 ? Math.max(...lineItems.map((it) => it.order_index ?? 0)) + 1 : 0);
    const { data, error } = await supabase
      .from("estimate_line_items")
      .insert({
        estimate_id: estimateId, section_id: sectionId, description: "New task",
        quantity: 1, man_days: 0, labor_cost: 0, material_cost: 0, equipment_cost: 0,
        order_index: order, daily_workers: {}, show_to_client: true,
      })
      .select()
      .single();
    if (error) {
      toast({ title: "Couldn't add task", description: error.message, variant: "destructive" });
      return;
    }
    setLineItems((items) => [...items, data as EstimateLineItem]);
  };

  const deleteLineItem = async (id: string) => {
    if (!isEditable) return;
    if (!confirm("Delete this task?")) return;
    const prev = lineItems;
    setLineItems((items) => items.filter((it) => it.id !== id));
    const ok = await trackSave(async () => {
      const { error } = await supabase.from("estimate_line_items").delete().eq("id", id);
      if (error) throw error;
      return true;
    });
    if (!ok) setLineItems(prev);
  };

  const deleteSection = async (id: string) => {
    if (!isEditable) return;
    const sectionItems = lineItems.filter((it) => it.section_id === id);
    if (sectionItems.length > 0 && !confirm(`Delete this section and its ${sectionItems.length} task(s)?`)) return;
    const prevSections = sections;
    const prevItems = lineItems;
    setSections((ss) => ss.filter((s) => s.id !== id));
    setLineItems((items) => items.filter((it) => it.section_id !== id));
    const ok = await trackSave(async () => {
      const { error } = await supabase.from("estimate_sections").delete().eq("id", id);
      if (error) throw error;
      return true;
    });
    if (!ok) {
      setSections(prevSections);
      setLineItems(prevItems);
    }
  };

  const days: string[] = useMemo(() => {
    const dated = lineItems.filter((it) => it.planned_start);
    if (dated.length === 0) {
      const out: string[] = [];
      const start = new Date();
      start.setUTCHours(0, 0, 0, 0);
      start.setUTCDate(start.getUTCDate() - DAY_PAD_BEFORE);
      for (let i = 0; i < DAY_PAD_BEFORE + DAY_PAD_AFTER; i++) {
        out.push(toISODate(start));
        start.setUTCDate(start.getUTCDate() + 1);
      }
      return out;
    }
    const starts = dated.map((it) => it.planned_start!).filter(Boolean);
    const ends = dated.map((it) => it.planned_end ?? it.planned_start!).filter(Boolean);
    const min = starts.reduce((a, b) => (a < b ? a : b));
    const max = ends.reduce((a, b) => (a > b ? a : b));
    const out: string[] = [];
    const cursor = new Date(min + "T00:00:00Z");
    cursor.setUTCDate(cursor.getUTCDate() - DAY_PAD_BEFORE);
    const end = new Date(max + "T00:00:00Z");
    end.setUTCDate(end.getUTCDate() + DAY_PAD_AFTER);
    while (cursor <= end) {
      out.push(toISODate(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return out;
  }, [lineItems]);

  const laborRate = estimate?.labor_sell_rate_per_day ?? null;

  // Option C — tasks own labor only; materials/equipment live on /materials.
  // Section + estimate totals here reflect *labor only*. The full estimate
  // total (labor + takeoffs + overhead + VAT) is shown on /estimates/[id].
  const taskLabor = (item: EstimateLineItem): number => {
    const stored = item.labor_cost ?? 0;
    if (stored > 0) return Number(stored);
    return computeLaborCost(item, laborRate);
  };

  const itemsBySection: Record<string, EstimateLineItem[]> = {};
  for (const it of lineItems) {
    const k = it.section_id ?? "_loose";
    (itemsBySection[k] ??= []).push(it);
  }
  for (const k of Object.keys(itemsBySection)) {
    itemsBySection[k].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
  }

  const sectionSubtotal = (sectionId: string) =>
    (itemsBySection[sectionId] ?? []).reduce((s, it) => s + taskLabor(it), 0);

  const laborSubtotal = lineItems.reduce((s, it) => s + taskLabor(it), 0);
  // estimate.total_amount is computed server-side by the trigger and includes
  // takeoff sells + overhead + VAT. May lag a tick after a local edit until refetch.
  const estimateTotal = Number(estimate?.total_amount ?? 0);

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!canSeeCosts(profile)) return null;
  if (!estimate) return null;

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="px-6 py-3 flex items-center gap-4">
          <Link href={`/estimates/${estimateId}`} className="text-muted-foreground hover:text-foreground transition-colors" title="Back to estimate view">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-mono text-muted-foreground/70 uppercase tracking-widest">
              {estimate.estimate_number ?? "Estimate"} · Editor
            </div>
            <h1 className="text-[16px] font-semibold truncate text-foreground">{estimate.title || "Untitled estimate"}</h1>
          </div>
          <div className="text-[10px] tabular-nums text-muted-foreground">
            {savingCount > 0 ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" /> Saving…
              </span>
            ) : (
              <span>All changes saved</span>
            )}
          </div>
          <div className="flex items-baseline gap-4">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/70">Labor</span>
              <span className="text-[12px] tabular-nums text-foreground tabular-nums">{formatCurrency(laborSubtotal)}</span>
            </div>
            <div className="flex items-baseline gap-1.5" title="Total = labor + materials + overhead + VAT (computed server-side; refresh /estimates/[id] for latest)">
              <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/70">Total</span>
              <span className="text-[14px] tabular-nums text-brand tabular-nums font-semibold">{formatCurrency(estimateTotal)}</span>
            </div>
          </div>
        </div>

        {lockReason && (
          <div className="px-6 py-2 bg-primary/10 border-t border-primary/20 flex items-center gap-2 text-[11px] tabular-nums text-brand">
            <Lock className="h-3 w-3" />
            {lockReason}
          </div>
        )}

        {/* Toolbar */}
        <div className="px-6 py-2.5 border-t border-border flex items-center gap-4 flex-wrap">
          <EstimateNumberInput
            label="Labor rate / day"
            value={estimate.labor_sell_rate_per_day ?? null}
            onChange={(v) => updateEstimate({ labor_sell_rate_per_day: v })}
            disabled={!isEditable}
            prefix="$"
          />
          <EstimateNumberInput
            label="Material markup"
            value={estimate.default_material_markup_pct ?? 0}
            onChange={(v) => updateEstimate({ default_material_markup_pct: v ?? 0 })}
            disabled={!isEditable}
            suffix="%"
          />
          <EstimateNumberInput
            label="Equip. markup"
            value={estimate.default_equipment_markup_pct ?? 0}
            onChange={(v) => updateEstimate({ default_equipment_markup_pct: v ?? 0 })}
            disabled={!isEditable}
            suffix="%"
          />
          <div className="flex-1" />
          <button
            onClick={addSection}
            disabled={!isEditable}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted border border-border text-[11px] tabular-nums text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus className="h-3 w-3" />
            Section
          </button>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-auto bg-background">
        <table className="min-w-full" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
          <thead className="sticky top-0 z-20 bg-card">
            <tr>
              <th className="sticky left-0 z-30 bg-card px-3 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70 min-w-[260px] border-b border-r border-border">
                Task
              </th>
              {/* Option C — tasks now own labor only; materials live on /materials (takeoff). */}
              {(["Crew", "M-Days", "Labor $"] as const).map((h, i) => (
                <th
                  key={h}
                  className={cn(
                    "px-2 py-2.5 text-right text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70 border-b border-border bg-card",
                    i === 2 && "border-r"
                  )}
                  style={{ width: ["60px", "80px", "120px"][i] }}
                >
                  {h}
                </th>
              ))}
              <th className="border-b border-border bg-card w-[12px]" />
              {days.map((d) => {
                const dt = new Date(d + "T00:00:00Z");
                const dow = dt.toLocaleDateString("en-US", { weekday: "narrow", timeZone: "UTC" });
                const dom = dt.getUTCDate();
                const weekend = dt.getUTCDay() === 0 || dt.getUTCDay() === 6;
                const firstOfMonth = dom === 1;
                return (
                  <th
                    key={d}
                    className={cn(
                      "px-1 py-2.5 text-center text-[9px] tabular-nums text-muted-foreground/70 border-b border-border min-w-[34px] bg-card",
                      weekend && "bg-muted/40",
                      firstOfMonth && "border-l-2 border-l-border"
                    )}
                    title={d}
                  >
                    <div className="leading-tight">
                      <div className={cn(weekend && "text-muted-foreground/50")}>{dow}</div>
                      <div className="text-foreground/60 font-medium">{dom}</div>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sections.length === 0 ? (
              <tr>
                <td colSpan={5 + days.length} className="px-6 py-10 text-center text-[13px] text-muted-foreground bg-background">
                  No sections yet. Click <span className="text-foreground font-medium">+ Section</span> above to start.
                </td>
              </tr>
            ) : (
              sections.map((sec) => {
                const items = itemsBySection[sec.id] ?? [];
                return (
                  <Fragment key={sec.id}>
                    {/* Section header */}
                    <tr className="bg-muted">
                      <td className="sticky left-0 z-10 bg-muted px-3 py-2 border-b border-r border-border">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-2">
                            <EditableTextCell
                              value={sec.name}
                              onCommit={(v) => updateSection(sec.id, { name: v })}
                              disabled={!isEditable}
                              className="text-[12px] font-semibold text-foreground"
                              placeholder="Section name"
                            />
                            {isEditable && (
                              <>
                                <button
                                  onClick={() => addTask(sec.id)}
                                  className="text-[10px] tabular-nums text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded-md hover:bg-accent"
                                  title="Add task to this section"
                                >
                                  + task
                                </button>
                                <button
                                  onClick={() => deleteSection(sec.id)}
                                  className="text-muted-foreground/60 hover:text-destructive transition-colors"
                                  title="Delete section"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </>
                            )}
                          </div>
                          {/* Client-facing label (issue #13): falls back to `name` on the
                              client preview when empty. Internal `name` always shows here. */}
                          <EditableTextCell
                            value={sec.client_name ?? ""}
                            onCommit={(v) => updateSection(sec.id, { client_name: v.trim() || null })}
                            disabled={!isEditable}
                            className="text-[10.5px] italic text-muted-foreground/80 font-normal"
                            placeholder="Client label (optional, e.g. 'Raised Concrete Pad')"
                          />
                        </div>
                      </td>
                      <td colSpan={2} className="px-2 py-2 text-right text-[10px] tabular-nums text-muted-foreground/70 border-b border-border">
                        {items.length} task{items.length === 1 ? "" : "s"}
                      </td>
                      <td className="px-2 py-2 text-right text-[12px] tabular-nums text-foreground font-semibold tabular-nums border-b border-r border-border">
                        {formatCurrency(sectionSubtotal(sec.id))}
                      </td>
                      <td className="border-b border-border" />
                      {days.map((d) => {
                        const weekend = isWeekend(d);
                        return <td key={d} className={cn("border-b border-border", weekend && "bg-muted/30")} />;
                      })}
                    </tr>

                    {items.length === 0 ? (
                      <tr>
                        <td colSpan={5 + days.length} className="px-6 py-3 text-[11px] italic text-muted-foreground border-b border-border bg-background">
                          No tasks. {isEditable && (
                            <button onClick={() => addTask(sec.id)} className="underline hover:text-foreground">
                              Add one
                            </button>
                          )}
                        </td>
                      </tr>
                    ) : (
                      items.map((item) => (
                        <TaskRow
                          key={item.id}
                          item={item}
                          estimate={estimate}
                          days={days}
                          laborRate={laborRate}
                          editable={isEditable}
                          onUpdate={(patch) => updateLineItem(item.id, patch)}
                          onDelete={() => deleteLineItem(item.id)}
                        />
                      ))
                    )}
                  </Fragment>
                );
              })
            )}

            {(itemsBySection["_loose"]?.length ?? 0) > 0 && (
              <Fragment>
                <tr className="bg-muted">
                  <td colSpan={5 + days.length} className="px-3 py-2 text-[12px] italic text-muted-foreground border-b border-border">
                    Unsectioned line items
                  </td>
                </tr>
                {itemsBySection["_loose"]!.map((item) => (
                  <TaskRow
                    key={item.id}
                    item={item}
                    estimate={estimate}
                    days={days}
                    laborRate={laborRate}
                    editable={isEditable}
                    onUpdate={(patch) => updateLineItem(item.id, patch)}
                    onDelete={() => deleteLineItem(item.id)}
                  />
                ))}
              </Fragment>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── TaskRow ─────────────────────────────────────────────────────────────────

type TaskRowProps = {
  item: EstimateLineItem;
  estimate: Estimate;
  days: string[];
  laborRate: number | null;
  editable: boolean;
  onUpdate: (patch: Partial<EstimateLineItem>) => void;
  onDelete: () => void;
};

function TaskRow({ item, days, laborRate, editable, onUpdate, onDelete }: TaskRowProps) {
  // Option C — tasks carry labor only; materials/equipment live on /materials (takeoff).
  const computedLabor = computeLaborCost(item, laborRate);
  const laborDisplay = (item.labor_cost ?? 0) > 0 ? Number(item.labor_cost) : computedLabor;

  const onManDaysChange = (newDays: number | null) => {
    const md = newDays ?? 0;
    const rate = item.labor_sell_rate_per_day ?? laborRate ?? 0;
    onUpdate({ man_days: md, labor_cost: md * rate });
  };

  const onDayCellChange = (date: string, crew: number | null) => {
    const next: Record<string, number> = { ...(item.daily_workers ?? {}) };
    if (crew == null || crew === 0) {
      delete next[date];
    } else {
      next[date] = crew;
    }
    const dates = Object.keys(next).sort();
    const planned_start = dates[0] ?? null;
    const planned_end = dates[dates.length - 1] ?? null;
    const man_days = Object.values(next).reduce((s, n) => s + n, 0);
    const rate = item.labor_sell_rate_per_day ?? laborRate ?? 0;
    onUpdate({
      daily_workers: next,
      planned_start,
      planned_end,
      man_days,
      labor_cost: man_days * rate,
    });
  };

  // Precompute the bar geometry: which days are active, and which are
  // start/end of contiguous runs (so we round corners + drop inner borders).
  const dailyWorkers = item.daily_workers ?? {};
  const activeOnDay = (iso: string) => (dailyWorkers[iso] ?? 0) > 0;

  return (
    <tr className="group">
      {/* Description */}
      <td className="sticky left-0 z-10 bg-card group-hover:bg-accent transition-colors px-3 py-2 border-b border-r border-border pl-6">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <EditableTextCell
              value={item.description ?? ""}
              onCommit={(v) => onUpdate({ description: v })}
              disabled={!editable}
              placeholder="(untitled)"
              className="text-[13px] text-foreground flex-1"
            />
            {editable && (
              <button
                onClick={onDelete}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground/60 hover:text-destructive transition-all"
                title="Delete task"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>
          {/* Client-facing label (issue #13): only override when the internal
              description uses jargon a homeowner wouldn't read. */}
          <EditableTextCell
            value={item.client_name ?? ""}
            onCommit={(v) => onUpdate({ client_name: v.trim() || null })}
            disabled={!editable}
            className="text-[10.5px] italic text-muted-foreground/70 font-normal pl-0"
            placeholder="Client label (optional)"
          />
        </div>
      </td>

      {/* Crew */}
      <td className="px-2 py-1 text-right border-b border-border bg-card group-hover:bg-accent transition-colors">
        <EditableNumberCell
          value={item.crew_days ?? null}
          onCommit={(v) => onUpdate({ crew_days: v ?? null })}
          disabled={!editable}
          className="text-[12px] tabular-nums text-muted-foreground tabular-nums w-full text-right"
          placeholder="—"
        />
      </td>

      {/* Man-days */}
      <td className="px-2 py-1 text-right border-b border-border bg-card group-hover:bg-accent transition-colors">
        <EditableNumberCell
          value={item.man_days ?? null}
          onCommit={(v) => onManDaysChange(v)}
          disabled={!editable}
          className="text-[12px] tabular-nums text-muted-foreground tabular-nums w-full text-right"
          placeholder="—"
        />
      </td>

      {/* Labor $ */}
      <td className="px-2 py-1 text-right border-b border-r border-border bg-card group-hover:bg-accent transition-colors">
        <EditableNumberCell
          value={laborDisplay > 0 ? laborDisplay : null}
          onCommit={(v) => onUpdate({ labor_cost: v ?? 0 })}
          disabled={!editable}
          className="text-[12px] tabular-nums text-foreground tabular-nums w-full text-right"
          placeholder="—"
        />
      </td>

      {/* Spacer between summary block and Gantt grid */}
      <td className="border-b border-border bg-background w-[12px]" />

      {/* Day cells — Gantt pills */}
      {days.map((d, i) => {
        const crew = dailyWorkers[d] ?? 0;
        const prev = i > 0 ? days[i - 1] : null;
        const next = i < days.length - 1 ? days[i + 1] : null;
        const isStart = crew > 0 && (!prev || !activeOnDay(prev));
        const isEnd = crew > 0 && (!next || !activeOnDay(next));
        const weekend = isWeekend(d);
        const firstOfMonth = new Date(d + "T00:00:00Z").getUTCDate() === 1;

        return (
          <DayGanttCell
            key={d}
            crew={crew}
            isStart={isStart}
            isEnd={isEnd}
            weekend={weekend}
            firstOfMonth={firstOfMonth}
            editable={editable}
            onCommit={(v) => onDayCellChange(d, v)}
          />
        );
      })}
    </tr>
  );
}

// ─── Gantt day cell ──────────────────────────────────────────────────────────
//
// Visual model: the cell is the underlying grid square (carries the border).
// When crew > 0, an inner "pill" floats inside it filled with the amber accent.
// Adjacent active cells in the same row form a continuous bar because the pill
// extends edge-to-edge horizontally (no gaps), with rounded corners only on
// the first/last active day of the run. The crew count sits centered inside.

type DayGanttCellProps = {
  crew: number;
  isStart: boolean;
  isEnd: boolean;
  weekend: boolean;
  firstOfMonth: boolean;
  editable: boolean;
  onCommit: (v: number | null) => void;
};

function DayGanttCell({ crew, isStart, isEnd, weekend, firstOfMonth, editable, onCommit }: DayGanttCellProps) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState<string>(crew > 0 ? String(crew) : "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setLocal(crew > 0 ? String(crew) : "");
  }, [crew, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = () => {
    const trimmed = local.trim();
    const next: number | null = trimmed === "" ? null : Number(trimmed);
    if (next !== null && (Number.isNaN(next) || next < 0)) {
      setLocal(crew > 0 ? String(crew) : "");
      setEditing(false);
      return;
    }
    setEditing(false);
    if (next !== crew && !(next === null && crew === 0)) {
      onCommit(next);
    }
  };

  const active = crew > 0;
  // Pill geometry: full-bleed horizontally so neighbours touch; rounded only on bar ends.
  const pillClass = cn(
    "absolute inset-y-1.5 inset-x-0 flex items-center justify-center transition-colors",
    active && "bg-primary/85 shadow-[inset_0_-1px_0_0_hsl(var(--primary)/0.4)]",
    isStart && "rounded-l-md ml-0.5",
    isEnd && "rounded-r-md mr-0.5"
  );

  return (
    <td
      className={cn(
        "relative p-0 align-middle border-b border-border h-[40px] min-w-[34px]",
        weekend && !active && "bg-muted/30",
        firstOfMonth && "border-l-2 border-l-border",
        !firstOfMonth && "border-l border-l-border/40",
        editable && "cursor-pointer hover:bg-accent/40 transition-colors"
      )}
      onClick={() => {
        if (!editable) return;
        setEditing(true);
      }}
    >
      {/* Pill bar */}
      {active && <div className={pillClass} aria-hidden />}

      {/* Crew number or input */}
      <div className="relative h-full w-full flex items-center justify-center">
        {editing ? (
          <input
            ref={inputRef}
            type="text"
            inputMode="decimal"
            value={local}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setLocal(e.target.value)}
            onBlur={commit}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e: ReactKeyboardEvent<HTMLInputElement>) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") {
                setLocal(crew > 0 ? String(crew) : "");
                setEditing(false);
              }
            }}
            className={cn(
              "absolute inset-1 w-[calc(100%-8px)] text-center text-[11px] tabular-nums tabular-nums rounded-md",
              "bg-card text-foreground outline-none ring-1 ring-primary/60 focus:ring-primary"
            )}
          />
        ) : active ? (
          // Amber pill is bright in both themes → fixed near-black for legibility
          <span className="text-[11px] tabular-nums font-semibold tabular-nums text-primary-foreground select-none">
            {crew}
          </span>
        ) : (
          <span className="text-[10px] tabular-nums text-muted-foreground/0 select-none">·</span>
        )}
      </div>
    </td>
  );
}

// ─── Editable text + number cells ────────────────────────────────────────────

type EditableTextCellProps = {
  value: string;
  onCommit: (v: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
};

function EditableTextCell({ value, onCommit, disabled, className, placeholder }: EditableTextCellProps) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);

  if (disabled) {
    return <span className={className}>{local || (placeholder ?? "")}</span>;
  }
  return (
    <input
      type="text"
      value={local}
      placeholder={placeholder}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => { if (local !== value) onCommit(local); }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      className={cn(
        "bg-transparent border-0 outline-none focus:bg-accent/60 focus:ring-1 focus:ring-ring rounded-md px-1",
        className
      )}
    />
  );
}

type EditableNumberCellProps = {
  value: number | null;
  onCommit: (v: number | null) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  prefix?: string;
  suffix?: string;
};

function EditableNumberCell({
  value, onCommit, disabled, className, placeholder, prefix, suffix,
}: EditableNumberCellProps) {
  const [local, setLocal] = useState(value == null ? "" : String(value));
  const lastCommitted = useRef(value);
  useEffect(() => {
    if (value !== lastCommitted.current) {
      setLocal(value == null ? "" : String(value));
      lastCommitted.current = value;
    }
  }, [value]);

  const commit = () => {
    const trimmed = local.trim();
    const next: number | null = trimmed === "" ? null : Number(trimmed);
    if (next !== null && Number.isNaN(next)) {
      setLocal(value == null ? "" : String(value));
      return;
    }
    if (next !== value) {
      lastCommitted.current = next;
      onCommit(next);
    }
  };

  if (disabled) {
    const display = value == null ? (placeholder ?? "—") : `${prefix ?? ""}${value}${suffix ?? ""}`;
    return <span className={className}>{display}</span>;
  }

  return (
    <div className="relative inline-block w-full">
      {prefix && <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/70 pointer-events-none">{prefix}</span>}
      <input
        type="text"
        inputMode="decimal"
        value={local}
        placeholder={placeholder}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e: ReactKeyboardEvent<HTMLInputElement>) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setLocal(value == null ? "" : String(value));
            (e.target as HTMLInputElement).blur();
          }
        }}
        className={cn(
          "bg-transparent border-0 outline-none focus:bg-accent/60 focus:ring-1 focus:ring-ring rounded-md",
          className,
          prefix && "pl-4",
          suffix && "pr-5"
        )}
      />
      {suffix && <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/70 pointer-events-none">{suffix}</span>}
    </div>
  );
}

// ─── Estimate-level toolbar input ────────────────────────────────────────────

type EstimateNumberInputProps = {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  disabled?: boolean;
  prefix?: string;
  suffix?: string;
};

function EstimateNumberInput({ label, value, onChange, disabled, prefix, suffix }: EstimateNumberInputProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-mono text-muted-foreground/70 uppercase tracking-widest">{label}</span>
      <div className="w-[90px]">
        <EditableNumberCell
          value={value}
          onCommit={onChange}
          disabled={disabled}
          className="text-[12px] tabular-nums text-foreground tabular-nums w-full text-right py-0.5 px-1 bg-muted/40 rounded-md"
          placeholder="—"
          prefix={prefix}
          suffix={suffix}
        />
      </div>
    </div>
  );
}

// ─── Date helpers ────────────────────────────────────────────────────────────

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function isWeekend(iso: string): boolean {
  const dow = new Date(iso + "T00:00:00Z").getUTCDay();
  return dow === 0 || dow === 6;
}
