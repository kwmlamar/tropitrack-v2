"use client";

/**
 * Client-facing estimate preview.
 *
 * This is the *document* a client sees — no app chrome, no internal cost data,
 * no markup percentages, no labor/materials split. Designed to mirror the ODS
 * Construction estate paper template: small "ESTIMATE #NNN" eyebrow, big red
 * Fraunces wordmark, red address block, two-column client/project header, a
 * single Details / Amount table, then Subtotal → Over-head → VAT → Total.
 *
 * Surface is always light ("paper" feel) regardless of the app theme — clients
 * receive this as a PDF or shareable link, where a dark UI would be jarring.
 *
 * Hides for print: floating action bar (Back / Download / Print).
 */

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { ArrowLeft, Download, Loader2, Printer } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import {
  computeSectionMaterialSell,
  type Estimate,
  type EstimateLineItem,
  type EstimateSectionMaterial,
} from "@/types";

type Section = {
  id: string;
  name: string;
  /** Optional client-facing label override — see issue #13. */
  client_name?: string | null;
  order_index: number;
  show_to_client: boolean;
};

type CompanyInfo = {
  name: string;
  address?: string | null;
  city?: string | null;
  phone?: string | null;
  email?: string | null;
};

// PDF link is dynamic so the heavy renderer doesn't block initial paint.
const PDFDownloadLink = dynamic(
  () => import("@react-pdf/renderer").then((m) => m.PDFDownloadLink),
  { ssr: false, loading: () => <span className="text-xs text-foreground-lighter">Preparing PDF…</span> },
);

import { EstimatePDFTemplate } from "@/components/pdf/estimate-pdf-template";

