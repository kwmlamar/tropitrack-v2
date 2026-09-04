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
    // Return a default neutral badge color since catalog categories are highly dynamic
    return "bg-surface-200 text-foreground-light border border-border";
  };

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen bg-background text-foreground">
        <Header title="Material Details" />
        <main className="flex-1 container py-6 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-brand" />
            <p className="text-[12px] text-foreground-lighter tabular-nums">Loading details...</p>
          </div>
        </main>
      </div>
    );
  }

  if (!material) {
    return (
      <div className="flex flex-col min-h-screen bg-background text-foreground">
        <Header title="Material Not Found" />
        <main className="flex-1 container py-6">
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
            <h2 className="text-lg font-semibold mb-2">Material Not Found</h2>
            <p className="text-muted-foreground text-sm mb-4">
              The material you're looking for doesn't exist or you don't have access to it.
            </p>
            <Button onClick={() => router.push("/materials")} className="bg-surface-100 border border-border hover:bg-surface-100 text-foreground-light">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Materials
            </Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      <Header title={material.name} description="Global reference catalog details" />
      <main className="flex-1 container py-6 space-y-6 max-w-4xl">
        {/* Back Button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/materials")}
          className="text-foreground-lighter hover:text-foreground-light hover:bg-surface-100"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Materials
        </Button>

        {/* Header section */}
        <div className="flex items-start justify-between bg-surface-100 border border-border rounded-lg p-5">
          <div className="space-y-1.5">
            <div className="flex items-center gap-3">
              <Package className="h-7 w-7 text-brand" />
              <h1 className="text-xl font-bold text-foreground">{material.name}</h1>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full text-foreground text-[10px] tabular-nums font-semibold bg-surface-300">
                Div {material.division_code}
              </span>
              <span className="text-[12px] text-foreground-lighter tabular-nums">{material.division_name}</span>
            </div>
          </div>
          <Badge className={cn("text-[11px] tabular-nums capitalize", getCategoryBadgeColor(material.category))}>
            {material.category}
          </Badge>
        </div>

        {/* Cost / supplier cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-surface-100 border-border">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-wider">Unit Cost</p>
                  <p className="text-2xl font-bold tabular-nums text-brand mt-1">
                    {formatCurrency(material.unit_cost)}
                  </p>
                  <p className="text-[11px] text-foreground-lighter mt-0.5">per {material.unit}</p>
                </div>
                <DollarSign className="h-8 w-8 text-foreground-lighter" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-surface-100 border-border">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-wider">Supplier</p>
                  <p className="text-lg font-bold text-foreground truncate mt-1.5 max-w-[180px]">
                    {material.supplier || "Not assigned"}
                  </p>
                  <p className="text-[11px] text-foreground-lighter mt-1">Reference source</p>
                </div>
                <Truck className="h-8 w-8 text-foreground-lighter" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-surface-100 border-border">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-wider">Classification</p>
                  <p className="text-lg font-bold text-foreground truncate mt-1.5 max-w-[180px]">
                    {material.category}
                  </p>
                  <p className="text-[11px] text-foreground-lighter mt-1">CSI Category</p>
                </div>
                <Layers className="h-8 w-8 text-foreground-lighter" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Details Card */}
        <Card className="bg-surface-100 border-border">
          <CardHeader className="border-b border-border/50">
            <CardTitle className="text-foreground text-base">Material Specifications</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-[13px]">
              <div className="space-y-4">
                <div>
                  <p className="text-[11px] font-mono text-foreground-lighter uppercase tracking-wider mb-0.5">Description</p>
                  <p className="font-medium text-foreground">{material.name}</p>
                </div>
                <div>
                  <p className="text-[11px] font-mono text-foreground-lighter uppercase tracking-wider mb-0.5">CSI Division</p>
                  <p className="font-medium text-foreground">
                    {material.division_code} — {material.division_name}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-mono text-foreground-lighter uppercase tracking-wider mb-0.5">Category</p>
                  <p className="font-medium text-foreground capitalize">{material.category}</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <p className="text-[11px] font-mono text-foreground-lighter uppercase tracking-wider mb-0.5">Unit of Measure</p>
                  <p className="font-medium text-foreground">{material.unit}</p>
                </div>
                <div>
                  <p className="text-[11px] font-mono text-foreground-lighter uppercase tracking-wider mb-0.5">Supplier / Vendor</p>
                  <p className="font-medium text-foreground">{material.supplier || "None listed"}</p>
                </div>
                <div>
                  <p className="text-[11px] font-mono text-foreground-lighter uppercase tracking-wider mb-0.5">Catalog ID</p>
                  <p className="tabular-nums text-[12px] text-foreground-lighter">{material.id}</p>
                </div>
              </div>
            </div>

            {material.notes && (
              <>
                <Separator className="bg-border/50" />
                <div>
                  <p className="text-[11px] font-mono text-foreground-lighter uppercase tracking-wider mb-1 flex items-center gap-1">
                    <Info className="h-3.5 w-3.5" /> Additional Notes
                  </p>
                  <p className="text-[13px] text-foreground-light italic leading-relaxed whitespace-pre-wrap bg-background border border-border/30 rounded-lg p-3">
                    {material.notes}
                  </p>
                </div>
              </>
            )}

            <Separator className="bg-border/50" />

            <div className="text-[11px] text-foreground-lighter tabular-nums flex justify-between">
              <span>Created: {formatDate(material.created_at)}</span>
              <span>Last Price Update: {formatDate(material.updated_at)}</span>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
