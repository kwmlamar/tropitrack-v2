"use client";

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import type { Invoice, InvoiceLineItem, Payment, DocumentTemplate } from "@/types";

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
  invoiceSection: {
    textAlign: "right",
  },
  documentTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1a365d",
    marginBottom: 4,
  },
  invoiceNumber: {
    fontSize: 12,
    color: "#4a5568",
    marginBottom: 2,
  },
  statusBadge: {
    fontSize: 10,
    color: "#fff",
    padding: "4 8",
    borderRadius: 4,
    marginTop: 8,
    textTransform: "uppercase",
  },
  billToSection: {
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
  dateBoxDue: {
    flex: 1,
    padding: 12,
    backgroundColor: "#fff5f5",
    borderRadius: 4,
    borderLeft: "3 solid #e53e3e",
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
  dateValueDue: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#c53030",
  },
  invoiceTypeBox: {
    marginBottom: 24,
    padding: 12,
    backgroundColor: "#ebf8ff",
    borderRadius: 4,
    borderLeft: "3 solid #3182ce",
  },
  invoiceTypeLabel: {
    fontSize: 9,
    color: "#2b6cb0",
    marginBottom: 2,
    textTransform: "uppercase",
  },
  invoiceTypeValue: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#2c5282",
    textTransform: "capitalize",
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
    width: "45%",
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
  paidRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: "8 12",
    backgroundColor: "#f0fff4",
    borderBottom: "1 solid #c6f6d5",
  },
  paidLabel: {
    fontSize: 10,
    color: "#276749",
  },
  paidValue: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#276749",
  },
  balanceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: "12 12",
    backgroundColor: "#1a365d",
  },
  balanceLabel: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#fff",
  },
  balanceValue: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#fff",
  },
  balancePaidRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: "12 12",
    backgroundColor: "#38a169",
  },
  paymentsSection: {
    marginTop: 24,
    padding: 16,
    backgroundColor: "#f0fff4",
    borderRadius: 4,
    borderLeft: "3 solid #38a169",
  },
  paymentsTitle: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#276749",
    marginBottom: 8,
  },
  paymentRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: "6 0",
    borderBottom: "1 solid #c6f6d5",
  },
  paymentInfo: {
    fontSize: 9,
    color: "#2f855a",
  },
  paymentAmount: {
    fontSize: 9,
    fontWeight: "bold",
    color: "#276749",
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
  paymentInstructions: {
    marginTop: 24,
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
});

interface InvoicePDFProps {
  invoice: Invoice;
  lineItems: InvoiceLineItem[];
  payments?: Payment[];
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
    case "paid":
      return "#38a169";
    case "sent":
      return "#3182ce";
    case "viewed":
      return "#00b5d8";
    case "partial":
      return "#d69e2e";
    case "overdue":
      return "#e53e3e";
    case "cancelled":
    case "void":
      return "#718096";
    default:
      return "#a0aec0";
  }
};

const formatInvoiceType = (type: string) => {
  return type.replace(/_/g, " ");
};

