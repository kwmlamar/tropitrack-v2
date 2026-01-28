"use client";

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import type { Estimate, EstimateLineItem, EstimateCategory, DocumentTemplate } from "@/types";

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: "Helvetica",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 30,
  },
  companySection: {
    maxWidth: "50%",
  },
  companyName: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1a365d",
    marginBottom: 4,
  },
  companyDetails: {
    fontSize: 9,
    color: "#4a5568",
    lineHeight: 1.4,
  },
  estimateSection: {
    textAlign: "right",
  },
  documentTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1a365d",
    marginBottom: 4,
  },
  estimateNumber: {
    fontSize: 12,
    color: "#4a5568",
    marginBottom: 2,
  },
  statusBadge: {
    fontSize: 10,
    color: "#fff",
    backgroundColor: "#3182ce",
    padding: "4 8",
    borderRadius: 4,
    marginTop: 8,
    textTransform: "uppercase",
  },
  clientSection: {
    marginBottom: 24,
    padding: 16,
    backgroundColor: "#f7fafc",
    borderRadius: 4,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#718096",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  clientName: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#1a202c",
    marginBottom: 4,
  },
  clientDetails: {
    fontSize: 10,
    color: "#4a5568",
    lineHeight: 1.4,
  },
  datesRow: {
    flexDirection: "row",
    marginBottom: 24,
    gap: 20,
  },
  dateBox: {
    flex: 1,
    padding: 12,
    backgroundColor: "#f7fafc",
    borderRadius: 4,
  },
  dateLabel: {
    fontSize: 9,
    color: "#718096",
    marginBottom: 2,
  },
  dateValue: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#1a202c",
  },
  projectBox: {
    marginBottom: 24,
    padding: 12,
    backgroundColor: "#ebf8ff",
    borderRadius: 4,
    borderLeft: "3 solid #3182ce",
  },
  projectTitle: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#1a202c",
    marginBottom: 4,
  },
  projectDescription: {
    fontSize: 10,
    color: "#4a5568",
    lineHeight: 1.4,
  },
  table: {
    marginBottom: 24,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#1a365d",
    padding: 10,
  },
  tableHeaderText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 9,
    textTransform: "uppercase",
  },
  tableRow: {
    flexDirection: "row",
    padding: 10,
    borderBottom: "1 solid #e2e8f0",
  },
  tableRowAlt: {
    backgroundColor: "#f7fafc",
  },
  col1: { width: "40%" },
  col2: { width: "10%", textAlign: "center" },
  col3: { width: "15%", textAlign: "center" },
  col4: { width: "15%", textAlign: "right" },
  col5: { width: "20%", textAlign: "right" },
  categoryBadge: {
    fontSize: 7,
    color: "#718096",
    textTransform: "uppercase",
    marginBottom: 2,
  },
  totalsSection: {
    marginLeft: "auto",
    width: "40%",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: "8 12",
    borderBottom: "1 solid #e2e8f0",
  },
  totalLabel: {
    fontSize: 10,
    color: "#4a5568",
  },
  totalValue: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#1a202c",
  },
  grandTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: "12 12",
    backgroundColor: "#1a365d",
  },
  grandTotalLabel: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#fff",
  },
  grandTotalValue: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#fff",
  },
  notesSection: {
    marginTop: 24,
    padding: 16,
    backgroundColor: "#fffaf0",
    borderRadius: 4,
    borderLeft: "3 solid #dd6b20",
  },
  notesTitle: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#c05621",
    marginBottom: 6,
  },
  notesText: {
    fontSize: 9,
    color: "#744210",
    lineHeight: 1.4,
  },
  termsSection: {
    marginTop: 16,
    padding: 16,
    backgroundColor: "#f7fafc",
    borderRadius: 4,
  },
  termsTitle: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#4a5568",
    marginBottom: 6,
  },
  termsText: {
    fontSize: 8,
    color: "#718096",
    lineHeight: 1.5,
  },
  paymentInstructions: {
    marginTop: 16,
    padding: 16,
    backgroundColor: "#ebf8ff",
    borderRadius: 4,
    borderLeft: "3 solid #3182ce",
  },
  paymentInstructionsTitle: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#2b6cb0",
    marginBottom: 6,
  },
  paymentInstructionsText: {
    fontSize: 9,
    color: "#2c5282",
    lineHeight: 1.5,
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    borderTop: "1 solid #e2e8f0",
    paddingTop: 12,
  },
  footerText: {
    fontSize: 8,
    color: "#a0aec0",
    textAlign: "center",
    lineHeight: 1.4,
  },
});

