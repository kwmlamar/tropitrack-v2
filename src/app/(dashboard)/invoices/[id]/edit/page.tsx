"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { InvoiceForm } from "@/components/invoices/invoice-form";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft } from "lucide-react";
import type { Invoice, InvoiceLineItem } from "@/types";

export default function EditInvoicePage() {
  const params = useParams();
  const router = useRouter();
  const invoiceId = params.id as string;
  const { toast } = useToast();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([]);

  useEffect(() => {
    fetchInvoiceData();
  }, [invoiceId]);

  const fetchInvoiceData = async () => {
    setLoading(true);
    try {
      const [invoiceRes, itemsRes] = await Promise.all([
        supabase.from("invoices").select("*").eq("id", invoiceId).single(),
        supabase
          .from("invoice_line_items")
          .select("*")
          .eq("invoice_id", invoiceId)
          .order("order_index"),
      ]);

      if (invoiceRes.error) throw invoiceRes.error;

      // Only allow editing draft invoices
      if (invoiceRes.data.status !== "draft") {
        toast({
          title: "Cannot edit",
          description: "Only draft invoices can be edited.",
          variant: "destructive",
        });
        router.push(`/invoices/${invoiceId}`);
        return;
      }

      setInvoice(invoiceRes.data);
      setLineItems(itemsRes.data || []);
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
        <Header title="Edit Invoice" description="Loading...">
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
        title={`Edit Invoice ${invoice.invoice_number}`}
        description="Update invoice details and line items"
      >
        <Button variant="outline" onClick={() => router.push(`/invoices/${invoiceId}`)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </Header>

      <div className="flex-1 p-6">
        <InvoiceForm invoice={invoice} lineItems={lineItems} mode="edit" />
      </div>
    </div>
  );
}
