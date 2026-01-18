"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { EstimateForm } from "@/components/estimates/estimate-form";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft } from "lucide-react";
import type { Estimate, EstimateLineItem } from "@/types";

export default function EditEstimatePage() {
  const params = useParams();
  const router = useRouter();
  const estimateId = params.id as string;
  const { toast } = useToast();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [lineItems, setLineItems] = useState<EstimateLineItem[]>([]);

  useEffect(() => {
    fetchEstimateData();
  }, [estimateId]);

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

      // Only allow editing draft estimates
      if (estimateRes.data.status !== "draft") {
        toast({
          title: "Cannot edit",
          description: "Only draft estimates can be edited.",
          variant: "destructive",
        });
        router.push(`/estimates/${estimateId}`);
        return;
      }

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
        <Header title="Edit Estimate" description="Loading...">
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
        title={`Edit Estimate ${estimate.estimate_number}`}
        description="Update estimate details and line items"
      >
        <Button variant="outline" onClick={() => router.push(`/estimates/${estimateId}`)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </Header>

      <div className="flex-1 p-6">
        <EstimateForm estimate={estimate} lineItems={lineItems} mode="edit" />
      </div>
    </div>
  );
}
