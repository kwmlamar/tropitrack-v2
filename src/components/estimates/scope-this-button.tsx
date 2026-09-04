"use client";

/**
 * Issue #9 — "Scope this with Claude" button + intake modal + review modal.
 *
 * Lives on the estimate summary view (`/estimates/[id]/page.tsx`) empty state.
 * Calls /api/estimates/generate to produce Claude's structured scope, lets the
 * user review, then calls /api/estimates/[id]/apply-scope to write it.
 *
 * Permission gated upstream via canSeeCosts(profile) — workers don't see the
 * button at all.
 */

import { Fragment, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";

// ─── Shape of /api/estimates/generate response ──────────────────────────────
type GenItem = {
  description: string;
  client_name?: string | null;
  unit?: string | null;
  quantity: number;
  man_days: number;
  notes?: string | null;
};
type GenMaterial = {
  description: string;
  client_name?: string | null;
  quantity: number;
  unit?: string | null;
  unit_cost: number;
  is_equipment: boolean;
  material_id?: string | null;
  notes?: string | null;
};
type GenSection = {
  name: string;
  client_name?: string | null;
  duration_days: number;
  items: GenItem[];
  materials: GenMaterial[];
};
type GenResponse = {
  property_name?: string | null;
  sections: GenSection[];
};

interface Props {
  estimateId: string;
  /** Default labor sell rate for the post-Apply estimate update. ODS default 180. */
  defaultLaborSellRatePerDay?: number;
  /** Markup defaults from the estimate row — used to preview material sell amounts. */
  defaultMaterialMarkupPct?: number;
  defaultEquipmentMarkupPct?: number;
  /** Called after a successful Apply so the parent can refetch. */
  onApplied?: () => void;
}

type Phase = "idle" | "intake" | "generating" | "review" | "applying";

const ISO_TODAY = () => new Date().toISOString().slice(0, 10);

export function ScopeThisButton({
  estimateId,
  defaultLaborSellRatePerDay = 180,
  defaultMaterialMarkupPct = 0,
  defaultEquipmentMarkupPct = 0,
  onApplied,
}: Props) {
  const { toast } = useToast();
  const [phase, setPhase] = useState<Phase>("idle");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState<string>(ISO_TODAY());
  const [laborRate, setLaborRate] = useState<number>(defaultLaborSellRatePerDay);
  const [proposal, setProposal] = useState<GenResponse | null>(null);

  const open = () => {
    setDescription("");
    setStartDate(ISO_TODAY());
    setLaborRate(defaultLaborSellRatePerDay);
    setProposal(null);
    setPhase("intake");
  };

  const close = () => setPhase("idle");

  const generate = async () => {
    if (!description.trim()) {
      toast({ title: "Describe the scope first", variant: "destructive" });
      return;
    }
    if (!startDate) {
      toast({ title: "Start date required", variant: "destructive" });
      return;
    }
    setPhase("generating");
    try {
      const res = await fetch("/api/estimates/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, materials: [] }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        toast({
          title: "Claude couldn't generate",
          description: err.error || "Unknown error",
          variant: "destructive",
        });
        setPhase("intake");
        return;
      }
      const json = (await res.json()) as GenResponse;
      if (!json.sections || json.sections.length === 0) {
        toast({
          title: "Empty response",
          description: "Claude returned no sections. Try a more detailed description.",
          variant: "destructive",
        });
        setPhase("intake");
        return;
      }
      setProposal(json);
      setPhase("review");
    } catch (e) {
      toast({
        title: "Network error",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
      setPhase("intake");
    }
  };

  const apply = async () => {
    if (!proposal) return;
    setPhase("applying");
    try {
      const res = await fetch(`/api/estimates/${estimateId}/apply-scope`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_start_date: startDate,
          labor_sell_rate_per_day: laborRate,
          sections: proposal.sections,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        toast({
          title: "Failed to apply",
          description:
            (err.details && JSON.stringify(err.details)) || err.error || "Unknown error",
          variant: "destructive",
        });
        setPhase("review");
        return;
      }
      const json = await res.json();
      toast({
        title: "Estimate scoped",
        description: `${json.sections_inserted} sections, ${json.line_items_inserted} tasks, ${json.materials_inserted} materials. Total ${
          json.totals?.total_amount ? formatCurrency(Number(json.totals.total_amount)) : "—"
        }`,
        variant: "success",
      });
      onApplied?.();
      setPhase("idle");
    } catch (e) {
      toast({
        title: "Network error",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
      setPhase("review");
    }
  };

  return (
    <Fragment>
      <Button
        onClick={open}
        variant="default"
        size="sm"
        className="gap-2"
      >
        <Sparkles className="h-3.5 w-3.5" />
        Scope this with Claude
      </Button>

      {/* Intake modal */}
      <Dialog open={phase === "intake" || phase === "generating"} onOpenChange={(o) => !o && phase !== "generating" && close()}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Scope this estimate with Claude</DialogTitle>
            <DialogDescription>
              Describe the job and Claude will propose sections, tasks, and a materials takeoff. You&apos;ll review before anything writes to the estimate.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="scope-desc">Job description</Label>
              <Textarea
                id="scope-desc"
                rows={6}
                placeholder='e.g. "Three-bedroom block house, 1800 sqft, Eleuthera, foundation through roof. Hip roof with asphalt shingles, impact windows + doors, basic electrical, no plumbing or AC."'
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={phase === "generating"}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="scope-start">Start date</Label>
                <Input
                  id="scope-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  disabled={phase === "generating"}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="scope-rate">Labor rate ($/day)</Label>
                <Input
                  id="scope-rate"
                  type="number"
                  min={0}
                  step={10}
                  value={laborRate}
                  onChange={(e) => setLaborRate(Number(e.target.value) || 0)}
                  disabled={phase === "generating"}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close} disabled={phase === "generating"}>
              Cancel
            </Button>
            <Button onClick={generate} disabled={phase === "generating"} className="gap-2">
              {phase === "generating" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {phase === "generating" ? "Claude is scoping…" : "Generate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Review modal */}
      <Dialog open={phase === "review" || phase === "applying"} onOpenChange={(o) => !o && phase !== "applying" && close()}>
        <DialogContent className="sm:max-w-[760px] max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Review Claude&apos;s proposal</DialogTitle>
            <DialogDescription>
              {proposal?.property_name && <span>Detected: {proposal.property_name}. </span>}
              {proposal?.sections.length ?? 0} sections, dates chain from {startDate}. Apply writes everything to the estimate; Discard cancels.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto py-2 space-y-4">
            {proposal?.sections.map((sec, sIdx) => {
              const sectionLabor = sec.items.reduce((s, it) => s + it.man_days * laborRate, 0);
              const sectionMatsSell = sec.materials.reduce((s, m) => {
                const markup = m.is_equipment ? defaultEquipmentMarkupPct : defaultMaterialMarkupPct;
                return s + m.quantity * m.unit_cost * (1 + markup / 100);
              }, 0);
              const sectionTotal = sectionLabor + sectionMatsSell;
              return (
                <div key={sIdx} className="border border-border rounded-md overflow-hidden">
                  <div className="bg-muted px-3 py-2 flex items-baseline justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold text-foreground truncate">
                        {sec.name}
                      </div>
                      {sec.client_name && (
                        <div className="text-[11px] italic text-muted-foreground/80 mt-0.5 truncate">
                          Client label: {sec.client_name}
                        </div>
                      )}
                    </div>
                    <div className="text-[10px] tabular-nums text-muted-foreground flex-shrink-0">
                      {sec.duration_days}d · {sec.items.length} tasks · {sec.materials.length} mats
                    </div>
                    <div className="text-[13px] font-semibold tabular-nums text-foreground flex-shrink-0">
                      {formatCurrency(sectionTotal)}
                    </div>
                  </div>
                  {sec.items.length > 0 && (
                    <div className="px-3 py-2 border-t border-border/60">
                      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1.5">Labor tasks</div>
                      <ul className="space-y-1">
                        {sec.items.map((it, i) => (
                          <li key={i} className="text-[12px] text-foreground/90 flex items-baseline justify-between gap-3">
                            <span className="flex-1 min-w-0 truncate">{it.description}</span>
                            <span className="tabular-nums text-muted-foreground flex-shrink-0">
                              {it.man_days} md
                            </span>
                            <span className="tabular-nums tabular-nums text-foreground/80 flex-shrink-0 w-20 text-right">
                              {formatCurrency(it.man_days * laborRate)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {sec.materials.length > 0 && (
                    <div className="px-3 py-2 border-t border-border/60">
                      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1.5">Materials takeoff</div>
                      <ul className="space-y-1">
                        {sec.materials.map((m, i) => {
                          const markup = m.is_equipment ? defaultEquipmentMarkupPct : defaultMaterialMarkupPct;
                          const sell = m.quantity * m.unit_cost * (1 + markup / 100);
                          return (
                            <li key={i} className="text-[12px] text-foreground/90 flex items-baseline justify-between gap-3">
                              <span className="flex-1 min-w-0 truncate">{m.description}</span>
                              <span className="tabular-nums text-muted-foreground flex-shrink-0">
                                {m.quantity} {m.unit ?? ""}
                              </span>
                              <span className="tabular-nums tabular-nums text-foreground/80 flex-shrink-0 w-20 text-right">
                                {formatCurrency(sell)}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close} disabled={phase === "applying"}>
              Discard
            </Button>
            <Button onClick={apply} disabled={phase === "applying"} className="gap-2">
              {phase === "applying" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {phase === "applying" ? "Applying…" : "Apply to estimate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Fragment>
  );
}