interface EstimatePDFProps {
  estimate: Estimate;
  lineItems: EstimateLineItem[];
  categories?: EstimateCategory[];
  template?: DocumentTemplate;
  companyInfo?: {
    name: string;
    address?: string;
    city?: string;
    phone?: string;
    email?: string;
  };
  paymentInstructions?: {
    bank_name?: string;
    account_name?: string;
    account_number?: string;
    routing_number?: string;
    swift_code?: string;
    mobile_money?: string;
    instructions?: string;
  };
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "BSD",
  }).format(amount);
};

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

const getStatusColor = (status: string) => {
  switch (status) {
    case "approved":
      return "#38a169";
    case "sent":
      return "#3182ce";
    case "rejected":
      return "#e53e3e";
    case "expired":
      return "#718096";
    default:
      return "#a0aec0";
  }
};

export function EstimatePDFTemplate({
  estimate,
  lineItems,
  categories,
  template,
  companyInfo = {
    name: "TropiTech Solutions",
    address: "Nassau",
    city: "Bahamas",
    phone: "(242) 555-1234",
    email: "info@tropitech.bs",
  },
  paymentInstructions,
}: EstimatePDFProps) {
  const hasBuilderData = categories && categories.length > 0;
  // Use template settings or defaults
  const showQuantities = template?.show_quantities ?? true;
  const showRates = template?.show_rates ?? true;
  const showUnitCosts = template?.show_unit_costs ?? true;
  const showSubtotals = template?.show_subtotals ?? true;
  const showMarkupPercentage = template?.show_markup_percentage ?? false;
  const showProfitMargin = template?.show_profit_margin ?? false;
  const showLineItemDescriptions = template?.show_line_item_descriptions ?? true;
  const overheadAmount =
    (estimate.subtotal || 0) * ((estimate.overhead_markup_percent || 0) / 100);
  const subtotalAfterOverhead = (estimate.subtotal || 0) + overheadAmount;
  const profitAmount =
    subtotalAfterOverhead * ((estimate.profit_margin_percent || 0) / 100);
  const subtotalBeforeTax = subtotalAfterOverhead + profitAmount;
  const taxAmount = subtotalBeforeTax * ((estimate.tax_rate || 0) / 100);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.companySection}>
            <Text style={styles.companyName}>{companyInfo.name}</Text>
            <Text style={styles.companyDetails}>
              {companyInfo.address && `${companyInfo.address}\n`}
              {companyInfo.city && `${companyInfo.city}\n`}
              {companyInfo.phone && `${companyInfo.phone}\n`}
              {companyInfo.email && companyInfo.email}
            </Text>
          </View>
          <View style={styles.estimateSection}>
            <Text style={styles.documentTitle}>ESTIMATE</Text>
            <Text style={styles.estimateNumber}>
              #{estimate.estimate_number}
            </Text>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: getStatusColor(estimate.status) },
              ]}
            >
              <Text>{estimate.status}</Text>
            </View>
          </View>
        </View>

        {/* Client Information */}
        <View style={styles.clientSection}>
          <Text style={styles.sectionTitle}>Prepared For</Text>
          <Text style={styles.clientName}>{estimate.client_name || "N/A"}</Text>
          <Text style={styles.clientDetails}>
            {estimate.client_email && `${estimate.client_email}\n`}
            {estimate.client_phone && `${estimate.client_phone}\n`}
            {estimate.client_address && estimate.client_address}
          </Text>
        </View>

        {/* Dates */}
        <View style={styles.datesRow}>
          <View style={styles.dateBox}>
            <Text style={styles.dateLabel}>Issue Date</Text>
            <Text style={styles.dateValue}>
              {formatDate(estimate.issue_date)}
            </Text>
          </View>
          <View style={styles.dateBox}>
            <Text style={styles.dateLabel}>Valid Until</Text>
            <Text style={styles.dateValue}>
              {estimate.valid_until ? formatDate(estimate.valid_until) : "N/A"}
            </Text>
          </View>
        </View>

        {/* Project Title */}
        <View style={styles.projectBox}>
          <Text style={styles.projectTitle}>{estimate.title}</Text>
          {estimate.description && (
            <Text style={styles.projectDescription}>{estimate.description}</Text>
          )}
        </View>

        {/* Line Items Table */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, styles.col1]}>Description</Text>
            {showQuantities && <Text style={[styles.tableHeaderText, styles.col2]}>Qty</Text>}
            {showQuantities && <Text style={[styles.tableHeaderText, styles.col3]}>Unit</Text>}
            {showRates && <Text style={[styles.tableHeaderText, styles.col4]}>Rate</Text>}
            <Text style={[styles.tableHeaderText, styles.col5]}>Amount</Text>
          </View>

          {hasBuilderData ? (
            /* Category-grouped rendering for builder estimates */
            <>
              {categories!.filter(c => c.show_to_client !== false).map((category) => {
                const items = ((category.items || []) as any[]).filter(
                  (i: any) => i.show_to_client !== false
                );
                return (
                  <View key={category.id}>
                    {/* Category header */}
                    <View style={[styles.tableRow, { backgroundColor: "#edf2f7" }]}>
                      <Text style={[styles.col1, { fontWeight: "bold", fontSize: 10 }]}>
                        {category.name}
                      </Text>
                      <Text style={styles.col2} />
                      <Text style={styles.col3} />
                      <Text style={styles.col4} />
                      <Text style={[styles.col5, { fontWeight: "bold" }]}>
                        {formatCurrency(category.client_price || 0)}
                      </Text>
                    </View>
                    {/* Category items */}
                    {items.map((item: any, idx: number) => (
                      <View
                        key={item.id}
                        style={[styles.tableRow, ...(idx % 2 === 1 ? [styles.tableRowAlt] : [])]}
                      >
                        <View style={[styles.col1, { paddingLeft: 12 }]}>
                          <Text>{item.title || item.description}</Text>
                          {item.description && item.title && item.description !== item.title && showLineItemDescriptions && (
                            <Text style={{ fontSize: 8, color: "#718096" }}>
                              {item.description}
                            </Text>
                          )}
                        </View>
                        {showQuantities && (
                          <Text style={styles.col2}>
                            {item.quantity ? Number(item.quantity).toFixed(item.quantity % 1 === 0 ? 0 : 2) : "-"}
                          </Text>
                        )}
                        {showQuantities && (
                          <Text style={styles.col3}>{item.unit || "-"}</Text>
                        )}
                        {showRates && (
                          <Text style={styles.col4}>
                            {item.unit_cost ? formatCurrency(item.unit_cost) : item.unit_rate ? formatCurrency(item.unit_rate) : "-"}
                          </Text>
                        )}
                        <Text style={styles.col5}>
                          {formatCurrency(item.client_price || item.amount || 0)}
                        </Text>
                      </View>
                    ))}
                  </View>
                );
              })}
            </>
          ) : (
            /* Legacy flat line items rendering */
            <>
              {lineItems.map((item, index) => {
                const hasQuantity = item.quantity !== null && item.quantity !== undefined;
                const hasRate = item.unit_rate !== null && item.unit_rate !== undefined;

                return (
                  <View
                    key={item.id}
                    style={[styles.tableRow, ...(index % 2 === 1 ? [styles.tableRowAlt] : [])]}
                  >
                    <View style={styles.col1}>
                      <Text style={styles.categoryBadge}>{item.category}</Text>
                      {showLineItemDescriptions && <Text>{item.description}</Text>}
                      {!showLineItemDescriptions && <Text>{item.category}</Text>}
                    </View>
                    {showQuantities && (
                      <Text style={styles.col2}>{hasQuantity ? item.quantity : "-"}</Text>
                    )}
                    {showQuantities && (
                      <Text style={styles.col3}>{hasQuantity && item.unit ? item.unit : "-"}</Text>
                    )}
                    {showRates && (
                      <Text style={styles.col4}>{hasRate && item.unit_rate !== undefined ? formatCurrency(item.unit_rate) : "-"}</Text>
                    )}
                    <Text style={styles.col5}>{formatCurrency(item.amount)}</Text>
                  </View>
                );
              })}
            </>
          )}
        </View>

        {/* Totals */}
        <View style={styles.totalsSection}>
          {hasBuilderData ? (
            <>
              <View style={styles.grandTotalRow}>
                <Text style={styles.grandTotalLabel}>Total Price</Text>
                <Text style={styles.grandTotalValue}>
                  {formatCurrency((estimate as any).client_price || estimate.total_amount)}
                </Text>
              </View>
            </>
          ) : (
            <>
              {showSubtotals && (
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Subtotal</Text>
                  <Text style={styles.totalValue}>
                    {formatCurrency(estimate.subtotal)}
                  </Text>
                </View>
              )}
              {showMarkupPercentage && estimate.overhead_markup_percent > 0 && (
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>
                    Overhead ({estimate.overhead_markup_percent}%)
                  </Text>
                  <Text style={styles.totalValue}>
                    {formatCurrency(overheadAmount)}
                  </Text>
                </View>
              )}
              {showProfitMargin && estimate.profit_margin_percent > 0 && (
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>
                    Profit Margin ({estimate.profit_margin_percent}%)
                  </Text>
                  <Text style={styles.totalValue}>
                    {formatCurrency(profitAmount)}
                  </Text>
                </View>
              )}
              {estimate.tax_rate > 0 && (
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>
                    VAT ({estimate.tax_rate}%)
                  </Text>
                  <Text style={styles.totalValue}>{formatCurrency(taxAmount)}</Text>
                </View>
              )}
              <View style={styles.grandTotalRow}>
                <Text style={styles.grandTotalLabel}>Total</Text>
                <Text style={styles.grandTotalValue}>
                  {formatCurrency(estimate.total_amount)}
                </Text>
              </View>
            </>
          )}
        </View>

        {/* Notes */}
        {estimate.notes && (
          <View style={styles.notesSection}>
            <Text style={styles.notesTitle}>Notes</Text>
            <Text style={styles.notesText}>{estimate.notes}</Text>
          </View>
        )}

        {/* Terms */}
        {estimate.terms_and_conditions && (
          <View style={styles.termsSection}>
            <Text style={styles.termsTitle}>Terms & Conditions</Text>
            <Text style={styles.termsText}>{estimate.terms_and_conditions}</Text>
          </View>
        )}

        {/* Payment Instructions (optional for estimates) */}
        {paymentInstructions && (
          paymentInstructions.bank_name ||
          paymentInstructions.mobile_money ||
          paymentInstructions.instructions
        ) && (
          <View style={styles.paymentInstructions}>
            <Text style={styles.paymentInstructionsTitle}>
              Payment Information
            </Text>
            <Text style={styles.paymentInstructionsText}>
              {paymentInstructions.bank_name && (
                <>
                  Bank: {paymentInstructions.bank_name}{"\n"}
                  {paymentInstructions.account_name && `Account Name: ${paymentInstructions.account_name}\n`}
                  {paymentInstructions.account_number && `Account Number: ${paymentInstructions.account_number}\n`}
                  {paymentInstructions.routing_number && `Routing Number: ${paymentInstructions.routing_number}\n`}
                  {paymentInstructions.swift_code && `SWIFT Code: ${paymentInstructions.swift_code}\n`}
                  {"\n"}
                </>
              )}

              {paymentInstructions.mobile_money && (
                <>
                  Mobile Payment: {paymentInstructions.mobile_money}{"\n\n"}
                </>
              )}

              {paymentInstructions.instructions && (
                <>
                  {paymentInstructions.instructions}
                </>
              )}
            </Text>
          </View>
        )}

        {/* Signature Section */}
        <View style={{ marginTop: 40, flexDirection: "row", gap: 40 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 9, color: "#718096", marginBottom: 30 }}>
              Client Signature
            </Text>
            <View style={{ borderBottom: "1 solid #4a5568", marginBottom: 6 }} />
            <Text style={{ fontSize: 9, color: "#718096" }}>
              Signature
            </Text>
            <View style={{ borderBottom: "1 solid #4a5568", marginBottom: 6, marginTop: 16 }} />
            <Text style={{ fontSize: 9, color: "#718096" }}>
              Printed Name
            </Text>
            <View style={{ borderBottom: "1 solid #4a5568", marginBottom: 6, marginTop: 16 }} />
            <Text style={{ fontSize: 9, color: "#718096" }}>
              Date
            </Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Thank you for considering {companyInfo.name} for your project.
            {"\n"}
            This estimate is valid for 30 days from the issue date.
          </Text>
        </View>
      </Page>
    </Document>
  );
}
