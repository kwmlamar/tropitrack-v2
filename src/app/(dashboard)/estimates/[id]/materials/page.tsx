"use client";

/**
 * Materials Calc tab — takeoff-level material lines per section.
 *
 * Mirrors dad's Excel "Materials Calcs" sheet: each work section enumerates
 * every physical material being purchased (135 CMU blocks, 25 bags of cement,
 * etc.) with qty × unit_cost × markup → sell. The Excel sheet's section
 * subtotals roll up to the estimate; this view follows the same pattern.
 *
 * Schema: rows live in `estimate_section_materials` (see migration
 * 20260604_section_materials_takeoff). Snapshot contract: description / unit /
 * unit_cost are copied from the catalog on add; catalog price changes don't
 * mutate existing rows. See memory file project_bedrock_materials_calc_design.md.
 */

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { canAccessMaterialsCalc } from "@/lib/permissions";
import {
  computeSectionMaterialCost,
  computeSectionMaterialSell,
  type Estimate,
  type EstimateSectionMaterial,
} from "@/types";

type Section = {
  id: string;
  estimate_id: string;
  name: string;
  /** Optional client-facing label override — see issue #13. */
  client_name?: string | null;
  order_index: number;
};

type CatalogMaterial = {
  id: string;
  name: string;
  unit: string;
  unit_cost: number;
  category: string;
  division_name?: string | null;
};

const COMMON_UNITS = ["EACH", "BAG", "LENGTHS", "SHEET", "CUYD", "SQFT", "LNFT", "GAL", "HR"];

