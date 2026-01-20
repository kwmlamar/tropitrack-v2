"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Send,
  Mail,
  Phone,
  MapPin,
  CreditCard,
  CheckCircle,
  Loader2,
  Receipt,
  Building2,
  DollarSign,
  FileText,
} from "lucide-react";
import type { Invoice, InvoiceLineItem, Payment, PaymentMethod, InvoiceStatus } from "@/types";

export default function InvoiceDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const invoiceId = params.id as string;
  const { toast } = useToast();
  const { profile } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [recordingPayment, setRecordingPayment] = useState(false);

  // Payment form state
  const [paymentForm, setPaymentForm] = useState({
    amount: 0,
    payment_date: new Date().toISOString().split("T")[0],
    payment_method: "bank_transfer" as PaymentMethod,
    reference_number: "",
    notes: "",
  });

  // Email state
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailForm, setEmailForm] = useState({
    to_email: "",
    subject: "",
    message: "",
  });

  useEffect(() => {
    fetchInvoiceData();

    if (searchParams.get("payment") === "true") {
      setShowPaymentDialog(true);
    }
  }, [invoiceId]);

  const fetchInvoiceData = async () => {
    setLoading(true);
    try {
      const [invoiceRes, itemsRes, paymentsRes] = await Promise.all([
        supabase.from("invoices").select("*").eq("id", invoiceId).single(),
        supabase
          .from("invoice_line_items")
          .select("*")
          .eq("invoice_id", invoiceId)
          .order("order_index"),
        supabase
          .from("payments")
          .select("*")
          .eq("invoice_id", invoiceId)
          .order("payment_date", { ascending: false }),
      ]);

      if (invoiceRes.error) throw invoiceRes.error;

      setInvoice(invoiceRes.data);
      setLineItems(itemsRes.data || []);
      setPayments(paymentsRes.data || []);

      // Set default payment amount to balance due
      setPaymentForm((prev) => ({
        ...prev,
        amount: invoiceRes.data.balance_due,
      }));
    } catch (error) {
      console.error("Error fetching invoice:", error);
      toast({
        title: "Error",
        description: "Failed to load invoice data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (newStatus: InvoiceStatus) => {
    try {
      const updateData: Partial<Invoice> = { status: newStatus };
      if (newStatus === "sent") updateData.sent_at = new Date().toISOString();

      const { error } = await supabase
        .from("invoices")
        .update(updateData)
        .eq("id", invoiceId);

      if (error) throw error;

      setInvoice({ ...invoice!, ...updateData });
      toast({
        title: "Status updated",
        description: `Invoice marked as ${newStatus}.`,
      });
    } catch (error: any) {
      console.error("Error updating status:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to update status",
        variant: "destructive",
      });
    }
  };

  const handleSendEmail = async () => {
    if (!emailForm.to_email) {
      toast({
        title: "Error",
        description: "Email address is required",
        variant: "destructive",
      });
      return;
    }

    setSendingEmail(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-invoice", {
        body: {
          invoice_id: invoiceId,
          to_email: emailForm.to_email,
          subject: emailForm.subject || undefined,
          message: emailForm.message || undefined,
        },
      });

      if (error) throw error;

      toast({
        title: "Email sent",
        description: `Invoice sent to ${emailForm.to_email}`,
      });

      setShowEmailDialog(false);
      if (invoice?.status === "draft") {
        setInvoice({ ...invoice!, status: "sent", sent_at: new Date().toISOString() });
      }
    } catch (error: any) {
      console.error("Error sending email:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to send email",
        variant: "destructive",
      });
    } finally {
      setSendingEmail(false);
    }
  };

  const handleRecordPayment = async () => {
    if (!paymentForm.amount || paymentForm.amount <= 0) {
      toast({
        title: "Error",
        description: "Please enter a valid payment amount",
        variant: "destructive",
      });
      return;
    }

    setRecordingPayment(true);
    try {
      const { error } = await supabase.from("payments").insert({
        invoice_id: invoiceId,
        amount: paymentForm.amount,
        payment_date: paymentForm.payment_date,
        payment_method: paymentForm.payment_method,
        reference_number: paymentForm.reference_number || null,
        notes: paymentForm.notes || null,
        received_by: profile?.id,
      });

      if (error) throw error;

      toast({
        title: "Payment recorded",
        description: `Payment of ${formatCurrency(paymentForm.amount)} has been recorded.`,
      });

      setShowPaymentDialog(false);
      fetchInvoiceData();
    } catch (error: any) {
      console.error("Error recording payment:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to record payment",
        variant: "destructive",
      });
    } finally {
      setRecordingPayment(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this invoice?")) return;

    try {
      const { error } = await supabase.from("invoices").delete().eq("id", invoiceId);
      if (error) throw error;

      toast({
        title: "Invoice deleted",
        description: "The invoice has been removed.",
      });
      router.push("/invoices");
    } catch (error: any) {
      console.error("Error deleting invoice:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete invoice",
        variant: "destructive",
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "draft":
        return "bg-gray-100 text-gray-800";
      case "sent":
        return "bg-blue-100 text-blue-800";
      case "viewed":
        return "bg-cyan-100 text-cyan-800";
      case "paid":
        return "bg-green-100 text-green-800";
      case "partial":
        return "bg-amber-100 text-amber-800";
      case "overdue":
        return "bg-red-100 text-red-800";
      case "cancelled":
      case "void":
        return "bg-gray-100 text-gray-500";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const paymentMethods: { value: PaymentMethod; label: string }[] = [
    { value: "cash", label: "Cash" },
    { value: "check", label: "Check" },
    { value: "bank_transfer", label: "Bank Transfer" },
    { value: "credit_card", label: "Credit Card" },
    { value: "other", label: "Other" },
  ];

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header title="Invoice Details" description="Loading...">
          <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </Header>
        <div className="flex-1 p-6 flex items-center justify-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
        </div>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header title="Invoice Not Found" description="The requested invoice could not be found">
          <Button variant="outline" onClick={() => router.push("/invoices")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Invoices
          </Button>
        </Header>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header
        title={`Invoice ${invoice.invoice_number}`}
        description={`${invoice.client_name} - ${formatDate(invoice.issue_date)}`}
      >
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.push("/invoices")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Link href={`/invoices/${invoiceId}/preview`}>
            <Button variant="outline">
              <FileText className="h-4 w-4 mr-2" />
              Preview PDF
            </Button>
          </Link>
          {invoice.status === "draft" && (
            <>
              <Link href={`/invoices/${invoiceId}/edit`}>
                <Button variant="outline">
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </Button>
              </Link>
              <Button
                onClick={() => {
                  setEmailForm({
                    to_email: invoice.client_email || "",
                    subject: `Invoice ${invoice.invoice_number} from TropiTech Solutions`,
                    message: "",
                  });
                  setShowEmailDialog(true);
                }}
              >
                <Mail className="h-4 w-4 mr-2" />
                Send Email
              </Button>
            </>
          )}
          {invoice.balance_due > 0 && invoice.status !== "draft" && (
            <Button onClick={() => setShowPaymentDialog(true)}>
              <CreditCard className="h-4 w-4 mr-2" />
              Record Payment
            </Button>
          )}
        </div>
      </Header>

      <div className="flex-1 p-6 space-y-6">
        {/* Status Banner */}
        <Card
          className={
            invoice.status === "paid"
              ? "border-green-200 bg-green-50"
              : invoice.status === "overdue"
              ? "border-red-200 bg-red-50"
              : ""
          }
        >
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Badge className={`${getStatusColor(invoice.status)} text-sm px-3 py-1`}>
                  {invoice.status.toUpperCase()}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  Due: {formatDate(invoice.due_date)}
                </span>
              </div>
              {invoice.project_id && (
                <Link href={`/projects/${invoice.project_id}`}>
                  <Button variant="link">
                    <Building2 className="h-4 w-4 mr-2" />
                    View Project
                  </Button>
                </Link>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Client & Invoice Summary */}
        <div className="grid gap-6 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Bill To</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="font-medium text-lg">{invoice.client_name}</div>
              {invoice.client_email && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-4 w-4" />
                  <a href={`mailto:${invoice.client_email}`} className="hover:text-primary">
                    {invoice.client_email}
                  </a>
                </div>
              )}
              {invoice.client_phone && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-4 w-4" />
                  {invoice.client_phone}
                </div>
              )}
              {invoice.client_address && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  {invoice.client_address}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Invoice Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Invoice #</span>
                <span className="font-medium">{invoice.invoice_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Type</span>
                <span className="capitalize">{invoice.invoice_type.replace("_", " ")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Issue Date</span>
                <span>{formatDate(invoice.issue_date)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Due Date</span>
                <span>{formatDate(invoice.due_date)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payment Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Amount</span>
                <span className="font-medium">{formatCurrency(invoice.total_amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount Paid</span>
                <span className="text-green-600">{formatCurrency(invoice.amount_paid)}</span>
              </div>
              <Separator />
              <div className="flex justify-between text-lg font-bold">
                <span>Balance Due</span>
                <span
                  className={
                    invoice.balance_due > 0 ? "text-amber-600" : "text-green-600"
                  }
                >
                  {formatCurrency(invoice.balance_due)}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Line Items */}
        <Card>
          <CardHeader>
            <CardTitle>Line Items</CardTitle>
            <CardDescription>{lineItems.length} items</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="w-[40%]">Description</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lineItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {item.category}
                      </Badge>
                    </TableCell>
                    <TableCell>{item.description}</TableCell>
                    <TableCell className="text-right">{item.quantity}</TableCell>
                    <TableCell>{item.unit || "-"}</TableCell>
                    <TableCell className="text-right">{formatCurrency(item.unit_rate)}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(item.amount)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/50">
                  <TableCell colSpan={5} className="text-right font-medium">
                    Subtotal
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(invoice.subtotal)}
                  </TableCell>
                </TableRow>
                {invoice.tax_amount > 0 && (
                  <TableRow className="bg-muted/50">
                    <TableCell colSpan={5} className="text-right font-medium">
                      Tax ({invoice.tax_rate}%)
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(invoice.tax_amount)}
                    </TableCell>
                  </TableRow>
                )}
                <TableRow className="bg-muted">
                  <TableCell colSpan={5} className="text-right font-bold text-lg">
                    Total
                  </TableCell>
                  <TableCell className="text-right font-bold text-lg">
                    {formatCurrency(invoice.total_amount)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Payments History */}
        {payments.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Payment History
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell>{formatDate(payment.payment_date)}</TableCell>
                      <TableCell className="capitalize">
                        {payment.payment_method.replace("_", " ")}
                      </TableCell>
                      <TableCell>{payment.reference_number || "-"}</TableCell>
                      <TableCell className="text-right font-medium text-green-600">
                        {formatCurrency(payment.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Terms */}
        {invoice.terms && (
          <Card>
            <CardHeader>
              <CardTitle>Terms</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground whitespace-pre-wrap">{invoice.terms}</p>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-4">
          <Button variant="destructive" onClick={handleDelete}>
            <Trash2 className="h-4 w-4 mr-2" />
            Delete Invoice
          </Button>
        </div>
      </div>

      {/* Record Payment Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              Record a payment for invoice {invoice?.invoice_number}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-4 bg-muted rounded-lg">
              <div className="flex justify-between mb-2">
                <span className="text-muted-foreground">Invoice Total</span>
                <span className="font-medium">{formatCurrency(invoice?.total_amount || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Balance Due</span>
                <span className="font-bold text-lg">{formatCurrency(invoice?.balance_due || 0)}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="payment_amount">Payment Amount (BSD) *</Label>
              <Input
                id="payment_amount"
                type="number"
                min="0"
                step="0.01"
                value={paymentForm.amount}
                onChange={(e) =>
                  setPaymentForm({ ...paymentForm, amount: parseFloat(e.target.value) || 0 })
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="payment_date">Payment Date *</Label>
                <DatePicker
                  id="payment_date"
                  value={paymentForm.payment_date}
                  onChange={(value) =>
                    setPaymentForm({ ...paymentForm, payment_date: value })
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Payment Method *</Label>
                <Select
                  value={paymentForm.payment_method}
                  onValueChange={(value) =>
                    setPaymentForm({ ...paymentForm, payment_method: value as PaymentMethod })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentMethods.map((method) => (
                      <SelectItem key={method.value} value={method.value}>
                        {method.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reference_number">Reference / Check Number</Label>
              <Input
                id="reference_number"
                value={paymentForm.reference_number}
                onChange={(e) =>
                  setPaymentForm({ ...paymentForm, reference_number: e.target.value })
                }
                placeholder="Check #, transaction ID, etc."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="payment_notes">Notes</Label>
              <Textarea
                id="payment_notes"
                value={paymentForm.notes}
                onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPaymentDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleRecordPayment} disabled={recordingPayment}>
              {recordingPayment && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Record Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Email Dialog */}
      <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Invoice via Email</DialogTitle>
            <DialogDescription>
              Send this invoice to {invoice?.client_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="to_email">Recipient Email *</Label>
              <Input
                id="to_email"
                type="email"
                value={emailForm.to_email}
                onChange={(e) => setEmailForm({ ...emailForm, to_email: e.target.value })}
                placeholder="client@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email_subject">Subject</Label>
              <Input
                id="email_subject"
                value={emailForm.subject}
                onChange={(e) => setEmailForm({ ...emailForm, subject: e.target.value })}
                placeholder="Invoice from TropiTech Solutions"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email_message">Message (optional)</Label>
              <Textarea
                id="email_message"
                value={emailForm.message}
                onChange={(e) => setEmailForm({ ...emailForm, message: e.target.value })}
                placeholder="Add a personal message..."
                rows={3}
              />
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">PDF invoice will be attached to the email</span>
              </div>
              <div className="text-sm text-muted-foreground">
                Amount due: <strong>{formatCurrency(invoice?.balance_due || 0)}</strong>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEmailDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSendEmail} disabled={sendingEmail}>
              {sendingEmail && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Send className="h-4 w-4 mr-2" />
              Send Email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
