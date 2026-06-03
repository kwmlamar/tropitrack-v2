"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import {
  ScanLine,
  Upload,
  X,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  AlertCircle,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParsedItem {
  receiptName: string;
  qty: number | null;
  unit: string | null;
  unitCost: number | null;
  totalCost: number | null;
  vendor: string | null;
  receiptDate: string | null;
  matchId: string | null;
  matchConfidence: "high" | "medium" | "low" | "none";
  suggestedDiv: string | null;
  suggestedCat: string | null;
}

interface Material {
  id: string;
  name: string;
  unit: string;
  unit_cost: number;
  division_name: string;
  category: string;
}

interface ReceiptRecord {
  id: string;
  vendor: string | null;
  receipt_date: string | null;
  total_amount: number | null;
  status: string;
  created_at: string;
}

type Phase = "idle" | "scanning" | "review";
type ApplyMode = "update" | "add";

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ReceiptsPage() {
  const { profile } = useAuth();
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [imgBase64, setImgBase64] = useState<string | null>(null);
  const [imgType, setImgType] = useState<string>("image/jpeg");
  const [items, setItems] = useState<ParsedItem[]>([]);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [modes, setModes] = useState<Record<number, ApplyMode>>({});
  const [materials, setMaterials] = useState<Material[]>([]);
  const [history, setHistory] = useState<ReceiptRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [applyLoading, setApplyLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.company_id) return;
    loadMaterials();
    loadHistory();
  }, [profile?.company_id]);

  async function loadMaterials() {
    const { data } = await supabase.from("materials").select("id,name,unit,unit_cost,division_name,category").order("name");
    setMaterials(data ?? []);
  }

  async function loadHistory() {
    const { data } = await supabase
      .from("receipts")
      .select("id,vendor,receipt_date,total_amount,status,created_at")
      .eq("company_id", profile!.company_id)
      .order("created_at", { ascending: false })
      .limit(10);
    setHistory(data ?? []);
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  function handleFile(file: File | null) {
    if (!file || !file.type.startsWith("image/")) {
      setError("Please upload a photo or image file.");
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target!.result as string;
      setImgSrc(dataUrl);
      setImgBase64(dataUrl.split(",")[1]);
      setImgType(file.type);
    };
    reader.readAsDataURL(file);
  }

  async function scan() {
    if (!imgBase64) return;
    setPhase("scanning");
    setError(null);
    try {
      const res = await fetch("/api/receipts/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: imgBase64, mediaType: imgType, materials }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Parse failed");
      if (!data.items?.length) throw new Error("No line items found — try a clearer photo.");

      const sel: Record<number, boolean> = {};
      const mds: Record<number, ApplyMode> = {};
      data.items.forEach((item: ParsedItem, i: number) => {
        sel[i] = true;
        mds[i] = item.matchId ? "update" : "add";
      });
      setItems(data.items);
      setSelected(sel);
      setModes(mds);
      setPhase("review");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("idle");
    }
  }

  async function applyChanges() {
    setApplyLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    const updates: Array<{ id: string; unit_cost: number; supplier?: string; notes: string; updated_at: string }> = [];
    const adds: Array<{
      id: string; division_code: string; division_name: string;
      category: string; name: string; unit: string;
      unit_cost: number; supplier: string; notes: string; updated_at: string;
    }> = [];

    items.forEach((item, i) => {
      if (!selected[i] || item.unitCost == null) return;
      if (modes[i] === "update" && item.matchId) {
        updates.push({
          id: item.matchId,
          unit_cost: item.unitCost,
          notes: `Updated from receipt ${item.receiptDate ?? today} @ BSD$${item.unitCost}/${item.unit}`,
          updated_at: today,
        });
      } else {
        adds.push({
          id: `R${Date.now()}_${i}`,
          division_code: item.suggestedDiv ?? "06",
          division_name: "From Receipt",
          category: item.suggestedCat ?? "Receipt Import",
          name: item.receiptName,
          unit: item.unit ?? "EA",
          unit_cost: item.unitCost,
          supplier: item.vendor ?? "",
          notes: `Added from receipt ${item.receiptDate ?? today}`,
          updated_at: today,
        });
      }
    });

    for (const u of updates) {
      await supabase.from("materials").update({ unit_cost: u.unit_cost, notes: u.notes, updated_at: u.updated_at }).eq("id", u.id);
    }
    if (adds.length) await supabase.from("materials").insert(adds);

    // Save receipt record
    const vendor = items.find((i) => i.vendor)?.vendor ?? null;
    const receiptDate = items.find((i) => i.receiptDate)?.receiptDate ?? null;
    const totalAmt = items.filter((_, i) => selected[i]).reduce((s, it) => s + (it.totalCost ?? 0), 0);
    await supabase.from("receipts").insert({
      company_id: profile!.company_id,
      image_url: "uploaded",
      vendor,
      receipt_date: receiptDate,
      total_amount: totalAmt || null,
      status: "processed",
    });

    setApplyLoading(false);
    showToast(`Applied — ${updates.length} updated, ${adds.length} added`);
    setPhase("idle");
    setImgSrc(null);
    setImgBase64(null);
    setItems([]);
    loadMaterials();
    loadHistory();
  }

  const matchedCount = items.filter((_, i) => selected[i] && modes[i] === "update").length;
  const addCount = items.filter((_, i) => selected[i] && modes[i] === "add").length;

  return (
    <div className="flex h-full bg-[#18191b] overflow-hidden">
      {/* Left panel — scanner */}
      <div className="flex flex-col w-[420px] flex-shrink-0 border-r border-[#2b2e33]">
        {/* Header */}
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-[#2b2e33]">
          <ScanLine className="h-4 w-4 text-[#F5A623]" />
          <span className="text-[13px] font-semibold text-[#d0d0d0]">Receipt Scanner</span>
        </div>

        <div className="flex-1 overflow-auto p-5 space-y-4">
          {phase === "idle" && (
            <>
              {/* Drop zone */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
                onClick={() => fileRef.current?.click()}
                className="flex flex-col items-center justify-center gap-3 border border-dashed border-[#3a3d42] rounded-lg p-8 cursor-pointer hover:border-[#F5A623]/40 hover:bg-[#202224] transition-colors"
              >
                <Upload className="h-6 w-6 text-[#333]" />
                <div className="text-center">
                  <p className="text-[13px] text-[#555]">Drop receipt photo here</p>
                  <p className="text-[11px] text-[#333] mt-1">or click to browse · JPG, PNG, HEIC</p>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                />
              </div>

              {imgSrc && (
                <div className="relative rounded overflow-hidden border border-[#2b2e33]">
                  <img src={imgSrc} alt="Receipt" className="w-full max-h-48 object-contain bg-[#1b1c1e]" />
                  <button
                    onClick={() => { setImgSrc(null); setImgBase64(null); }}
                    className="absolute top-2 right-2 p-1 bg-[#202224] border border-[#222] rounded text-[#555] hover:text-[#888]"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded bg-[#EF4444]/10 border border-[#EF4444]/20">
                  <AlertCircle className="h-3.5 w-3.5 text-[#EF4444] mt-px flex-shrink-0" />
                  <p className="text-[12px] text-[#EF4444]">{error}</p>
                </div>
              )}

              <div className="text-[11px] text-[#3a3d42] space-y-0.5 px-1">
                <p>· Good lighting, flat surface, all items visible</p>
                <p>· Works with handwritten slips and printed invoices</p>
                <p>· BSD$ = USD$ at 1:1 parity</p>
              </div>

              <button
                onClick={scan}
                disabled={!imgBase64}
                className="w-full py-2.5 text-[13px] font-medium bg-[#F5A623] text-[#18191b] rounded hover:bg-[#f5a623cc] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Parse with Claude
              </button>
            </>
          )}

          {phase === "scanning" && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="h-6 w-6 border-2 border-[#F5A623]/30 border-t-[#F5A623] rounded-full animate-spin" />
              <p className="text-[13px] text-[#555]">Reading receipt...</p>
              <p className="text-[11px] text-[#333]">Claude is extracting line items</p>
            </div>
          )}

          {phase === "review" && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-mono text-[#444] uppercase tracking-widest">
                  {items.length} items found
                </p>
                <button
                  onClick={() => { setPhase("idle"); setImgSrc(null); setImgBase64(null); }}
                  className="text-[11px] text-[#333] hover:text-[#666] transition-colors"
                >
                  Re-scan
                </button>
              </div>

              <div className="space-y-2">
                {items.map((item, i) => {
                  const match = materials.find((m) => m.id === item.matchId);
                  const isSel = selected[i] ?? true;
                  const mode = modes[i] ?? "update";
                  const priceDelta = match && item.unitCost != null ? item.unitCost - match.unit_cost : null;

                  return (
                    <div
                      key={i}
                      className={cn(
                        "rounded border p-3 transition-colors",
                        isSel ? "border-[#3a3d42] bg-[#202224]" : "border-[#292c31] bg-[#1b1c1e] opacity-50"
                      )}
                    >
                      <div className="flex items-start gap-2.5">
                        <input
                          type="checkbox"
                          checked={isSel}
                          onChange={() => setSelected((s) => ({ ...s, [i]: !s[i] }))}
                          className="mt-0.5 accent-[#F5A623]"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-[13px] text-[#aaa] truncate">{item.receiptName}</span>
                            {item.unitCost != null && (
                              <span className="text-[12px] font-mono text-[#F5A623] flex-shrink-0">
                                BSD${item.unitCost.toFixed(2)}{item.unit ? `/${item.unit}` : ""}
                              </span>
                            )}
                          </div>

                          <div className="flex gap-3 mt-1 text-[11px] text-[#333]">
                            {item.vendor && <span>{item.vendor}</span>}
                            {item.receiptDate && <span>{item.receiptDate}</span>}
                            {item.qty && <span>qty: {item.qty}</span>}
                          </div>

                          {match && (
                            <div className="mt-2 px-2 py-1.5 rounded bg-[#1b1c1e] border border-[#2b2e33]">
                              <div className="flex items-center gap-1.5 text-[11px]">
                                <span className="text-[#444]">Match ({item.matchConfidence}):</span>
                                <span className="text-[#666] truncate">{match.name}</span>
                                <span className="text-[#333] ml-auto flex-shrink-0">was BSD${match.unit_cost.toFixed(2)}</span>
                                {priceDelta !== null && priceDelta !== 0 && (
                                  <span className={cn(
                                    "font-mono flex-shrink-0",
                                    priceDelta > 0 ? "text-[#EF4444]" : "text-[#22C55E]"
                                  )}>
                                    {priceDelta > 0 ? "+" : ""}{priceDelta.toFixed(2)}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}

                          {isSel && (
                            <div className="flex gap-1.5 mt-2">
                              {match && (
                                <button
                                  onClick={() => setModes((m) => ({ ...m, [i]: "update" }))}
                                  className={cn(
                                    "px-2 py-0.5 rounded text-[10px] border transition-colors",
                                    mode === "update"
                                      ? "border-[#F5A623]/40 text-[#F5A623] bg-[#F5A623]/10"
                                      : "border-[#2b2e33] text-[#333] hover:text-[#555]"
                                  )}
                                >
                                  Update price
                                </button>
                              )}
                              <button
                                onClick={() => setModes((m) => ({ ...m, [i]: "add" }))}
                                className={cn(
                                  "px-2 py-0.5 rounded text-[10px] border transition-colors",
                                  mode === "add"
                                    ? "border-[#3B82F6]/40 text-[#3B82F6] bg-[#3B82F6]/10"
                                    : "border-[#2b2e33] text-[#333] hover:text-[#555]"
                                )}
                              >
                                Add new
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-[#2b2e33]">
                <div className="text-[11px] font-mono text-[#444]">
                  {matchedCount > 0 && <span className="text-[#F5A623]">{matchedCount} update{matchedCount !== 1 ? "s" : ""} </span>}
                  {addCount > 0 && <span className="text-[#3B82F6]">{addCount} new</span>}
                  {matchedCount === 0 && addCount === 0 && <span>Select items to apply</span>}
                </div>
                <button
                  onClick={applyChanges}
                  disabled={applyLoading || (matchedCount === 0 && addCount === 0)}
                  className="px-4 py-1.5 text-[12px] font-medium bg-[#F5A623] text-[#18191b] rounded hover:bg-[#f5a623cc] transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  {applyLoading && <div className="h-3 w-3 border border-[#18191b]/30 border-t-[#18191b] rounded-full animate-spin" />}
                  Apply to DB
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Right panel — history */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-[#2b2e33]">
          <Clock className="h-4 w-4 text-[#444]" />
          <span className="text-[13px] font-semibold text-[#d0d0d0]">Receipt History</span>
        </div>

        <div className="flex-1 overflow-auto">
          {history.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2">
              <ScanLine className="h-8 w-8 text-[#2b2e33]" />
              <p className="text-[12px] text-[#333]">No receipts scanned yet</p>
            </div>
          ) : (
            <div className="divide-y divide-[#23252a]">
              {history.map((r) => (
                <div key={r.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-[#1b1c1e] transition-colors">
                  <div>
                    <p className="text-[13px] text-[#888]">{r.vendor ?? "Unknown vendor"}</p>
                    <p className="text-[11px] text-[#333] mt-0.5">
                      {r.receipt_date ?? new Date(r.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {r.total_amount != null && (
                      <span className="text-[12px] font-mono text-[#F5A623]">
                        BSD${r.total_amount.toFixed(2)}
                      </span>
                    )}
                    <span className={cn(
                      "text-[10px] font-mono px-1.5 py-0.5 rounded border",
                      r.status === "processed"
                        ? "text-[#22C55E] border-[#22C55E]/20 bg-[#22C55E]/5"
                        : "text-[#555] border-[#222]"
                    )}>
                      {r.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-5 right-5 flex items-center gap-2 px-4 py-2.5 bg-[#202224] border border-[#222] rounded-lg shadow-2xl z-50">
          <Check className="h-3.5 w-3.5 text-[#22C55E]" />
          <span className="text-[13px] text-[#d0d0d0]">{toast}</span>
        </div>
      )}
    </div>
  );
}
