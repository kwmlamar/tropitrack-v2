"use client";

/**
 * Client-facing estimate PDF (react-pdf).
 *
 * Mirrors the web preview at /estimates/[id]/preview — same ODS Construction
 * paper template: small ESTIMATE eyebrow, big red serif wordmark, red address
 * block, Client / Project columns, single Details / Labor / Materials / Amount
 * table, footer ladder Subtotal → Over-head → VAT → Total.
 *
 * react-pdf font model: built-in Times-Roman for the wordmark + section labels
 * (serif analog to Fraunces in the web preview), Helvetica for body. Both are
 * PDF-standard 14 fonts — no font loading, ships everywhere.
 */

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import {
  computeSectionMaterialSell,
  type Estimate,
  type EstimateLineItem,
  type EstimateSectionMaterial,
} from "@/types";

type Section = {
  id: string;
  name: string;
  order_index: number;
  show_to_client?: boolean;
};

type CompanyInfo = {
  name: string;
  address?: string | null;
  city?: string | null;
  phone?: string | null;
  email?: string | null;
};

interface EstimatePDFTemplateProps {
  estimate: Estimate;
  lineItems: EstimateLineItem[];
  sections?: Section[];
  /** Takeoff-level materials (Option C — materials now live here, not on tasks). */
  sectionMaterials?: EstimateSectionMaterial[];
  companyInfo?: CompanyInfo;
  /** Legacy prop kept for backwards-compat with old call sites; ignored. */
  categories?: unknown;
}

// ─── Palette (HSL values from globals.css resolved for react-pdf) ────────────
const RED = "#DD3F3F";
const RED_SOFT = "#E27272";
const STONE_900 = "#1C1917";
const STONE_800 = "#292524";
const STONE_700 = "#44403C";
const STONE_600 = "#57534E";
const STONE_500 = "#78716C";
const STONE_400 = "#A8A29E";
const STONE_300 = "#D6D3D1";
const STONE_200 = "#E7E5E4";

