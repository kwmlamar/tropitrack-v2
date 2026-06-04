"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { formatCurrency, cn } from "@/lib/utils";
import {
  ArrowLeft,
  Package,
  DollarSign,
  Truck,
  Loader2,
  AlertTriangle,
  Layers,
  Info,
} from "lucide-react";

interface CatalogMaterial {
  id: string;
  division_code: string;
  division_name: string;
  category: string;
  name: string;
  unit: string;
  unit_cost: number;
  supplier?: string | null;
  notes?: string | null;
  updated_at?: string;
  created_at?: string;
}

export default function MaterialDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { profile } = useAuth();
  const [material, setMaterial] = useState<CatalogMaterial | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    if (params.id) {
      fetchMaterialData();
    }
  }, [params.id]);

  const fetchMaterialData = async () => {
    if (!params.id) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("materials")
        .select("*")
        .eq("id", params.id)
        .single();

      if (error) throw error;
      setMaterial(data as CatalogMaterial);
    } catch (error) {
      console.error("Error fetching material data:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getCategoryBadgeColor = (category: string) => {
    // Return a default slate badge color since catalog categories are highly dynamic
    return "bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200 border border-slate-200 dark:border-slate-800";
  };

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen bg-[#18191b] text-[#d0d0d0]">
        <Header title="Material Details" />
        <main className="flex-1 container py-6 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-[#F5A623]" />
            <p className="text-[12px] text-[#666] font-mono">Loading details...</p>
          </div>
        </main>
      </div>
    );
  }

  if (!material) {
    return (
      <div className="flex flex-col min-h-screen bg-[#18191b] text-[#d0d0d0]">
        <Header title="Material Not Found" />
        <main className="flex-1 container py-6">
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <AlertTriangle className="h-12 w-12 text-[#EF4444] mb-4" />
            <h2 className="text-lg font-semibold mb-2">Material Not Found</h2>
            <p className="text-muted-foreground text-sm mb-4">
              The material you're looking for doesn't exist or you don't have access to it.
            </p>
            <Button onClick={() => router.push("/materials")} className="bg-[#202224] border border-[#34373c] hover:bg-[#292c31] text-[#aaa]">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Materials
            </Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#18191b] text-[#d0d0d0]">
      <Header title={material.name} description="Global reference catalog details" />
      <main className="flex-1 container py-6 space-y-6 max-w-4xl">
        {/* Back Button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/materials")}
          className="text-[#888] hover:text-[#bbb] hover:bg-[#202224]"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Materials
        </Button>

        {/* Header section */}
        <div className="flex items-start justify-between bg-[#1e2022] border border-[#34373c] rounded-lg p-5">
          <div className="space-y-1.5">
            <div className="flex items-center gap-3">
              <Package className="h-7 w-7 text-[#F5A623]" />
              <h1 className="text-xl font-bold text-white">{material.name}</h1>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-white text-[10px] font-mono font-semibold bg-[#2d3035]">
                Div {material.division_code}
              </span>
              <span className="text-[12px] text-[#666] font-mono">{material.division_name}</span>
            </div>
          </div>
          <Badge className={cn("text-[11px] font-mono capitalize", getCategoryBadgeColor(material.category))}>
            {material.category}
          </Badge>
        </div>

        {/* Cost / supplier cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-[#202224] border-[#34373c]">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-mono text-[#666] uppercase tracking-wider">Unit Cost</p>
                  <p className="text-2xl font-bold font-mono text-[#F5A623] mt-1">
                    {formatCurrency(material.unit_cost)}
                  </p>
                  <p className="text-[11px] text-[#666] mt-0.5">per {material.unit}</p>
                </div>
                <DollarSign className="h-8 w-8 text-[#444]" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-[#202224] border-[#34373c]">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-mono text-[#666] uppercase tracking-wider">Supplier</p>
                  <p className="text-lg font-bold text-[#d0d0d0] truncate mt-1.5 max-w-[180px]">
                    {material.supplier || "Not assigned"}
                  </p>
                  <p className="text-[11px] text-[#666] mt-1">Reference source</p>
                </div>
                <Truck className="h-8 w-8 text-[#444]" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-[#202224] border-[#34373c]">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-mono text-[#666] uppercase tracking-wider">Classification</p>
                  <p className="text-lg font-bold text-[#d0d0d0] truncate mt-1.5 max-w-[180px]">
                    {material.category}
                  </p>
                  <p className="text-[11px] text-[#666] mt-1">CSI Category</p>
                </div>
                <Layers className="h-8 w-8 text-[#444]" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Details Card */}
        <Card className="bg-[#202224] border-[#34373c]">
          <CardHeader className="border-b border-[#34373c]/50">
            <CardTitle className="text-white text-base">Material Specifications</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-[13px]">
              <div className="space-y-4">
                <div>
                  <p className="text-[11px] font-mono text-[#666] uppercase tracking-wider mb-0.5">Description</p>
                  <p className="font-medium text-[#c4c4c4]">{material.name}</p>
                </div>
                <div>
                  <p className="text-[11px] font-mono text-[#666] uppercase tracking-wider mb-0.5">CSI Division</p>
                  <p className="font-medium text-[#c4c4c4]">
                    {material.division_code} — {material.division_name}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-mono text-[#666] uppercase tracking-wider mb-0.5">Category</p>
                  <p className="font-medium text-[#c4c4c4] capitalize">{material.category}</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <p className="text-[11px] font-mono text-[#666] uppercase tracking-wider mb-0.5">Unit of Measure</p>
                  <p className="font-medium text-[#c4c4c4]">{material.unit}</p>
                </div>
                <div>
                  <p className="text-[11px] font-mono text-[#666] uppercase tracking-wider mb-0.5">Supplier / Vendor</p>
                  <p className="font-medium text-[#c4c4c4]">{material.supplier || "None listed"}</p>
                </div>
                <div>
                  <p className="text-[11px] font-mono text-[#666] uppercase tracking-wider mb-0.5">Catalog ID</p>
                  <p className="font-mono text-[12px] text-[#666]">{material.id}</p>
                </div>
              </div>
            </div>

            {material.notes && (
              <>
                <Separator className="bg-[#34373c]/50" />
                <div>
                  <p className="text-[11px] font-mono text-[#666] uppercase tracking-wider mb-1 flex items-center gap-1">
                    <Info className="h-3.5 w-3.5" /> Additional Notes
                  </p>
                  <p className="text-[13px] text-[#aaa] italic leading-relaxed whitespace-pre-wrap bg-[#1a1b1d] border border-[#34373c]/30 rounded p-3">
                    {material.notes}
                  </p>
                </div>
              </>
            )}

            <Separator className="bg-[#34373c]/50" />

            <div className="text-[11px] text-[#555] font-mono flex justify-between">
              <span>Created: {formatDate(material.created_at)}</span>
              <span>Last Price Update: {formatDate(material.updated_at)}</span>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