export default function EstimatePreviewPage() {
  const params = useParams();
  const router = useRouter();
  const estimateId = params.id as string;
  const { profile } = useAuth();
  const { toast } = useToast();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [lineItems, setLineItems] = useState<EstimateLineItem[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [sectionMaterials, setSectionMaterials] = useState<EstimateSectionMaterial[]>([]);
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [estRes, itemsRes, secRes, matsRes, companyRes] = await Promise.all([
          supabase.from("estimates").select("*").eq("id", estimateId).single(),
          supabase.from("estimate_line_items").select("*").eq("estimate_id", estimateId).order("order_index"),
          supabase.from("estimate_sections").select("*").eq("estimate_id", estimateId).order("order_index"),
          supabase.from("estimate_section_materials").select("*").order("order_index"),
          profile?.company_id
            ? supabase.from("companies").select("*").eq("id", profile.company_id).single()
            : Promise.resolve({ data: null, error: null }),
        ]);
        if (cancelled) return;
        if (estRes.error) throw estRes.error;
        setEstimate(estRes.data);
        setLineItems((itemsRes.data as EstimateLineItem[]) || []);
        const secs = (secRes.data as Section[]) || [];
        setSections(secs);
        const secIds = new Set(secs.map((s) => s.id));
        setSectionMaterials(((matsRes.data as EstimateSectionMaterial[]) || []).filter((m) => secIds.has(m.section_id)));
        if (companyRes.data) {
          setCompanyInfo({
            name: companyRes.data.name,
            address: companyRes.data.address,
            city: companyRes.data.city,
            phone: companyRes.data.phone,
            email: companyRes.data.email,
          });
        }
      } catch (err: any) {
        if (!cancelled) {
          toast({ title: "Failed to load estimate", description: err.message, variant: "destructive" });
          router.push("/estimates");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estimateId, profile?.company_id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-stone-400" />
      </div>
    );
  }
  if (!estimate) return null;

  // Visible-to-client filter: respect `show_to_client` on sections.
  // If no sections have the flag explicitly set we show all (defensive default).
  const visibleSections = sections.filter((s) => s.show_to_client !== false);
  const sectionIds = new Set(visibleSections.map((s) => s.id));

  // Only show line items that are in a visible section AND show_to_client !== false.
  const visibleItems = lineItems.filter(
    (it) => sectionIds.has(it.section_id) && it.show_to_client !== false,
  );

  // Roll up per line: Amount = labor + material + equipment (cost as billed to client).
  // The internal markup math has already produced the stored amount; we display the row total.
  const rowAmount = (it: EstimateLineItem): number =>
    Number(it.labor_cost ?? 0) + Number(it.material_cost ?? 0) + Number(it.equipment_cost ?? 0);

  const issueDateFormatted = formatBritishDate(estimate.issue_date);

  // Estimate uses live-schema columns: overhead_pct / vat_pct (not overhead_markup_percent / tax_rate).
  const overheadPct = (estimate as any).overhead_pct ?? (estimate as any).overhead_markup_percent ?? 0;
  const vatPct = (estimate as any).vat_pct ?? (estimate as any).tax_rate ?? 0;
  const overheadAmount = (estimate as any).overhead_amount ?? 0;
  const vatAmount = (estimate as any).tax_amount ?? (estimate as any).vat_amount ?? 0;

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900 print:bg-white">
      {/* Floating action bar — hidden when printing */}
      <div className="fixed top-4 right-4 z-50 flex items-center gap-1.5 print:hidden">
        <ActionBtn onClick={() => router.push(`/estimates/${estimateId}`)} icon={<ArrowLeft className="h-3.5 w-3.5" />}>
          Back
        </ActionBtn>
        <ActionBtn onClick={() => window.print()} icon={<Printer className="h-3.5 w-3.5" />}>
          Print
        </ActionBtn>
        <PDFDownloadLink
          document={
            <EstimatePDFTemplate
              estimate={estimate}
              lineItems={visibleItems}
              sections={visibleSections}
              sectionMaterials={sectionMaterials}
              companyInfo={companyInfo ?? undefined}
            />
          }
          fileName={`Estimate-${estimate.estimate_number ?? estimate.id.slice(0, 8)}.pdf`}
          className="inline-flex"
        >
          {({ loading: pdfLoading }) => (
            <ActionBtn icon={pdfLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}>
              Download
            </ActionBtn>
          )}
        </PDFDownloadLink>
      </div>

      {/* Document — letter-sized centered paper on a warm-neutral desk */}
      <div className="mx-auto max-w-[820px] px-6 py-10 print:p-0 print:max-w-none">
        <article
          className="bg-white shadow-[0_8px_28px_-12px_rgba(38,32,28,0.18),0_2px_6px_-2px_rgba(38,32,28,0.08)] print:shadow-none rounded-sm overflow-hidden animate-doc-in"
          style={{ fontFamily: "var(--font-sans, system-ui)" }}
        >
          {/* Margins — generous; mimic a printed sheet */}
          <div className="px-14 py-12 print:px-12 print:py-10">
            {/* Eyebrow + spacer */}
            <div
              className="flex items-baseline justify-between mb-10 animate-fade-up"
              style={{ animationDelay: "60ms" }}
            >
              <div className="text-[10px] font-mono tracking-[0.22em] uppercase text-stone-500">
                Estimate {estimate.estimate_number ?? `#${estimate.id.slice(0, 8)}`}
              </div>
              <StatusPill status={estimate.status} />
            </div>

            {/* Company wordmark + address — two-column on wide; stacked on narrow */}
            <header
              className="grid grid-cols-[1fr_auto] gap-12 mb-10 animate-fade-up"
              style={{ animationDelay: "120ms" }}
            >
              <div>
                <h1
                  className="font-display text-[44px] leading-[1.02] tracking-[-0.01em] text-bedrock-red"
                  style={{ fontFamily: "var(--font-display, Georgia, serif)" }}
                >
                  {dottedWordmark(companyInfo?.name ?? "ODS Construction")}
                </h1>
                <div className="mt-4 space-y-0.5 text-[12.5px] text-bedrock-red/85 leading-[1.55]">
                  {companyInfo?.address && <p>{companyInfo.address}</p>}
                  {companyInfo?.city && <p>{companyInfo.city}</p>}
                  {companyInfo?.phone && <p>Phone: {companyInfo.phone}</p>}
                </div>
              </div>
            </header>

            {/* DATE row */}
            <div
              className="flex items-baseline gap-3 mb-9 animate-fade-up"
              style={{ animationDelay: "180ms" }}
            >
              <span className="text-[11px] font-semibold tracking-[0.18em] uppercase text-bedrock-red">
                Date
              </span>
              <span className="text-[12.5px] text-stone-700 tabular-nums">{issueDateFormatted}</span>
            </div>

            {/* Client / Project — two columns, red labels */}
            <section
              className="grid grid-cols-2 gap-12 mb-10 animate-fade-up"
              style={{ animationDelay: "240ms" }}
            >
              <div>
                <h2 className="font-display text-[20px] text-bedrock-red mb-2 leading-none">Client</h2>
                <div className="text-[13px] text-stone-800 leading-[1.55] space-y-0.5">
                  {estimate.client_name && <p className="font-medium">{estimate.client_name}</p>}
                  {(estimate as any).property_name && <p>{(estimate as any).property_name}</p>}
                  {estimate.client_email && <p className="text-stone-600">{estimate.client_email}</p>}
                  {estimate.client_phone && <p className="text-stone-600">{estimate.client_phone}</p>}
                  {!estimate.client_name && <p className="text-stone-400 italic">No client on file</p>}
                </div>
              </div>
              <div>
                <h2 className="font-display text-[20px] text-bedrock-red mb-2 leading-none">Project</h2>
                <div className="text-[13px] text-stone-800 leading-[1.55] space-y-0.5">
                  <p>{estimate.title?.replace(/—\s*Estimate$/i, "").trim() || "Untitled project"}</p>
                  {estimate.description && (
                    <p className="text-stone-600 text-[12px] leading-[1.5] mt-1">{estimate.description}</p>
                  )}
                </div>
              </div>
            </section>

            {/* Line-item table */}
            <section
              className="animate-fade-up"
              style={{ animationDelay: "320ms" }}
            >
              <table className="w-full text-[12.5px] border-collapse">
                <thead>
                  <tr className="border-t-2 border-b border-stone-900">
                    <th className="text-left font-semibold text-stone-900 py-2 pr-3 w-[75%]">Details</th>
                    <th className="text-right font-semibold text-stone-900 py-2 pl-3 w-[25%]">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleItems.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="py-8 text-center text-stone-400 italic">
                        Nothing to show yet.
                      </td>
                    </tr>
                  ) : visibleSections.length > 0 ? (
                    // Phase-only view — one row per section. Single Amount column
                    // (labor + materials roll up into one number for the client).
                    visibleSections.map((sec, secIdx) => {
                      const items = visibleItems.filter((it) => it.section_id === sec.id);
                      const mats = sectionMaterials.filter((m) => m.section_id === sec.id);
                      if (items.length === 0 && mats.length === 0) return null;
                      const sectionLabor = items.reduce((s, it) => s + Number(it.labor_cost ?? 0), 0);
                      const sectionMatsSell = mats.reduce(
                        (s, m) => s + computeSectionMaterialSell(m, estimate),
                        0,
                      );
                      const sectionTotal = sectionLabor + sectionMatsSell;
                      const isLast = secIdx === visibleSections.length - 1;
                      return (
                        <tr
                          key={sec.id}
                          className={isLast ? "" : "border-b border-stone-200"}
                        >
                          <td className="py-4 pr-3 align-top">
                            <div className="font-display text-[15px] text-bedrock-red leading-tight">
                              {sec.client_name?.trim() || sec.name}
                            </div>
                          </td>
                          <td className="py-4 pl-3 text-right tabular-nums font-medium text-stone-900 align-top">
                            {formatCurrency(sectionTotal)}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    // No sections defined — collapse the whole estimate into a
                    // single "Project" row.
                    (() => {
                      const totalLabor = visibleItems.reduce((s, it) => s + Number(it.labor_cost ?? 0), 0);
                      const totalMats = sectionMaterials.reduce(
                        (s, m) => s + computeSectionMaterialSell(m, estimate),
                        0,
                      );
                      const total = totalLabor + totalMats;
                      return (
                        <tr>
                          <td className="py-4 pr-3 align-top">
                            <div className="font-display text-[15px] text-bedrock-red leading-tight">
                              {estimate.title?.replace(/—\s*Estimate$/i, "").trim() || "Project"}
                            </div>
                          </td>
                          <td className="py-4 pl-3 text-right tabular-nums font-medium text-stone-900 align-top">
                            {formatCurrency(total)}
                          </td>
                        </tr>
                      );
                    })()
                  )}
                </tbody>

                {/* Footer totals — labels right-aligned under Details, amounts under Amount */}
                <tfoot>
                  <tr className="border-t-2 border-stone-900">
                    <td className="text-right font-semibold tracking-wide uppercase text-[11px] text-stone-700 py-2.5 pr-3">
                      Subtotal
                    </td>
                    <td className="text-right tabular-nums font-medium py-2.5 pl-3 text-stone-900">
                      {formatCurrency(Number(estimate.subtotal ?? 0))}
                    </td>
                  </tr>
                  {Number(overheadAmount) > 0 && (
                    <tr>
                      <td className="text-right uppercase text-[11px] tracking-wide text-stone-600 py-1 pr-3">
                        Over-head Allowances ({Number(overheadPct).toFixed(0)}%)
                      </td>
                      <td className="text-right tabular-nums py-1 pl-3 text-stone-800">
                        {formatCurrency(Number(overheadAmount))}
                      </td>
                    </tr>
                  )}
                  {Number(vatAmount) > 0 && (
                    <tr>
                      <td className="text-right uppercase text-[11px] tracking-wide text-stone-600 py-1 pr-3">
                        VAT ({Number(vatPct).toFixed(0)}%)
                      </td>
                      <td className="text-right tabular-nums py-1 pl-3 text-stone-800">
                        {formatCurrency(Number(vatAmount))}
                      </td>
                    </tr>
                  )}
                  <tr className="border-t border-stone-900">
                    <td className="text-right font-bold uppercase text-[12px] tracking-wider py-3 pr-3 text-bedrock-red">
                      Total
                    </td>
                    <td className="text-right tabular-nums font-bold py-3 pl-3 text-[14.5px] text-bedrock-red">
                      {formatCurrency(Number(estimate.total_amount ?? 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </section>

            {/* Terms / notes — only render if present */}
            {(estimate.terms_and_conditions || estimate.notes) && (
              <section
                className="mt-10 pt-6 border-t border-stone-200 grid grid-cols-2 gap-12 animate-fade-up"
                style={{ animationDelay: "380ms" }}
              >
                {estimate.terms_and_conditions && (
                  <div>
                    <h3 className="font-display text-[14px] text-bedrock-red mb-1.5 leading-none">Terms</h3>
                    <p className="text-[11.5px] text-stone-600 leading-[1.55] whitespace-pre-wrap">
                      {estimate.terms_and_conditions}
                    </p>
                  </div>
                )}
                {estimate.notes && (
                  <div>
                    <h3 className="font-display text-[14px] text-bedrock-red mb-1.5 leading-none">Notes</h3>
                    <p className="text-[11.5px] text-stone-600 leading-[1.55] whitespace-pre-wrap">
                      {estimate.notes}
                    </p>
                  </div>
                )}
              </section>
            )}

            {/* Footer signature line */}
            <footer
              className="mt-12 pt-4 border-t border-stone-200 flex items-end justify-between animate-fade-up"
              style={{ animationDelay: "440ms" }}
            >
              <p className="text-[10.5px] text-stone-500 leading-tight">
                Prepared by {companyInfo?.name ?? "ODS Construction"}
                {companyInfo?.email && <> · {companyInfo.email}</>}
              </p>
              {estimate.valid_until && (
                <p className="text-[10.5px] text-stone-500 tabular-nums">
                  Valid until {formatBritishDate(estimate.valid_until)}
                </p>
              )}
            </footer>
          </div>
        </article>
      </div>

      {/* Local styles — entrance animation + print rules */}
      <style jsx global>{`
        @keyframes doc-in {
          0% { opacity: 0; transform: translateY(8px) scale(0.998); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes fade-up {
          0% { opacity: 0; transform: translateY(6px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .animate-doc-in {
          animation: doc-in 0.45s cubic-bezier(0.2, 0.7, 0.2, 1) both;
        }
        .animate-fade-up {
          animation: fade-up 0.4s cubic-bezier(0.2, 0.7, 0.2, 1) both;
        }
        @media print {
          .animate-doc-in,
          .animate-fade-up {
            animation: none !important;
          }
          @page { margin: 0.6in; }
        }
      `}</style>
    </div>
  );
}

// ─── Subcomponents ───────────────────────────────────────────────────────────

function ActionBtn({
  onClick, icon, children,
}: { onClick?: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-card/95 backdrop-blur border border-border text-[11.5px] font-medium text-foreground-light shadow-sm hover:bg-card hover:border-hover hover:text-foreground transition-colors"
    >
      {icon}
      {children}
    </button>
  );
}

function StatusPill({ status }: { status: string }) {
  const color =
    status === "approved" ? "text-emerald-700 bg-emerald-50 border-emerald-200" :
    status === "sent" ? "text-blue-700 bg-blue-50 border-blue-200" :
    status === "rejected" ? "text-rose-700 bg-rose-50 border-rose-200" :
    status === "converted" ? "text-violet-700 bg-violet-50 border-violet-200" :
    "text-stone-600 bg-stone-50 border-stone-200";
  return (
    <span className={`inline-flex items-center text-[9.5px] font-mono uppercase tracking-[0.18em] px-2 py-0.5 rounded-full border ${color}`}>
      {status}
    </span>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dottedWordmark(name: string): string {
  // "ODS Construction" → "O.D.S Construction" if the first token is an all-caps abbreviation 2-4 letters.
  // Honors names that already have dots ("O.D.S Construction" stays the same).
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return name;
  const first = parts[0];
  if (/^[A-Z]{2,4}$/.test(first)) {
    parts[0] = first.split("").join(".") + (parts.length > 1 ? "" : "");
    if (parts.length === 1) parts[0] = first.split("").join(".");
  }
  return parts.join(" ");
}

function formatBritishDate(dateStr?: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr + (dateStr.length === 10 ? "T00:00:00Z" : ""));
  if (Number.isNaN(d.getTime())) return dateStr;
  const day = d.getUTCDate();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const year = d.getUTCFullYear();
  const suffix = ordinalSuffix(day);
  return `${day}${suffix}/${month}/${year}`;
}

function ordinalSuffix(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return "th";
  switch (n % 10) {
    case 1: return "st";
    case 2: return "nd";
    case 3: return "rd";
    default: return "th";
  }
}