const styles = StyleSheet.create({
  page: {
    paddingTop: 56,
    paddingBottom: 48,
    paddingHorizontal: 56,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: STONE_900,
  },

  eyebrow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 28,
  },
  eyebrowLabel: {
    fontSize: 8.5,
    letterSpacing: 1.8,
    color: STONE_500,
    textTransform: "uppercase",
  },
  statusPill: {
    fontSize: 7.5,
    letterSpacing: 1.2,
    color: STONE_600,
    textTransform: "uppercase",
    borderWidth: 0.5,
    borderColor: STONE_300,
    borderRadius: 8,
    paddingVertical: 1.5,
    paddingHorizontal: 5,
  },

  wordmark: {
    fontFamily: "Times-Roman",
    fontSize: 36,
    color: RED,
    letterSpacing: -0.4,
    marginBottom: 8,
  },
  addressBlock: { marginBottom: 24 },
  addressLine: {
    fontFamily: "Helvetica",
    fontSize: 10,
    color: RED_SOFT,
    lineHeight: 1.45,
  },

  dateRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginBottom: 22,
  },
  dateLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: RED,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    marginRight: 8,
  },
  dateValue: { fontSize: 10.5, color: STONE_700 },

  partyRow: { flexDirection: "row", marginBottom: 24 },
  partyCol: { flex: 1, paddingRight: 16 },
  partyHeader: {
    fontFamily: "Times-Roman",
    fontSize: 16,
    color: RED,
    marginBottom: 4,
  },
  partyName: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10.5,
    color: STONE_800,
    marginBottom: 2,
  },
  partyDetail: { fontSize: 10, color: STONE_700, lineHeight: 1.5 },
  partyMuted: { fontSize: 10, color: STONE_500, lineHeight: 1.5 },

  table: { marginTop: 4 },
  tableHead: {
    flexDirection: "row",
    borderTopWidth: 1.4,
    borderTopColor: STONE_900,
    borderBottomWidth: 0.6,
    borderBottomColor: STONE_900,
    paddingVertical: 6,
  },
  tableHeadCell: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9.5,
    color: STONE_900,
  },
  colDetails: { flex: 5.8, paddingRight: 6 },
  colLabor:   { flex: 1.4, textAlign: "right", paddingHorizontal: 6 },
  colMats:    { flex: 1.4, textAlign: "right", paddingHorizontal: 6 },
  colAmount:  { flex: 1.4, textAlign: "right", paddingLeft: 6 },

  sectionHeaderRow: { flexDirection: "row", paddingTop: 10, paddingBottom: 3 },
  sectionHeader: {
    fontFamily: "Times-Roman",
    fontSize: 12.5,
    color: RED,
    paddingLeft: 0,
  },

  itemRow: {
    flexDirection: "row",
    borderBottomWidth: 0.4,
    borderBottomColor: STONE_200,
    paddingVertical: 5,
  },
  itemRowLast: { flexDirection: "row", paddingVertical: 5 },

  // Phase-only row (collapsed view — used in client preview/PDF).
  phaseRow: {
    flexDirection: "row",
    borderBottomWidth: 0.4,
    borderBottomColor: STONE_200,
    paddingVertical: 12,
    alignItems: "center",
  },
  phaseRowLast: {
    flexDirection: "row",
    paddingVertical: 12,
    alignItems: "center",
  },
  phaseDetailsCell: {
    flex: 5.8,
    paddingLeft: 4,
    paddingRight: 6,
  },
  phaseName: {
    fontFamily: "Times-Roman",
    fontSize: 13,
    color: RED,
  },
  itemDetailsCell: {
    fontSize: 10,
    color: STONE_800,
    lineHeight: 1.45,
    paddingLeft: 6,
    paddingRight: 6,
    flex: 5.8,
  },
  itemNumCell: {
    fontSize: 10,
    color: STONE_700,
    textAlign: "right",
  },
  itemAmountCell: {
    fontSize: 10,
    color: STONE_900,
    fontFamily: "Helvetica-Bold",
    textAlign: "right",
  },

  sectionSubtotalRow: {
    flexDirection: "row",
    borderTopWidth: 0.5,
    borderTopColor: STONE_300,
    paddingVertical: 3,
  },
  sectionSubtotalLabel: {
    fontSize: 8.5,
    color: STONE_500,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    paddingLeft: 6,
    flex: 5.8,
  },
  sectionSubtotalNum: {
    fontSize: 9.5,
    color: STONE_600,
    textAlign: "right",
  },
  sectionSubtotalTotal: {
    fontSize: 9.5,
    color: STONE_900,
    fontFamily: "Helvetica-Bold",
    textAlign: "right",
  },

  totalsBlock: { marginTop: 4 },
  totalsTopRule: {
    borderTopWidth: 1.4,
    borderTopColor: STONE_900,
    marginTop: 4,
  },
  totalRow: { flexDirection: "row", paddingVertical: 4 },
  totalSpacer: { flex: 5.8 + 1.4 },
  totalLabelCell: { flex: 1.4, textAlign: "right", paddingHorizontal: 6 },
  totalValueCell: { flex: 1.4, textAlign: "right", paddingLeft: 6 },
  totalLabel: {
    fontSize: 9,
    color: STONE_700,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    fontFamily: "Helvetica-Bold",
  },
  totalLabelMuted: {
    fontSize: 8.5,
    color: STONE_600,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  totalValue: { fontSize: 10.5, color: STONE_900, fontFamily: "Helvetica-Bold" },
  totalValueMuted: { fontSize: 10, color: STONE_700 },
  grandTotalRow: {
    flexDirection: "row",
    borderTopWidth: 0.6,
    borderTopColor: STONE_900,
    paddingTop: 8,
    paddingBottom: 2,
  },
  grandLabel: {
    fontSize: 11,
    color: RED,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  grandValue: {
    fontSize: 14,
    color: RED,
    fontFamily: "Helvetica-Bold",
  },

  termsSection: {
    marginTop: 30,
    paddingTop: 14,
    borderTopWidth: 0.5,
    borderTopColor: STONE_200,
    flexDirection: "row",
  },
  termsCol: { flex: 1, paddingRight: 16 },
  termsHeader: {
    fontFamily: "Times-Roman",
    fontSize: 12,
    color: RED,
    marginBottom: 4,
  },
  termsText: { fontSize: 9, color: STONE_600, lineHeight: 1.55 },

  footer: {
    position: "absolute",
    bottom: 30,
    left: 56,
    right: 56,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 0.4,
    borderTopColor: STONE_200,
    paddingTop: 6,
  },
  footerText: { fontSize: 8, color: STONE_500 },
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function dottedWordmark(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return name;
  const first = parts[0];
  if (/^[A-Z]{2,4}$/.test(first)) {
    parts[0] = first.split("").join(".");
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
  const mod100 = day % 100;
  const suffix =
    mod100 >= 11 && mod100 <= 13 ? "th" :
    (["", "st", "nd", "rd"][day % 10] ?? "th");
  return `${day}${suffix}/${month}/${year}`;
}

const rowAmount = (it: EstimateLineItem): number =>
  Number(it.labor_cost ?? 0) + Number(it.material_cost ?? 0) + Number(it.equipment_cost ?? 0);
const rowMaterials = (it: EstimateLineItem): number =>
  Number(it.material_cost ?? 0) + Number(it.equipment_cost ?? 0);
const rowLabor = (it: EstimateLineItem): number => Number(it.labor_cost ?? 0);

// ─── Component ───────────────────────────────────────────────────────────────

export function EstimatePDFTemplate({
  estimate,
  lineItems,
  sections,
  sectionMaterials,
  companyInfo,
}: EstimatePDFTemplateProps) {
  const visibleSections = (sections ?? []).filter((s) => s.show_to_client !== false);
  const sectionIds = new Set(visibleSections.map((s) => s.id));
  const visibleMats = (sectionMaterials ?? []).filter(
    (m) => visibleSections.length === 0 || sectionIds.has(m.section_id),
  );
  const visibleItems = lineItems.filter(
    (it) => (visibleSections.length === 0 || sectionIds.has(it.section_id)) && it.show_to_client !== false,
  );

  const overheadPct = (estimate as any).overhead_pct ?? (estimate as any).overhead_markup_percent ?? 0;
  const vatPct = (estimate as any).vat_pct ?? (estimate as any).tax_rate ?? 0;
  const overheadAmount = (estimate as any).overhead_amount ?? 0;
  const vatAmount = (estimate as any).tax_amount ?? (estimate as any).vat_amount ?? 0;

  const wordmark = dottedWordmark(companyInfo?.name ?? "ODS Construction");

  return (
    <Document title={`Estimate ${estimate.estimate_number ?? estimate.id}`}>
      <Page size="LETTER" style={styles.page}>
        {/* Eyebrow */}
        <View style={styles.eyebrow}>
          <Text style={styles.eyebrowLabel}>
            Estimate {estimate.estimate_number ?? `#${estimate.id.slice(0, 8)}`}
          </Text>
          <Text style={styles.statusPill}>{estimate.status ?? "draft"}</Text>
        </View>

        {/* Wordmark + address */}
        <Text style={styles.wordmark}>{wordmark}</Text>
        <View style={styles.addressBlock}>
          {companyInfo?.address && <Text style={styles.addressLine}>{companyInfo.address}</Text>}
          {companyInfo?.city && <Text style={styles.addressLine}>{companyInfo.city}</Text>}
          {companyInfo?.phone && <Text style={styles.addressLine}>Phone: {companyInfo.phone}</Text>}
        </View>

        {/* Date */}
        <View style={styles.dateRow}>
          <Text style={styles.dateLabel}>Date</Text>
          <Text style={styles.dateValue}>{formatBritishDate(estimate.issue_date)}</Text>
        </View>

        {/* Client / Project */}
        <View style={styles.partyRow}>
          <View style={styles.partyCol}>
            <Text style={styles.partyHeader}>Client</Text>
            {estimate.client_name ? (
              <>
                <Text style={styles.partyName}>{estimate.client_name}</Text>
                {(estimate as any).property_name && <Text style={styles.partyDetail}>{(estimate as any).property_name}</Text>}
                {estimate.client_email && <Text style={styles.partyMuted}>{estimate.client_email}</Text>}
                {estimate.client_phone && <Text style={styles.partyMuted}>{estimate.client_phone}</Text>}
              </>
            ) : (
              <Text style={styles.partyMuted}>No client on file</Text>
            )}
          </View>
          <View style={styles.partyCol}>
            <Text style={styles.partyHeader}>Project</Text>
            <Text style={styles.partyDetail}>
              {estimate.title?.replace(/—\s*Estimate$/i, "").trim() || "Untitled project"}
            </Text>
            {estimate.description && (
              <Text style={styles.partyMuted}>{estimate.description}</Text>
            )}
          </View>
        </View>

        {/* Table */}
        <View style={styles.table}>
          <View style={styles.tableHead}>
            <Text style={[styles.tableHeadCell, styles.colDetails]}>Details</Text>
            <Text style={[styles.tableHeadCell, styles.colLabor]}>Labor</Text>
            <Text style={[styles.tableHeadCell, styles.colMats]}>Materials</Text>
            <Text style={[styles.tableHeadCell, styles.colAmount]}>Amount</Text>
          </View>

          {visibleItems.length === 0 && visibleMats.length === 0 ? (
            <Text style={{ textAlign: "center", color: STONE_400, fontSize: 10, paddingVertical: 24 }}>
              Nothing to show yet.
            </Text>
          ) : visibleSections.length > 0 ? (
            // Phase-only: one row per section. Labor from tasks; materials from
            // the takeoff table (with markup applied per Option C).
            visibleSections
              .map((sec) => {
                const items = visibleItems.filter((it) => it.section_id === sec.id);
                const mats = visibleMats.filter((m) => m.section_id === sec.id);
                if (items.length === 0 && mats.length === 0) return null;
                const sLabor = items.reduce((s, it) => s + rowLabor(it), 0);
                const sMats = mats.reduce((s, m) => s + computeSectionMaterialSell(m, estimate), 0);
                const sTotal = sLabor + sMats;
                return { sec, sLabor, sMats, sTotal };
              })
              .filter(Boolean)
              .map((row, idx, arr) => {
                const { sec, sLabor, sMats, sTotal } = row!;
                const last = idx === arr.length - 1;
                return (
                  <View key={sec.id} style={last ? styles.phaseRowLast : styles.phaseRow} wrap={false}>
                    <View style={styles.phaseDetailsCell}>
                      <Text style={styles.phaseName}>{sec.name}</Text>
                    </View>
                    <Text style={[styles.itemNumCell, styles.colLabor]}>
                      {sLabor > 0 ? formatCurrency(sLabor) : "—"}
                    </Text>
                    <Text style={[styles.itemNumCell, styles.colMats]}>
                      {sMats > 0 ? formatCurrency(sMats) : "—"}
                    </Text>
                    <Text style={[styles.itemAmountCell, styles.colAmount]}>
                      {formatCurrency(sTotal)}
                    </Text>
                  </View>
                );
              })
          ) : (
            // No sections — collapse everything to one "Project" row.
            (() => {
              const totalLabor = visibleItems.reduce((s, it) => s + rowLabor(it), 0);
              const totalMats = visibleMats.reduce((s, m) => s + computeSectionMaterialSell(m, estimate), 0);
              const projectName =
                estimate.title?.replace(/—\s*Estimate$/i, "").trim() || "Project";
              return (
                <View style={styles.phaseRowLast}>
                  <View style={styles.phaseDetailsCell}>
                    <Text style={styles.phaseName}>{projectName}</Text>
                  </View>
                  <Text style={[styles.itemNumCell, styles.colLabor]}>
                    {totalLabor > 0 ? formatCurrency(totalLabor) : "—"}
                  </Text>
                  <Text style={[styles.itemNumCell, styles.colMats]}>
                    {totalMats > 0 ? formatCurrency(totalMats) : "—"}
                  </Text>
                  <Text style={[styles.itemAmountCell, styles.colAmount]}>
                    {formatCurrency(totalLabor + totalMats)}
                  </Text>
                </View>
              );
            })()
          )}

          {/* Totals ladder */}
          <View style={styles.totalsBlock}>
            <View style={styles.totalsTopRule} />
            <View style={styles.totalRow}>
              <View style={styles.totalSpacer} />
              <Text style={[styles.totalLabel, styles.totalLabelCell]}>Subtotal</Text>
              <Text style={[styles.totalValue, styles.totalValueCell]}>
                {formatCurrency(Number(estimate.subtotal ?? 0))}
              </Text>
            </View>
            {Number(overheadAmount) > 0 && (
              <View style={styles.totalRow}>
                <View style={styles.totalSpacer} />
                <Text style={[styles.totalLabelMuted, styles.totalLabelCell]}>
                  Over-head Allowances ({Number(overheadPct).toFixed(0)}%)
                </Text>
                <Text style={[styles.totalValueMuted, styles.totalValueCell]}>
                  {formatCurrency(Number(overheadAmount))}
                </Text>
              </View>
            )}
            {Number(vatAmount) > 0 && (
              <View style={styles.totalRow}>
                <View style={styles.totalSpacer} />
                <Text style={[styles.totalLabelMuted, styles.totalLabelCell]}>
                  VAT ({Number(vatPct).toFixed(0)}%)
                </Text>
                <Text style={[styles.totalValueMuted, styles.totalValueCell]}>
                  {formatCurrency(Number(vatAmount))}
                </Text>
              </View>
            )}
            <View style={styles.grandTotalRow}>
              <View style={styles.totalSpacer} />
              <Text style={[styles.grandLabel, styles.totalLabelCell]}>Total</Text>
              <Text style={[styles.grandValue, styles.totalValueCell]}>
                {formatCurrency(Number(estimate.total_amount ?? 0))}
              </Text>
            </View>
          </View>
        </View>

        {/* Terms / notes */}
        {(estimate.terms_and_conditions || estimate.notes) && (
          <View style={styles.termsSection}>
            {estimate.terms_and_conditions && (
              <View style={styles.termsCol}>
                <Text style={styles.termsHeader}>Terms</Text>
                <Text style={styles.termsText}>{estimate.terms_and_conditions}</Text>
              </View>
            )}
            {estimate.notes && (
              <View style={styles.termsCol}>
                <Text style={styles.termsHeader}>Notes</Text>
                <Text style={styles.termsText}>{estimate.notes}</Text>
              </View>
            )}
          </View>
        )}

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            Prepared by {companyInfo?.name ?? "ODS Construction"}
            {companyInfo?.email ? ` · ${companyInfo.email}` : ""}
          </Text>
          {estimate.valid_until && (
            <Text style={styles.footerText}>
              Valid until {formatBritishDate(estimate.valid_until)}
            </Text>
          )}
        </View>
      </Page>
    </Document>
  );
}
