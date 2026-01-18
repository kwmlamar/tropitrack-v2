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
import type { Estimate, EstimateLineItem } from "@/types";

const PDFDownloadLink = dynamic(
  () => import("@react-pdf/renderer").then((mod) => mod.PDFDownloadLink),
  { ssr: false }
);

const PDFViewer = dynamic(
  () => import("@react-pdf/renderer").then((mod) => mod.PDFViewer),
  { ssr: false }
);

import { EstimatePDFTemplate } from "@/components/pdf/estimate-pdf-template";

export default function EstimatePreviewPage() {
  const params = useParams();
  const router = useRouter();
  const estimateId = params.id as string;
  const { toast } = useToast();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [lineItems, setLineItems] = useState<EstimateLineItem[]>([]);
  const [pdfReady, setPdfReady] = useState(false);

  useEffect(() => {
    fetchEstimateData();
  }, [estimateId]);

  useEffect(() => {
    // Give the PDF renderer a moment to initialize
    const timer = setTimeout(() => setPdfReady(true), 500);
    return () => clearTimeout(timer);
  }, []);

  const fetchEstimateData = async () => {
    setLoading(true);
    try {
      const [estimateRes, itemsRes] = await Promise.all([
        supabase.from("estimates").select("*").eq("id", estimateId).single(),
        supabase
          .from("estimate_line_items")
          .select("*")
          .eq("estimate_id", estimateId)
          .order("order_index"),
      ]);

      if (estimateRes.error) throw estimateRes.error;

      setEstimate(estimateRes.data);
      setLineItems(itemsRes.data || []);
    } catch (error) {
      console.error("Error fetching estimate:", error);
      toast({
        title: "Error",
        description: "Failed to load estimate data",
        variant: "destructive",
      });
      router.push("/estimates");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header title="Estimate Preview" description="Loading...">
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

  if (!estimate) {
    return null;
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header
        title={`Preview - ${estimate.estimate_number}`}
        description="Preview and download the estimate PDF"
      >
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push(`/estimates/${estimateId}`)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          {pdfReady && (
            <PDFDownloadLink
              document={
                <EstimatePDFTemplate estimate={estimate} lineItems={lineItems} />
              }
              fileName={`Estimate-${estimate.estimate_number}.pdf`}
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
                <EstimatePDFTemplate estimate={estimate} lineItems={lineItems} />
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