export default function MaterialsCalcPage() {
  const params = useParams();
  const router = useRouter();
  const estimateId = params.id as string;
  const { toast } = useToast();
  const { profile, loading: authLoading } = useAuth();
  const supabase = createClient();

  // Role gate
  useEffect(() => {
    if (authLoading) return;
    if (!canAccessMaterialsCalc(profile)) router.replace(`/estimates/${estimateId}`);
  }, [authLoading, profile, estimateId, router]);

  const [loading, setLoading] = useState(true);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [lines, setLines] = useState<EstimateSectionMaterial[]>([]);
  const [catalog, setCatalog] = useState<CatalogMaterial[]>([]);
  const [savingCount, setSavingCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [estRes, secRes, linesRes, catRes] = await Promise.all([
          supabase.from("estimates").select("*").eq("id", estimateId).single(),
          supabase.from("estimate_sections").select("id,estimate_id,name,order_index")
            .eq("estimate_id", estimateId).order("order_index"),
          supabase.from("estimate_section_materials").select("*")
            .order("order_index"),
          supabase.from("materials").select("id,name,unit,unit_cost,category,division_name")
            .order("name"),
        ]);
        if (cancelled) return;
        if (estRes.error) throw estRes.error;
        setEstimate(estRes.data);
        const secs = (secRes.data as Section[]) || [];
        setSections(secs);
        // Filter section materials to ones belonging to this estimate's sections
        const secIds = new Set(secs.map((s) => s.id));
        setLines(((linesRes.data as EstimateSectionMaterial[]) || []).filter((l) => secIds.has(l.section_id)));
        setCatalog((catRes.data as CatalogMaterial[]) || []);
      } catch (err: any) {
        if (!cancelled) toast({ title: "Failed to load", description: err.message, variant: "destructive" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estimateId]);

  const isEditable = !!estimate && estimate.status === "draft";

  const trackSave = async <T,>(fn: () => Promise<T>): Promise<T | null> => {
    setSavingCount((n) => n + 1);
    try { return await fn(); }
    catch (err: any) { toast({ title: "Save failed", description: err.message, variant: "destructive" }); return null; }
    finally { setSavingCount((n) => Math.max(0, n - 1)); }
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

  const updateLine = async (id: string, patch: Partial<EstimateSectionMaterial>) => {
    const prev = lines;
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    const ok = await trackSave(async () => {
      const { error } = await supabase.from("estimate_section_materials").update(patch).eq("id", id);
      if (error) throw error;
      return true;
    });
    if (!ok) setLines(prev);
  };

  const deleteLine = async (id: string) => {
    if (!isEditable) return;
    const prev = lines;
    setLines((ls) => ls.filter((l) => l.id !== id));
    const ok = await trackSave(async () => {
      const { error } = await supabase.from("estimate_section_materials").delete().eq("id", id);
      if (error) throw error;
      return true;
    });
    if (!ok) setLines(prev);
  };

  const addLine = async (sectionId: string, opts: {
    catalog?: CatalogMaterial;
    isEquipment?: boolean;
  } = {}) => {
    if (!isEditable) return;
    const existing = lines.filter((l) => l.section_id === sectionId);
    const order = existing.length > 0
      ? Math.max(...existing.map((l) => l.order_index ?? 0)) + 1
      : 0;
    const payload = {
      section_id: sectionId,
      material_id: opts.catalog?.id ?? null,
      description: opts.catalog?.name ?? "",
      quantity: 1,
      unit: opts.catalog?.unit ?? null,
      unit_cost: opts.catalog ? Number(opts.catalog.unit_cost) : 0,
      markup_pct: null,
      is_equipment: opts.isEquipment ?? false,
      order_index: order,
    };
    const { data, error } = await supabase
      .from("estimate_section_materials")
      .insert(payload)
      .select()
      .single();
    if (error) {
      toast({ title: "Couldn't add", description: error.message, variant: "destructive" });
      return;
    }
    setLines((ls) => [...ls, data as EstimateSectionMaterial]);
  };

  // ── Derived ──
  const linesBySection = useMemo(() => {
    const map: Record<string, EstimateSectionMaterial[]> = {};
    for (const l of lines) (map[l.section_id] ??= []).push(l);
    for (const k of Object.keys(map)) map[k].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
    return map;
  }, [lines]);

  const sectionCost = (sectionId: string): number =>
    (linesBySection[sectionId] ?? []).reduce((s, l) => s + computeSectionMaterialCost(l), 0);
  const sectionSell = (sectionId: string): number =>
    estimate ? (linesBySection[sectionId] ?? []).reduce((s, l) => s + computeSectionMaterialSell(l, estimate), 0) : 0;

  const totalCost = lines.reduce((s, l) => s + computeSectionMaterialCost(l), 0);
  const totalSell = estimate ? lines.reduce((s, l) => s + computeSectionMaterialSell(l, estimate), 0) : 0;
  const totalMarkup = totalSell - totalCost;

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!canAccessMaterialsCalc(profile)) return null;
  if (!estimate) return null;

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="px-6 py-4 flex items-center gap-4">
          <Link href={`/estimates/${estimateId}`} className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-mono text-muted-foreground/70 uppercase tracking-widest">
              {estimate.estimate_number ?? "Estimate"} · Materials Calc
            </div>
            <h1 className="text-[16px] font-semibold truncate">{estimate.title || "Untitled estimate"}</h1>
          </div>
          <div className="flex items-center gap-2 text-[11px] tabular-nums">
            <Link href={`/estimates/${estimateId}/builder`} className="px-2.5 py-1 rounded-md text-muted-foreground hover:text-foreground transition-colors">
              Builder
            </Link>
            <span className="px-2.5 py-1 rounded-md bg-muted text-brand">Materials</span>
            <Link href={`/estimates/${estimateId}/preview`} className="px-2.5 py-1 rounded-md text-muted-foreground hover:text-foreground transition-colors">
              Preview
            </Link>
          </div>
        </div>
      </div>

      <div className="flex-1 p-6 space-y-6">
        {/* Formula banner */}
        <div className="rounded-lg border border-border bg-card px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-muted-foreground/70 uppercase tracking-widest">Material markup</span>
              <div className="w-[70px]">
                <EditableNumber
                  value={estimate.default_material_markup_pct ?? null}
                  onCommit={(v) => updateEstimate({ default_material_markup_pct: v ?? 0 })}
                  disabled={!isEditable}
                  className="text-[13px] tabular-nums text-foreground tabular-nums w-full text-right py-0.5 px-1 bg-muted/40 rounded-md"
                  placeholder="0"
                  suffix="%"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-muted-foreground/70 uppercase tracking-widest">Equip. markup</span>
              <div className="w-[70px]">
                <EditableNumber
                  value={estimate.default_equipment_markup_pct ?? null}
                  onCommit={(v) => updateEstimate({ default_equipment_markup_pct: v ?? 0 })}
                  disabled={!isEditable}
                  className="text-[13px] tabular-nums text-foreground tabular-nums w-full text-right py-0.5 px-1 bg-muted/40 rounded-md"
                  placeholder="0"
                  suffix="%"
                />
              </div>
            </div>
          </div>
          <span className="text-[11px] tabular-nums text-muted-foreground/70">
            Sell = qty × unit cost × (1 + markup% / 100)
          </span>
        </div>

        {/* Table */}
        {sections.length === 0 ? (
          <div className="rounded-lg border border-border bg-card py-12 text-center">
            <p className="text-[13px] text-muted-foreground">No sections on this estimate yet.</p>
            <p className="text-[11px] text-muted-foreground/60 mt-1.5">
              Add sections via the{" "}
              <Link href={`/estimates/${estimateId}/builder`} className="underline hover:text-foreground">
                builder
              </Link>.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <span className="text-[11px] font-mono text-muted-foreground/70 uppercase tracking-widest">
                Materials & Equipment
              </span>
              <div className="flex items-center gap-4 text-[11px] tabular-nums text-muted-foreground">
                <span>{sections.length} section{sections.length === 1 ? "" : "s"} · {lines.length} line item{lines.length === 1 ? "" : "s"}</span>
                {savingCount > 0 && (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin" /> Saving…
                  </span>
                )}
              </div>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70 w-[34%]">Description</th>
                  <th className="px-2 py-2.5 text-right text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70 w-[8%]">Qty</th>
                  <th className="px-2 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70 w-[8%]">Unit</th>
                  <th className="px-2 py-2.5 text-right text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70 w-[12%]">Unit cost</th>
                  <th className="px-2 py-2.5 text-right text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70 w-[8%]">Markup</th>
                  <th className="px-2 py-2.5 text-right text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70 w-[12%]">Cost</th>
                  <th className="px-2 py-2.5 text-right text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70 w-[12%]">Sell</th>
                  <th className="border-b border-border w-[40px]" />
                </tr>
              </thead>
              <tbody>
                {sections.map((sec) => {
                  const items = linesBySection[sec.id] ?? [];
                  return (
                    <Fragment key={sec.id}>
                      <SectionHeaderRow
                        name={sec.name}
                        cost={sectionCost(sec.id)}
                        sell={sectionSell(sec.id)}
                        itemCount={items.length}
                        editable={isEditable}
                        onAdd={(opts) => addLine(sec.id, opts)}
                        catalog={catalog}
                      />
                      {items.map((line) => (
                        <MaterialRow
                          key={line.id}
                          line={line}
                          estimate={estimate}
                          editable={isEditable}
                          onUpdate={(patch) => updateLine(line.id, patch)}
                          onDelete={() => deleteLine(line.id)}
                        />
                      ))}
                      {items.length === 0 && (
                        <tr>
                          <td colSpan={8} className="px-4 py-3 pl-10 text-[11px] italic text-muted-foreground">
                            No materials yet. {isEditable && (
                              <button
                                onClick={() => addLine(sec.id, { isEquipment: false })}
                                className="underline hover:text-foreground"
                              >
                                Add one
                              </button>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}

                {/* Footer totals */}
                <tr className="border-t-2 border-border bg-muted/40">
                  <td className="px-4 py-3 text-[12px] font-semibold text-foreground">Totals</td>
                  <td colSpan={4} />
                  <td className="px-2 py-3 text-right text-[13px] tabular-nums text-foreground font-semibold tabular-nums">
                    {formatCurrency(totalCost)}
                  </td>
                  <td className="px-2 py-3 text-right text-[14px] tabular-nums text-brand font-semibold tabular-nums">
                    {formatCurrency(totalSell)}
                  </td>
                  <td />
                </tr>
                <tr className="bg-muted/40">
                  <td colSpan={5} />
                  <td className="px-2 pb-3 text-right text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70">
                    +markup
                  </td>
                  <td className="px-2 pb-3 text-right text-[11px] tabular-nums text-muted-foreground tabular-nums">
                    +{formatCurrency(totalMarkup)}
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Section header row + add affordance ────────────────────────────────────

type SectionHeaderRowProps = {
  name: string;
  cost: number;
  sell: number;
  itemCount: number;
  editable: boolean;
  onAdd: (opts: { catalog?: CatalogMaterial; isEquipment?: boolean }) => void;
  catalog: CatalogMaterial[];
};

function SectionHeaderRow({ name, cost, sell, itemCount, editable, onAdd, catalog }: SectionHeaderRowProps) {
  const [addOpen, setAddOpen] = useState(false);

  return (
    <tr className="bg-muted/40">
      <td className="px-4 py-2.5 text-[12.5px] font-semibold text-foreground">
        <div className="flex items-center gap-3 relative">
          <span>{name}</span>
          <span className="text-[10px] tabular-nums text-muted-foreground/70">
            {itemCount} line{itemCount === 1 ? "" : "s"}
          </span>
          {editable && (
            <>
              <button
                onClick={() => setAddOpen((v) => !v)}
                className="ml-2 inline-flex items-center gap-1 text-[10px] tabular-nums text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded-md hover:bg-accent"
              >
                <Plus className="h-3 w-3" />
                Add
              </button>
              {addOpen && (
                <AddMaterialMenu
                  catalog={catalog}
                  onSelect={(opts) => {
                    onAdd(opts);
                    setAddOpen(false);
                  }}
                  onClose={() => setAddOpen(false)}
                />
              )}
            </>
          )}
        </div>
      </td>
      <td colSpan={4} className="px-2 py-2.5" />
      <td className="px-2 py-2.5 text-right text-[12px] tabular-nums text-muted-foreground tabular-nums">
        {formatCurrency(cost)}
      </td>
      <td className="px-2 py-2.5 text-right text-[12px] tabular-nums text-foreground font-semibold tabular-nums">
        {formatCurrency(sell)}
      </td>
      <td />
    </tr>
  );
}

// ─── Add affordance — catalog autocomplete + free-form ──────────────────────

type AddMaterialMenuProps = {
  catalog: CatalogMaterial[];
  onSelect: (opts: { catalog?: CatalogMaterial; isEquipment?: boolean }) => void;
  onClose: () => void;
};

function AddMaterialMenu({ catalog, onSelect, onClose }: AddMaterialMenuProps) {
  const [query, setQuery] = useState("");
  const [isEquipment, setIsEquipment] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return catalog.slice(0, 25);
    return catalog
      .filter((m) =>
        m.name.toLowerCase().includes(q) ||
        m.category?.toLowerCase().includes(q) ||
        m.division_name?.toLowerCase().includes(q),
      )
      .slice(0, 25);
  }, [query, catalog]);

  return (
    <div
      ref={ref}
      className="absolute top-full left-0 mt-1 w-[420px] z-30 rounded-md border border-border bg-popover shadow-lg overflow-hidden"
    >
      {/* Toggle: material vs equipment */}
      <div className="flex border-b border-border bg-muted/40">
        <button
          onClick={() => setIsEquipment(false)}
          className={cn(
            "flex-1 px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider transition-colors",
            !isEquipment ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          Material
        </button>
        <button
          onClick={() => setIsEquipment(true)}
          className={cn(
            "flex-1 px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider transition-colors",
            isEquipment ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          Equipment
        </button>
      </div>

      {/* Search input */}
      <div className="relative border-b border-border">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
          placeholder="Search catalog or type description…"
          onKeyDown={(e: ReactKeyboardEvent<HTMLInputElement>) => {
            if (e.key === "Escape") onClose();
            if (e.key === "Enter" && query.trim()) {
              // Free-form add — no catalog match
              onSelect({ isEquipment });
            }
          }}
          className="w-full pl-8 pr-3 py-2 text-[12px] bg-transparent outline-none placeholder:text-muted-foreground/60"
        />
      </div>

      {/* Results */}
      <div className="max-h-[280px] overflow-y-auto">
        {filtered.length === 0 ? (
          <button
            onClick={() => onSelect({ isEquipment })}
            className="w-full px-3 py-3 text-left text-[12px] text-muted-foreground hover:bg-accent transition-colors"
          >
            No catalog match. <span className="text-foreground">Add as custom line →</span>
          </button>
        ) : (
          filtered.map((m) => (
            <button
              key={m.id}
              onClick={() => onSelect({ catalog: m, isEquipment })}
              className="w-full px-3 py-2 flex items-baseline justify-between gap-3 text-left hover:bg-accent transition-colors border-b border-border/40 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <div className="text-[12px] text-foreground truncate">{m.name}</div>
                <div className="text-[10px] tabular-nums text-muted-foreground/70">
                  {m.category} {m.unit && `· ${m.unit}`}
                </div>
              </div>
              <div className="text-[12px] tabular-nums text-muted-foreground tabular-nums whitespace-nowrap">
                {formatCurrency(Number(m.unit_cost))}
              </div>
            </button>
          ))
        )}
      </div>

      {/* Bottom: free-form quick-add */}
      <div className="border-t border-border bg-muted/40">
        <button
          onClick={() => onSelect({ isEquipment })}
          className="w-full px-3 py-2 text-left text-[11px] tabular-nums text-muted-foreground hover:text-foreground transition-colors"
        >
          + Add blank line {isEquipment && <span className="text-brand">(equipment)</span>}
        </button>
      </div>
    </div>
  );
}

// ─── Material row — inline editable ─────────────────────────────────────────

type MaterialRowProps = {
  line: EstimateSectionMaterial;
  estimate: Estimate;
  editable: boolean;
  onUpdate: (patch: Partial<EstimateSectionMaterial>) => void;
  onDelete: () => void;
};

function MaterialRow({ line, estimate, editable, onUpdate, onDelete }: MaterialRowProps) {
  const cost = computeSectionMaterialCost(line);
  const sell = computeSectionMaterialSell(line, estimate);
  const fallbackMarkup = line.is_equipment
    ? (estimate.default_equipment_markup_pct ?? 0)
    : (estimate.default_material_markup_pct ?? 0);
  const resolvedMarkup = line.markup_pct != null ? Number(line.markup_pct) : Number(fallbackMarkup);

  return (
    <tr className="border-t border-border/40 hover:bg-accent/30 group">
      <td className="px-4 py-2 pl-8">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <EditableText
              value={line.description}
              onCommit={(v) => onUpdate({ description: v })}
              disabled={!editable}
              className="text-[12.5px] text-foreground flex-1"
              placeholder="(no description)"
            />
            {line.is_equipment && (
              <span className="text-[9px] font-mono uppercase tracking-wider text-brand/80 px-1 rounded-full border border-primary/30">
                equip
              </span>
            )}
            {line.material_id && (
              <span className="text-[10px] tabular-nums text-muted-foreground/50" title="Linked to catalog">⇄</span>
            )}
          </div>
          {/* Client-facing label (issue #13). */}
          <EditableText
            value={line.client_name ?? ""}
            onCommit={(v) => onUpdate({ client_name: v.trim() || null })}
            disabled={!editable}
            className="text-[10.5px] italic text-muted-foreground/70 font-normal"
            placeholder="Client label (optional)"
          />
        </div>
      </td>
      <td className="px-2 py-2 text-right">
        <EditableNumber
          value={line.quantity}
          onCommit={(v) => onUpdate({ quantity: v ?? 0 })}
          disabled={!editable}
          className="text-[12px] tabular-nums text-foreground tabular-nums w-full text-right"
        />
      </td>
      <td className="px-2 py-2">
        <EditableSelect
          value={line.unit ?? ""}
          options={COMMON_UNITS}
          onCommit={(v) => onUpdate({ unit: v || null })}
          disabled={!editable}
          className="text-[12px] tabular-nums text-muted-foreground w-full"
        />
      </td>
      <td className="px-2 py-2 text-right">
        <EditableNumber
          value={line.unit_cost}
          onCommit={(v) => onUpdate({ unit_cost: v ?? 0 })}
          disabled={!editable}
          className="text-[12px] tabular-nums text-foreground tabular-nums w-full text-right"
          prefix="$"
        />
      </td>
      <td className="px-2 py-2 text-right">
        <EditableNumber
          value={line.markup_pct ?? null}
          onCommit={(v) => onUpdate({ markup_pct: v })}
          disabled={!editable}
          className={cn(
            "text-[12px] tabular-nums tabular-nums w-full text-right",
            line.markup_pct != null ? "text-brand" : "text-muted-foreground/70",
          )}
          placeholder={`${resolvedMarkup}%`}
          suffix="%"
        />
      </td>
      <td className="px-2 py-2 text-right text-[12px] tabular-nums text-muted-foreground tabular-nums">
        {cost > 0 ? formatCurrency(cost) : "—"}
      </td>
      <td className="px-2 py-2 text-right text-[12.5px] tabular-nums text-foreground font-semibold tabular-nums">
        {sell > 0 ? formatCurrency(sell) : "—"}
      </td>
      <td className="px-2 py-2 text-right">
        {editable && (
          <button
            onClick={onDelete}
            className="opacity-0 group-hover:opacity-100 text-muted-foreground/60 hover:text-destructive transition-all"
            title="Delete"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </td>
    </tr>
  );
}

// ─── Editable primitives ────────────────────────────────────────────────────

function EditableText({
  value, onCommit, disabled, className, placeholder,
}: {
  value: string;
  onCommit: (v: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  if (disabled) return <span className={className}>{local || (placeholder ?? "")}</span>;
  return (
    <input
      type="text"
      value={local}
      placeholder={placeholder}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => { if (local !== value) onCommit(local); }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      className={cn("bg-transparent border-0 outline-none focus:bg-accent/60 focus:ring-1 focus:ring-ring rounded-md px-1", className)}
    />
  );
}

function EditableNumber({
  value, onCommit, disabled, className, placeholder, prefix, suffix,
}: {
  value: number | null;
  onCommit: (v: number | null) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  prefix?: string;
  suffix?: string;
}) {
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
      {prefix && <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/70 pointer-events-none">{prefix}</span>}
      <input
        type="text"
        inputMode="decimal"
        value={local}
        placeholder={placeholder}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") { setLocal(value == null ? "" : String(value)); (e.target as HTMLInputElement).blur(); }
        }}
        className={cn(
          "bg-transparent border-0 outline-none focus:bg-accent/60 focus:ring-1 focus:ring-ring rounded-md",
          prefix && "pl-3.5",
          suffix && "pr-3",
          className,
        )}
      />
      {suffix && <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/70 pointer-events-none">{suffix}</span>}
    </div>
  );
}

function EditableSelect({
  value, options, onCommit, disabled, className,
}: {
  value: string;
  options: string[];
  onCommit: (v: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  const listId = "units-shared";
  if (disabled) return <span className={className}>{value || "—"}</span>;
  return (
    <>
      <input
        type="text"
        list={listId}
        value={local}
        onChange={(e) => setLocal(e.target.value.toUpperCase())}
        onBlur={() => { if (local !== value) onCommit(local); }}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        placeholder="—"
        className={cn(
          "bg-transparent border-0 outline-none focus:bg-accent/60 focus:ring-1 focus:ring-ring rounded-md px-1",
          className,
        )}
      />
      <datalist id={listId}>
        {options.map((o) => <option key={o} value={o} />)}
      </datalist>
    </>
  );
}
