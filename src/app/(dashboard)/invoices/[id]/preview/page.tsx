"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
import type { Invoice, InvoiceLineItem, Payment } from "@/types";

const PDFDownloadLink = dynamic(
  () => import("@react-pdf/renderer").then((mod) => mod.PDFDownloadLink),
  { ssr: false }
);

const PDFViewer = dynamic(
  () => import("@react-pdf/renderer").then((mod) => mod.PDFViewer),
  { ssr: false }
);

import { InvoicePDFTemplate } from "@/components/pdf/invoice-pdf-template";

export default function InvoicePreviewPage() {
  const params = useParams();
  const router = useRouter();
  const invoiceId = params.id as string;
  const { toast } = useToast();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [pdfReady, setPdfReady] = useState(false);

  useEffect(() => {
    fetchInvoiceData();
  }, [invoiceId]);

  useEffect(() => {
    // Give the PDF renderer a moment to initialize
    const timer = setTimeout(() => setPdfReady(true), 500);
    return () => clearTimeout(timer);
  }, []);

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
    } catch (error) {
      console.error("Error fetching invoice:", error);
      toast({
        title: "Error",
        description: "Failed to load invoice data",
        variant: "destructive",
      });
      router.push("/invoices");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header title="Invoice Preview" description="Loading...">
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
    return null;
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header
        title={`Preview - ${invoice.invoice_number}`}
        description="Preview and download the invoice PDF"
      >
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push(`/invoices/${invoiceId}`)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          {pdfReady && (
            <PDFDownloadLink
              document={
                <InvoicePDFTemplate
                  invoice={invoice}
                  lineItems={lineItems}
                  payments={payments}
                />
              }
              fileName={`Invoice-${invoice.invoice_number}.pdf`}
            >
              {({ loading: pdfLoading }) => (
                <Button disabled={pdfLoading}>
                  {pdfLoading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 mr-2" />
                  )}
                  Download PDF
                </Button>
              )}
            </PDFDownloadLink>
          )}
        </div>
      </Header>

      <div className="flex-1 p-6">
        <Card>
          <CardContent className="p-0">
            {pdfReady ? (
              <PDFViewer
                style={{ width: "100%", height: "calc(100vh - 200px)", border: "none" }}
                showToolbar={false}
              >
                <InvoicePDFTemplate
                  invoice={invoice}
                  lineItems={lineItems}
                  payments={payments}
                />
              </PDFViewer>
            ) : (
              <div className="h-[600px] flex items-center justify-center">
                <div className="text-center">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
                  <p className="text-muted-foreground">Generating PDF preview...</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