export function InvoicePDFTemplate({
  invoice,
  lineItems,
  payments = [],
  template,
  companyInfo = {
    name: "TropiTech Solutions",
    address: "Nassau",
    city: "Bahamas",
    phone: "(242) 555-1234",
    email: "info@tropitech.bs",
  },
  paymentInstructions,
}: InvoicePDFProps) {
  const isPaid = invoice.status === "paid";
  const isOverdue =
    !isPaid &&
    invoice.status !== "cancelled" &&
    invoice.status !== "void" &&
    new Date(invoice.due_date) < new Date();

  // Use template settings or defaults
  const showQuantities = template?.show_quantities ?? true;
  const showRates = template?.show_rates ?? true;
  const showUnitCosts = template?.show_unit_costs ?? true;
  const showSubtotals = template?.show_subtotals ?? true;
  const showLineItemDescriptions = template?.show_line_item_descriptions ?? true;

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
          <View style={styles.invoiceSection}>
            <Text style={styles.documentTitle}>INVOICE</Text>
            <Text style={styles.invoiceNumber}>#{invoice.invoice_number}</Text>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: getStatusColor(invoice.status) },
              ]}
            >
              <Text>{invoice.status}</Text>
            </View>
          </View>
        </View>

        {/* Bill To */}
        <View style={styles.billToSection}>
          <Text style={styles.sectionTitle}>Bill To</Text>
          <Text style={styles.clientName}>{invoice.client_name || "N/A"}</Text>
          <Text style={styles.clientDetails}>
            {invoice.client_email && `${invoice.client_email}\n`}
            {invoice.client_phone && `${invoice.client_phone}\n`}
            {invoice.client_address && invoice.client_address}
          </Text>
        </View>

        {/* Dates */}
        <View style={styles.datesRow}>
          <View style={styles.dateBox}>
            <Text style={styles.dateLabel}>Invoice Date</Text>
            <Text style={styles.dateValue}>{formatDate(invoice.issue_date)}</Text>
          </View>
          <View style={isOverdue ? styles.dateBoxDue : styles.dateBox}>
            <Text style={styles.dateLabel}>Due Date</Text>
            <Text style={isOverdue ? styles.dateValueDue : styles.dateValue}>
              {formatDate(invoice.due_date)}
              {isOverdue && " (OVERDUE)"}
            </Text>
          </View>
          <View style={styles.invoiceTypeBox}>
            <Text style={styles.invoiceTypeLabel}>Invoice Type</Text>
            <Text style={styles.invoiceTypeValue}>
              {formatInvoiceType(invoice.invoice_type)}
            </Text>
          </View>
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
          {lineItems.map((item, index) => {
            const isLumpSum = item.entry_mode === "lump_sum";
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
                  <Text style={styles.col4}>{hasRate ? formatCurrency(item.unit_rate) : "-"}</Text>
                )}
                <Text style={styles.col5}>{formatCurrency(item.amount)}</Text>
              </View>
            );
          })}
        </View>

        {/* Totals */}
        <View style={styles.totalsSection}>
          {showSubtotals && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal</Text>
              <Text style={styles.totalValue}>
                {formatCurrency(invoice.subtotal)}
              </Text>
            </View>
          )}
          {invoice.tax_rate > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>VAT ({invoice.tax_rate}%)</Text>
              <Text style={styles.totalValue}>
                {formatCurrency(invoice.tax_amount)}
              </Text>
            </View>
          )}
          {showSubtotals && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>
                {formatCurrency(invoice.total_amount)}
              </Text>
            </View>
          )}
          {invoice.amount_paid > 0 && (
            <View style={styles.paidRow}>
              <Text style={styles.paidLabel}>Amount Paid</Text>
              <Text style={styles.paidValue}>
                -{formatCurrency(invoice.amount_paid)}
              </Text>
            </View>
          )}
          <View style={isPaid ? styles.balancePaidRow : styles.balanceRow}>
            <Text style={styles.balanceLabel}>
              {isPaid ? "PAID IN FULL" : "Balance Due"}
            </Text>
            <Text style={styles.balanceValue}>
              {formatCurrency(invoice.balance_due)}
            </Text>
          </View>
        </View>

        {/* Payment History */}
        {payments.length > 0 && (
          <View style={styles.paymentsSection}>
            <Text style={styles.paymentsTitle}>Payment History</Text>
            {payments.map((payment) => (
              <View key={payment.id} style={styles.paymentRow}>
                <Text style={styles.paymentInfo}>
                  {formatDate(payment.payment_date)} -{" "}
                  {payment.payment_method.replace(/_/g, " ")}
                  {payment.reference_number && ` (Ref: ${payment.reference_number})`}
                </Text>
                <Text style={styles.paymentAmount}>
                  {formatCurrency(payment.amount)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Payment Instructions (only if not paid and instructions exist) */}
        {!isPaid && invoice.balance_due > 0 && paymentInstructions && (
          paymentInstructions.bank_name ||
          paymentInstructions.mobile_money ||
          paymentInstructions.instructions
        ) && (
          <View style={styles.paymentInstructions}>
            <Text style={styles.paymentInstructionsTitle}>
              Payment Instructions
            </Text>
            <Text style={styles.paymentInstructionsText}>
              Please make payment to:{"\n\n"}

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
                  Or via Mobile Payment: {paymentInstructions.mobile_money}{"\n\n"}
                </>
              )}

              {paymentInstructions.instructions && (
                <>
                  {paymentInstructions.instructions}{"\n\n"}
                </>
              )}

              Reference: {invoice.invoice_number}
            </Text>
          </View>
        )}

        {/* Default payment message if no instructions configured */}
        {!isPaid && invoice.balance_due > 0 && (!paymentInstructions || (
          !paymentInstructions.bank_name &&
          !paymentInstructions.mobile_money &&
          !paymentInstructions.instructions
        )) && (
          <View style={styles.paymentInstructions}>
            <Text style={styles.paymentInstructionsTitle}>
              Payment Instructions
            </Text>
            <Text style={styles.paymentInstructionsText}>
              Payment is due upon receipt. Please reference invoice {invoice.invoice_number} with your payment.
              {"\n\n"}
              For payment details, please contact us at {companyInfo.email || companyInfo.phone}.
            </Text>
          </View>
        )}

        {/* Notes */}
        {invoice.notes && (
          <View style={styles.notesSection}>
            <Text style={styles.notesTitle}>Notes</Text>
            <Text style={styles.notesText}>{invoice.notes}</Text>
          </View>
        )}

        {/* Terms */}
        {invoice.terms && (
          <View style={styles.termsSection}>
            <Text style={styles.termsTitle}>Terms & Conditions</Text>
            <Text style={styles.termsText}>{invoice.terms}</Text>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Thank you for your business!{"\n"}
            Questions? Contact us at {companyInfo.email} or {companyInfo.phone}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
