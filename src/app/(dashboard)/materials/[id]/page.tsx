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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { formatCurrency } from "@/lib/utils";
import {
  ArrowLeft,
  Package,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Calendar,
  Truck,
  BarChart3,
  History,
  Loader2,
  AlertTriangle,
  Minus,
} from "lucide-react";
import type { Material, MaterialPriceHistory, Vendor } from "@/types";

interface ExtendedMaterial extends Material {
  vendor?: Vendor;
}

interface PriceHistoryWithVendor extends MaterialPriceHistory {
  vendors?: { name: string };
  purchase_orders?: { po_number: string };
}

export default function MaterialDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { profile } = useAuth();
  const [material, setMaterial] = useState<ExtendedMaterial | null>(null);
  const [priceHistory, setPriceHistory] = useState<PriceHistoryWithVendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [priceTrend, setPriceTrend] = useState<number>(0);
  const supabase = createClient();

  useEffect(() => {
    if (profile?.company_id && params.id) {
      fetchMaterialData();
    }
  }, [profile?.company_id, params.id]);

  const fetchMaterialData = async () => {
    if (!profile?.company_id || !params.id) return;

    setLoading(true);
    try {
      // Fetch material with vendor info
      const { data: materialData, error: materialError } = await supabase
        .from("materials")
        .select("*, vendor:vendors(*)")
        .eq("id", params.id)
        .eq("company_id", profile.company_id)
        .single();

      if (materialError) throw materialError;
      setMaterial(materialData as ExtendedMaterial);

      // Fetch price history
      const { data: historyData } = await supabase
        .from("material_price_history")
        .select("*, vendors(name), purchase_orders(po_number)")
        .eq("material_id", params.id)
        .eq("company_id", profile.company_id)
        .order("purchase_date", { ascending: false })
        .limit(50);

      setPriceHistory((historyData as PriceHistoryWithVendor[]) || []);

      // Calculate price trend (compare latest vs 30 days ago)
      if (historyData && historyData.length >= 2) {
        const latestPrice = historyData[0].unit_price;
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const olderPrices = historyData.filter(
          (h: PriceHistoryWithVendor) => new Date(h.purchase_date) <= thirtyDaysAgo
        );
        const oldPrice = olderPrices.length > 0
          ? olderPrices[0].unit_price
          : historyData[historyData.length - 1].unit_price;

        if (oldPrice > 0) {
          const trend = ((latestPrice - oldPrice) / oldPrice) * 100;
          setPriceTrend(Math.round(trend * 10) / 10);
        }
      }
    } catch (error) {
      console.error("Error fetching material data:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getCategoryBadgeColor = (category: string) => {
    const colors: Record<string, string> = {
      lumber: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
      concrete: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
      steel: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
      electrical: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
      plumbing: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      roofing: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
      finishing: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
      hardware: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
      tools: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
      safety: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      other: "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200",
    };
    return colors[category] || colors.other;
  };

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header title="Material Details" />
        <main className="flex-1 container py-6">
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </main>
      </div>
    );
  }

  if (!material) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header title="Material Not Found" />
        <main className="flex-1 container py-6">
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <AlertTriangle className="h-12 w-12 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">Material Not Found</h2>
            <p className="text-muted-foreground mb-4">
              The material you're looking for doesn't exist or you don't have access to it.
            </p>
            <Button onClick={() => router.push("/materials")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Materials
            </Button>
          </div>
        </main>
      </div>
    );
  }

  const isLowStock = material.quantity_in_stock < material.minimum_stock_level;

  return (
    <div className="flex flex-col min-h-screen">
      <Header title={material.name} description="Material details and price history" />
      <main className="flex-1 container py-6 space-y-6">
        {/* Back Button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/materials")}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Materials
        </Button>

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Package className="h-8 w-8 text-muted-foreground" />
              <h1 className="text-2xl font-bold">{material.name}</h1>
            </div>
            <div className="flex items-center gap-3">
              {material.sku && (
                <span className="text-muted-foreground font-mono text-sm">
                  SKU: {material.sku}
                </span>
              )}
              {material.vendor_product_code && (
                <span className="text-muted-foreground font-mono text-sm">
                  Vendor Code: {material.vendor_product_code}
                </span>
              )}
            </div>
          </div>
          <Badge className={getCategoryBadgeColor(material.category)}>
            {material.category.charAt(0).toUpperCase() + material.category.slice(1)}
          </Badge>
        </div>

        {/* Price Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Last Purchase</p>
                  <p className="text-2xl font-bold">
                    {formatCurrency(material.last_purchase_price || material.unit_cost)}
                  </p>
                  {material.last_purchase_date && (
                    <p className="text-xs text-muted-foreground">
                      {formatDate(material.last_purchase_date)}
                    </p>
                  )}
                </div>
                <DollarSign className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Average Price</p>
                  <p className="text-2xl font-bold">
                    {formatCurrency(material.average_price || material.unit_cost)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {priceHistory.length} purchases
                  </p>
                </div>
                <BarChart3 className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Price Trend</p>
                  <p
                    className={`text-2xl font-bold flex items-center gap-1 ${
                      priceTrend > 0
                        ? "text-red-600"
                        : priceTrend < 0
                        ? "text-green-600"
                        : "text-muted-foreground"
                    }`}
                  >
                    {priceTrend > 0 ? (
                      <TrendingUp className="h-6 w-6" />
                    ) : priceTrend < 0 ? (
                      <TrendingDown className="h-6 w-6" />
                    ) : (
                      <Minus className="h-6 w-6" />
                    )}
                    {priceTrend > 0 ? "+" : ""}
                    {priceTrend}%
                  </p>
                  <p className="text-xs text-muted-foreground">vs last month</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className={isLowStock ? "border-orange-500" : ""}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">In Stock</p>
                  <p
                    className={`text-2xl font-bold ${
                      isLowStock ? "text-orange-600" : ""
                    }`}
                  >
                    {material.quantity_in_stock} {material.unit}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Min: {material.minimum_stock_level} {material.unit}
                  </p>
                </div>
                {isLowStock ? (
                  <AlertTriangle className="h-8 w-8 text-orange-500" />
                ) : (
                  <Package className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Details and History Tabs */}
        <Tabs defaultValue="history" className="space-y-4">
          <TabsList>
            <TabsTrigger value="history">
              <History className="h-4 w-4 mr-2" />
              Price History
            </TabsTrigger>
            <TabsTrigger value="details">
              <Package className="h-4 w-4 mr-2" />
              Details
            </TabsTrigger>
          </TabsList>

          <TabsContent value="history">
            <Card>
              <CardHeader>
                <CardTitle>Price History</CardTitle>
                <CardDescription>
                  Track price changes over time from all purchase orders
                </CardDescription>
              </CardHeader>
              <CardContent>
                {priceHistory.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No price history available yet.</p>
                    <p className="text-sm">
                      Prices will be tracked when you create purchase orders from receipts.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Price Trend Chart */}
                    {priceHistory.length >= 2 && (
                      <div className="border rounded-lg p-4">
                        <h4 className="text-sm font-medium mb-4 flex items-center gap-2">
                          <BarChart3 className="h-4 w-4" />
                          Price Trend (Last {Math.min(priceHistory.length, 10)} Purchases)
                        </h4>
                        <div className="flex items-end gap-1 h-32">
                          {(() => {
                            const recentHistory = [...priceHistory].slice(0, 10).reverse();
                            const maxPrice = Math.max(...recentHistory.map((h) => h.unit_price));
                            const minPrice = Math.min(...recentHistory.map((h) => h.unit_price));
                            const range = maxPrice - minPrice || 1;

                            return recentHistory.map((entry, idx) => {
                              const heightPercent = ((entry.unit_price - minPrice) / range) * 70 + 30;
                              const isLatest = idx === recentHistory.length - 1;
                              const prevPrice = idx > 0 ? recentHistory[idx - 1].unit_price : null;
                              const isUp = prevPrice !== null && entry.unit_price > prevPrice;
                              const isDown = prevPrice !== null && entry.unit_price < prevPrice;

                              return (
                                <div
                                  key={entry.id}
                                  className="flex-1 flex flex-col items-center gap-1"
                                >
                                  <span className="text-[10px] text-muted-foreground">
                                    ${entry.unit_price.toFixed(2)}
                                  </span>
                                  <div
                                    className={`w-full rounded-t transition-all ${
                                      isLatest
                                        ? "bg-primary"
                                        : isUp
                                        ? "bg-red-400 dark:bg-red-600"
                                        : isDown
                                        ? "bg-green-400 dark:bg-green-600"
                                        : "bg-muted-foreground/30"
                                    }`}
                                    style={{ height: `${heightPercent}%` }}
                                    title={`${formatDate(entry.purchase_date)}: ${formatCurrency(entry.unit_price)}`}
                                  />
                                  <span className="text-[9px] text-muted-foreground rotate-45 origin-left whitespace-nowrap">
                                    {new Date(entry.purchase_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                  </span>
                                </div>
                              );
                            });
                          })()}
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground mt-2 pt-2 border-t">
                          <span>Low: {formatCurrency(Math.min(...priceHistory.slice(0, 10).map((h) => h.unit_price)))}</span>
                          <span>Avg: {formatCurrency(priceHistory.slice(0, 10).reduce((sum, h) => sum + h.unit_price, 0) / Math.min(priceHistory.length, 10))}</span>
                          <span>High: {formatCurrency(Math.max(...priceHistory.slice(0, 10).map((h) => h.unit_price)))}</span>
                        </div>
                      </div>
                    )}

                    {/* Price History Table */}
                    <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Vendor</TableHead>
                          <TableHead className="text-right">Quantity</TableHead>
                          <TableHead className="text-right">Unit Price</TableHead>
                          <TableHead className="text-right">Change</TableHead>
                          <TableHead>PO #</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {priceHistory.map((entry, index) => {
                          const previousPrice =
                            index < priceHistory.length - 1
                              ? priceHistory[index + 1].unit_price
                              : null;
                          const priceChange =
                            previousPrice !== null
                              ? ((entry.unit_price - previousPrice) / previousPrice) * 100
                              : null;

                          return (
                            <TableRow key={entry.id}>
                              <TableCell className="font-medium">
                                {formatDate(entry.purchase_date)}
                              </TableCell>
                              <TableCell>
                                {entry.vendors?.name || "Unknown"}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {entry.quantity}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {formatCurrency(entry.unit_price)}
                              </TableCell>
                              <TableCell className="text-right">
                                {priceChange !== null ? (
                                  <span
                                    className={`flex items-center justify-end gap-1 ${
                                      priceChange > 0
                                        ? "text-red-600"
                                        : priceChange < 0
                                        ? "text-green-600"
                                        : "text-muted-foreground"
                                    }`}
                                  >
                                    {priceChange > 0 ? (
                                      <TrendingUp className="h-3 w-3" />
                                    ) : priceChange < 0 ? (
                                      <TrendingDown className="h-3 w-3" />
                                    ) : (
                                      <Minus className="h-3 w-3" />
                                    )}
                                    {priceChange > 0 ? "+" : ""}
                                    {Math.round(priceChange * 10) / 10}%
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell className="font-mono text-xs">
                                {entry.purchase_orders?.po_number || "-"}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="details">
            <Card>
              <CardHeader>
                <CardTitle>Material Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Description</p>
                      <p className="font-medium">
                        {material.description || "No description"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Category</p>
                      <p className="font-medium capitalize">{material.category}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Unit of Measure</p>
                      <p className="font-medium">{material.unit}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Current Unit Cost</p>
                      <p className="font-medium">{formatCurrency(material.unit_cost)}</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Supplier</p>
                      <p className="font-medium">
                        {material.vendor?.name || "Not assigned"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">SKU</p>
                      <p className="font-medium font-mono">
                        {material.sku || "None"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Vendor Product Code</p>
                      <p className="font-medium font-mono">
                        {material.vendor_product_code || "None"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Inventory Value</p>
                      <p className="font-medium">
                        {formatCurrency(material.quantity_in_stock * material.unit_cost)}
                      </p>
                    </div>
                  </div>
                </div>

                <Separator />

                <div>
                  <p className="text-sm text-muted-foreground mb-2">Stock Levels</p>
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <div className="flex justify-between text-sm mb-1">
                        <span>Current Stock</span>
                        <span className={isLowStock ? "text-orange-600" : ""}>
                          {material.quantity_in_stock} / {material.minimum_stock_level} min
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            isLowStock ? "bg-orange-500" : "bg-primary"
                          }`}
                          style={{
                            width: `${Math.min(
                              (material.quantity_in_stock /
                                Math.max(material.minimum_stock_level * 2, material.quantity_in_stock)) *
                                100,
                              100
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="text-xs text-muted-foreground">
                  <p>Created: {formatDate(material.created_at)}</p>
                  <p>Last Updated: {formatDate(material.updated_at)}</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
