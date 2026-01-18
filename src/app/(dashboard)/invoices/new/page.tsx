"use client";

import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { InvoiceForm } from "@/components/invoices/invoice-form";
import { ArrowLeft } from "lucide-react";

export default function NewInvoicePage() {
  const router = useRouter();

  return (
    <div className="flex flex-col min-h-screen">
      <Header title="New Invoice" description="Create a new invoice">
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </Header>

      <div className="flex-1 p-6">
        <InvoiceForm mode="create" />
      </div>
    </div>
  );
}
