"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import {
  ArrowLeft,
  Plus,
  ChevronDown,
  ChevronRight,
  Lock,
  Unlock,
  FileText,
  Send,
  Loader2,
  MoreHorizontal,
  Pencil,
  Trash2,
  Library,
  Search,
  GripVertical,
  Download,
  DollarSign,
  TrendingUp,
  Calculator,
  X,
  ChevronUp,
  Settings2,
} from "lucide-react";
import type {
  Client,
  CostCode,
  CostCatalogItem,
  EstimateCategory,
  EstimateBuilderItem,
  CostType,
} from "@/types";

// ─── Calculation Helpers ─────────────────────────────────────

function calcBuilderCost(unitCost: number, quantity: number): number {
  return Math.round(unitCost * quantity * 100) / 100;
}

function calcMarkup(builderCost: number, markupPercent: number): number {
  return Math.round(builderCost * (markupPercent / 100) * 100) / 100;
}

function calcClientPrice(builderCost: number, markupPercent: number): number {
  return Math.round((builderCost + calcMarkup(builderCost, markupPercent)) * 100) / 100;
}

// ─── Create Mode Builder ────────────────────────────────────

export default function CreateEstimateBuilderPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { profile } = useAuth();
  const supabase = createClient();

  // Core local data (no DB writes until save)
  const [categories, setCategories] = useState<EstimateCategory[]>([]);
  const [costCodes, setCostCodes] = useState<CostCode[]>([]);
  const [catalogItems, setCatalogItems] = useState<CostCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Estimate details (all local)
  const [clients, setClients] = useState<Client[]>([]);
  const [detailsOpen, setDetailsOpen] = useState(true); // Open by default for new
  const [detailsForm, setDetailsForm] = useState({
    client_id: "",
    client_name: "",
    client_email: "",
    client_phone: "",
    client_address: "",
    title: "",
    description: "",
    issue_date: new Date().toISOString().split("T")[0],
    valid_until: "",
    notes: "",
    terms_and_conditions:
      "This estimate is valid for 30 days from the issue date. Prices are subject to change based on material costs and project scope changes. A 50% deposit is required to begin work.",
  });

  // UI state
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<EstimateBuilderItem | null>(null);
  const [addingToCategoryId, setAddingToCategoryId] = useState<string | null>(null);
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogFilter, setCatalogFilter] = useState<string>("all");

  // Item form state
  const [itemForm, setItemForm] = useState({
    title: "",
    description: "",
    cost_type: "material" as CostType,
    cost_code: "",
    unit_cost: 0,
    quantity: 1,
    unit: "EACH",
    markup_percent: 25,
    show_to_client: true,
    save_to_catalog: false,
  });

  // New category form
  const [newCategoryForm, setNewCategoryForm] = useState({
    cost_code_id: "",
    name: "",
  });

  // ─── Fetch Reference Data Only ──────────────────────────

  useEffect(() => {
    fetchReferenceData();
  }, []);

  const fetchReferenceData = async () => {
    setLoading(true);
    try {
      const [clientsRes, codesRes, catalogRes] = await Promise.all([
        supabase.from("clients").select("*").order("name"),
        supabase
          .from("cost_codes")
          .select("*")
          .or(
            profile?.company_id
              ? `is_template.eq.true,company_id.eq.${profile.company_id}`
              : "is_template.eq.true"
          )
          .order("display_order"),
        supabase
          .from("cost_catalog")
          .select("*, cost_code:cost_codes(*)")
          .or(
            profile?.company_id
              ? `is_template.eq.true,company_id.eq.${profile.company_id}`
              : "is_template.eq.true"
          )
          .order("title"),
      ]);

      setClients(clientsRes.data || []);
      setCostCodes(codesRes.data || []);
      setCatalogItems(catalogRes.data || []);
    } catch (error) {
      console.error("Error fetching reference data:", error);
    } finally {
      setLoading(false);
    }
  };

  // ─── Category Operations (Local) ────────────────────────

  const handleAddCategory = () => {
    if (!newCategoryForm.name.trim()) return;

    const localId = crypto.randomUUID();
    const newCat = {
      id: localId,
      estimate_id: "",
      cost_code_id: newCategoryForm.cost_code_id || null,
      name: newCategoryForm.name,
      display_order: categories.length,
      builder_cost: 0,
      client_price: 0,
      profit: 0,
      show_to_client: true,
      is_expanded: true,
      items: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as unknown as EstimateCategory;

    setCategories([...categories, newCat]);
    setExpandedCategories(new Set([...Array.from(expandedCategories), localId]));
    setAddCategoryOpen(false);
    setNewCategoryForm({ cost_code_id: "", name: "" });
    toast({ title: "Category added" });
  };

  const handleDeleteCategory = (categoryId: string) => {
    setCategories(categories.filter((c) => c.id !== categoryId));
    toast({ title: "Category deleted" });
  };

  // ─── Item Operations (Local) ────────────────────────────

  const openAddItem = (categoryId: string) => {
    setAddingToCategoryId(categoryId);
    setEditingItem(null);
    setItemForm({
      title: "",
      description: "",
      cost_type: "material",
      cost_code: "",
      unit_cost: 0,
      quantity: 1,
      unit: "EACH",
      markup_percent: 25,
      show_to_client: true,
      save_to_catalog: false,
    });
    setItemModalOpen(true);
  };

  const openEditItem = (item: EstimateBuilderItem, categoryId: string) => {
    setAddingToCategoryId(categoryId);
    setEditingItem(item);
    setItemForm({
      title: item.title || "",
      description: item.description || "",
      cost_type: item.cost_type || "material",
      cost_code: item.cost_code || "",
      unit_cost: item.unit_cost || 0,
      quantity: item.quantity || 1,
      unit: item.unit || "EACH",
      markup_percent: item.markup_percent ?? 25,
      show_to_client: item.show_to_client ?? true,
      save_to_catalog: false,
    });
    setItemModalOpen(true);
  };

  const handleSaveItem = () => {
    if (!itemForm.title.trim()) {
      toast({ title: "Title required", variant: "destructive" });
      return;
    }

    const builderCost = calcBuilderCost(itemForm.unit_cost, itemForm.quantity);
    const markupAmount = calcMarkup(builderCost, itemForm.markup_percent);
    const clientPrice = builderCost + markupAmount;
    const profit = markupAmount;

    const itemData: EstimateBuilderItem = {
      id: editingItem?.id || crypto.randomUUID(),
      estimate_id: "",
      category_id: addingToCategoryId,
      title: itemForm.title,
      description: itemForm.description || itemForm.title,
      category: itemForm.cost_type === "labor" ? "labor" : itemForm.cost_type === "equipment" ? "equipment" : "material",
      cost_type: itemForm.cost_type,
      cost_code: itemForm.cost_code,
      unit_cost: itemForm.unit_cost,
      quantity: itemForm.quantity,
      unit: itemForm.unit,
      unit_rate: itemForm.unit_cost,
      amount: clientPrice,
      builder_cost: builderCost,
      markup_percent: itemForm.markup_percent,
      markup_amount: markupAmount,
      client_price: clientPrice,
      profit,
      show_to_client: itemForm.show_to_client,
      save_to_catalog: itemForm.save_to_catalog,
      entry_mode: "detailed",
      display_order: editingItem
        ? editingItem.display_order
        : (categories.find((c) => c.id === addingToCategoryId)?.items?.length || 0),
    } as EstimateBuilderItem;

    const updatedCategories = categories.map((cat) => {
      if (cat.id !== addingToCategoryId) return cat;
      const existingItems = (cat.items || []) as EstimateBuilderItem[];
      let newItems: EstimateBuilderItem[];
      if (editingItem) {
        newItems = existingItems.map((item) =>
          item.id === editingItem.id ? itemData : item
        );
      } else {
        newItems = [...existingItems, itemData];
      }
      const catBuilderCost = newItems.reduce((s, i) => s + (i.builder_cost || 0), 0);
      const catClientPrice = newItems.reduce((s, i) => s + (i.client_price || 0), 0);
      return {
        ...cat,
        items: newItems,
        builder_cost: catBuilderCost,
        client_price: catClientPrice,
        profit: catClientPrice - catBuilderCost,
      };
    });

    setCategories(updatedCategories);
    setItemModalOpen(false);
    toast({ title: editingItem ? "Item updated" : "Item added" });
  };

  const handleDeleteItem = (itemId: string, categoryId: string) => {
    const updatedCategories = categories.map((cat) => {
      if (cat.id !== categoryId) return cat;
      const newItems = ((cat.items || []) as EstimateBuilderItem[]).filter((i) => i.id !== itemId);
      const catBuilderCost = newItems.reduce((s, i) => s + (i.builder_cost || 0), 0);
      const catClientPrice = newItems.reduce((s, i) => s + (i.client_price || 0), 0);
      return {
        ...cat,
        items: newItems,
        builder_cost: catBuilderCost,
        client_price: catClientPrice,
        profit: catClientPrice - catBuilderCost,
      };
    });
    setCategories(updatedCategories);
    toast({ title: "Item deleted" });
  };

  // ─── Catalog ────────────────────────────────────────────

  const addFromCatalog = (catalogItem: CostCatalogItem) => {
    const targetCategoryId = addingToCategoryId || categories[0]?.id;
    if (!targetCategoryId) {
      toast({ title: "Create a category first", variant: "destructive" });
      return;
    }
    setAddingToCategoryId(targetCategoryId);
    setEditingItem(null);
    setItemForm({
      title: catalogItem.title,
      description: catalogItem.description || "",
      cost_type: catalogItem.cost_type as CostType,
      cost_code: catalogItem.cost_code?.code || "",
      unit_cost: catalogItem.unit_cost,
      quantity: 1,
      unit: catalogItem.unit || "EACH",
      markup_percent: catalogItem.default_markup_percent || 25,
      show_to_client: true,
      save_to_catalog: false,
    });
    setCatalogOpen(false);
    setItemModalOpen(true);
  };

  const openCatalogForCategory = (categoryId: string) => {
    setAddingToCategoryId(categoryId);
    setCatalogOpen(true);
  };

  // ─── Client Select ─────────────────────────────────────

  const handleClientSelect = (clientId: string) => {
    const client = clients.find((c) => c.id === clientId);
    if (client) {
      setDetailsForm({
        ...detailsForm,
        client_id: clientId,
        client_name: client.name,
        client_email: client.email || "",
        client_phone: client.phone || "",
        client_address: `${client.address || ""}${client.city ? `, ${client.city}` : ""}`,
      });
    }
  };

  // ─── Save Everything to DB ──────────────────────────────

  const handleSaveEstimate = async () => {
    if (!detailsForm.title.trim()) {
      toast({ title: "Please enter a project title", variant: "destructive" });
      setDetailsOpen(true);
      return;
    }
    if (!detailsForm.client_name.trim()) {
      toast({ title: "Please enter a client name", variant: "destructive" });
      setDetailsOpen(true);
      return;
    }

    setSaving(true);
    try {
      // Get user directly from supabase auth
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error("Not authenticated");

      const { data: userProfile } = await supabase
        .from("profiles")
        .select("id, company_id")
        .eq("id", user.id)
        .single();

      if (!userProfile?.company_id) {
        throw new Error("You must be associated with a company to create estimates.");
      }

      // Generate estimate number
      const prefix = "EST";
      const date = new Date().toISOString().slice(2, 10).replace(/-/g, "");
      const random = Math.random().toString(36).substring(2, 6).toUpperCase();
      const estimateNumber = `${prefix}-${date}-${random}`;

      // Calculate totals
      const totalBuilderCost = categories.reduce((s, c) => s + (c.builder_cost || 0), 0);
      const totalClientPrice = categories.reduce((s, c) => s + (c.client_price || 0), 0);
      const totalProfit = totalClientPrice - totalBuilderCost;

      // 1. Create the estimate
      const { data: newEstimate, error: estError } = await supabase
        .from("estimates")
        .insert({
          estimate_number: estimateNumber,
          company_id: userProfile.company_id,
          client_id: detailsForm.client_id || null,
          client_name: detailsForm.client_name,
          client_email: detailsForm.client_email || null,
          client_phone: detailsForm.client_phone || null,
          client_address: detailsForm.client_address || null,
          title: detailsForm.title,
          description: detailsForm.description || null,
          issue_date: detailsForm.issue_date,
          valid_until: detailsForm.valid_until || null,
          notes: detailsForm.notes || null,
          terms_and_conditions: detailsForm.terms_and_conditions || null,
          status: "draft",
          created_by: userProfile.id,
          builder_cost: totalBuilderCost,
          client_price: totalClientPrice,
          estimated_profit: totalProfit,
          subtotal: totalBuilderCost,
          total_amount: totalClientPrice,
        })
        .select()
        .single();

      if (estError) throw estError;

      // 2. Create categories and build ID mapping (local → DB)
      const categoryIdMap = new Map<string, string>();

      if (categories.length > 0) {
        const catsToInsert = categories.map((cat, idx) => ({
          estimate_id: newEstimate.id,
          cost_code_id: cat.cost_code_id || null,
          name: cat.name,
          display_order: idx,
          builder_cost: cat.builder_cost || 0,
          client_price: cat.client_price || 0,
          profit: cat.profit || 0,
          show_to_client: cat.show_to_client ?? true,
        }));

        const { data: savedCats, error: catsError } = await supabase
          .from("estimate_categories")
          .insert(catsToInsert)
          .select();

        if (catsError) throw catsError;

        // Map local IDs to DB IDs (by index since order is preserved)
        categories.forEach((cat, idx) => {
          if (savedCats[idx]) {
            categoryIdMap.set(cat.id, savedCats[idx].id);
          }
        });
      }

      // 3. Create line items
      const allItems: any[] = [];
      categories.forEach((cat) => {
        const items = (cat.items || []) as EstimateBuilderItem[];
        items.forEach((item, idx) => {
          allItems.push({
            estimate_id: newEstimate.id,
            category_id: categoryIdMap.get(cat.id) || null,
            title: item.title,
            description: item.description || item.title,
            category: item.category || "material",
            cost_type: item.cost_type,
            cost_code: item.cost_code || null,
            unit_cost: item.unit_cost,
            quantity: item.quantity,
            unit: item.unit,
            unit_rate: item.unit_cost,
            amount: item.client_price,
            builder_cost: item.builder_cost,
            markup_percent: item.markup_percent,
            markup_amount: item.markup_amount,
            client_price: item.client_price,
            profit: item.profit,
            show_to_client: item.show_to_client,
            entry_mode: "detailed",
            display_order: idx,
          });
        });
      });

      if (allItems.length > 0) {
        const { error: itemsError } = await supabase
          .from("estimate_line_items")
          .insert(allItems);
        if (itemsError) throw itemsError;
      }

      // 4. Save catalog items if any were marked
      const catalogSaves: any[] = [];
      categories.forEach((cat) => {
        ((cat.items || []) as EstimateBuilderItem[]).forEach((item) => {
          if (item.save_to_catalog) {
            const costCodeRecord = costCodes.find((c) => c.code === item.cost_code);
            catalogSaves.push({
              company_id: userProfile.company_id,
              cost_code_id: costCodeRecord?.id || null,
              title: item.title,
              description: item.description,
              cost_type: item.cost_type,
              unit_cost: item.unit_cost,
              unit: item.unit,
              default_markup_percent: item.markup_percent,
            });
          }
        });
      });

      if (catalogSaves.length > 0) {
        await supabase.from("cost_catalog").insert(catalogSaves);
      }

      toast({
        title: "Estimate created",
        description: `Estimate ${estimateNumber} has been saved.`,
      });

      router.push(`/estimates/${newEstimate.id}`);
    } catch (error: any) {
      console.error("Error saving estimate:", error);
      toast({
        title: "Error saving estimate",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // ─── Toggle Category Expand ────────────────────────────

  const toggleCategory = (id: string) => {
    const next = new Set(expandedCategories);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedCategories(next);
  };

  // ─── Computed Totals ───────────────────────────────────

  const totalBuilderCost = categories.reduce((s, c) => s + (c.builder_cost || 0), 0);
  const totalClientPrice = categories.reduce((s, c) => s + (c.client_price || 0), 0);
  const totalProfit = totalClientPrice - totalBuilderCost;
  const profitMargin = totalClientPrice > 0 ? (totalProfit / totalClientPrice) * 100 : 0;

  // ─── Item form computed values ─────────────────────────

  const formBuilderCost = calcBuilderCost(itemForm.unit_cost, itemForm.quantity);
  const formMarkupAmount = calcMarkup(formBuilderCost, itemForm.markup_percent);
  const formClientPrice = formBuilderCost + formMarkupAmount;

  // ─── Filtered catalog ──────────────────────────────────

  const filteredCatalog = catalogItems.filter((item) => {
    const matchesSearch =
      !catalogSearch ||
      item.title.toLowerCase().includes(catalogSearch.toLowerCase()) ||
      (item.description || "").toLowerCase().includes(catalogSearch.toLowerCase());
    const matchesFilter = catalogFilter === "all" || item.cost_type === catalogFilter;
    return matchesSearch && matchesFilter;
  });

  // ─── Loading ───────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* ── Top Bar ── */}
      <div className="border-b bg-card sticky top-0 z-20">
        <div className="px-4 py-3">
          <div className="flex items-center gap-3 mb-2">
            <Link href="/estimates">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-muted-foreground">New Estimate</div>
              <h1 className="text-lg font-bold truncate">
                {detailsForm.title || "Untitled Estimate"}
              </h1>
            </div>
            <Badge variant="outline">Draft</Badge>
          </div>

          {/* Summary metrics row */}
          <div className="flex items-center gap-6 text-sm">
            <div>
              <span className="text-muted-foreground">Builder Cost</span>
              <p className="text-base font-bold">{formatCurrency(totalBuilderCost)}</p>
            </div>
            <div className="text-muted-foreground">=</div>
            <div>
              <span className="text-muted-foreground">Client Price</span>
              <p className="text-base font-bold">{formatCurrency(totalClientPrice)}</p>
            </div>
            <div className="text-muted-foreground">-</div>
            <div>
              <span className="text-muted-foreground">Profit</span>
              <p className="text-base font-bold text-green-600">
                {formatCurrency(totalProfit)}
                <span className="text-xs font-normal ml-1">
                  ({profitMargin.toFixed(1)}%)
                </span>
              </p>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => router.push("/estimates")}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSaveEstimate} disabled={saving}>
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : null}
                Save Estimate
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Collapsible Estimate Details ── */}
      <div className="border-b">
        <button
          onClick={() => setDetailsOpen(!detailsOpen)}
          className="w-full px-4 py-2 flex items-center gap-2 text-sm font-medium hover:bg-muted/50 transition-colors"
        >
          <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
          <span>Estimate Details</span>
          {detailsForm.client_name && (
            <span className="text-xs text-muted-foreground">
              — {detailsForm.client_name}
            </span>
          )}
          <div className="flex-1" />
          <ChevronUp
            className={`h-4 w-4 text-muted-foreground transition-transform ${detailsOpen ? "" : "rotate-180"}`}
          />
        </button>

        {detailsOpen && (
          <div className="px-4 pb-4 space-y-4 bg-muted/20">
            {/* Client + Title row */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Client</Label>
                <Select value={detailsForm.client_id} onValueChange={handleClientSelect}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select client..." />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Client Name *</Label>
                <Input
                  className="h-9"
                  value={detailsForm.client_name}
                  onChange={(e) =>
                    setDetailsForm({ ...detailsForm, client_name: e.target.value })
                  }
                  placeholder="Client name"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Project Title *</Label>
                <Input
                  className="h-9"
                  value={detailsForm.title}
                  onChange={(e) =>
                    setDetailsForm({ ...detailsForm, title: e.target.value })
                  }
                  placeholder="e.g., Kitchen Renovation"
                />
              </div>
            </div>

            {/* Contact + Dates row */}
            <div className="grid grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Email</Label>
                <Input
                  className="h-9"
                  value={detailsForm.client_email}
                  onChange={(e) =>
                    setDetailsForm({ ...detailsForm, client_email: e.target.value })
                  }
                  placeholder="email@example.com"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Phone</Label>
                <Input
                  className="h-9"
                  value={detailsForm.client_phone}
                  onChange={(e) =>
                    setDetailsForm({ ...detailsForm, client_phone: e.target.value })
                  }
                  placeholder="(242) 555-0100"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Issue Date</Label>
                <Input
                  type="date"
                  className="h-9"
                  value={detailsForm.issue_date}
                  onChange={(e) =>
                    setDetailsForm({ ...detailsForm, issue_date: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Valid Until</Label>
                <Input
                  type="date"
                  className="h-9"
                  value={detailsForm.valid_until}
                  onChange={(e) =>
                    setDetailsForm({ ...detailsForm, valid_until: e.target.value })
                  }
                />
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1">
              <Label className="text-xs">Description</Label>
              <Textarea
                value={detailsForm.description}
                onChange={(e) =>
                  setDetailsForm({ ...detailsForm, description: e.target.value })
                }
                placeholder="Brief project description..."
                rows={2}
                className="resize-none"
              />
            </div>

            {/* Notes + Terms */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Notes (internal)</Label>
                <Textarea
                  value={detailsForm.notes}
                  onChange={(e) =>
                    setDetailsForm({ ...detailsForm, notes: e.target.value })
                  }
                  placeholder="Internal notes..."
                  rows={2}
                  className="resize-none"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Terms & Conditions</Label>
                <Textarea
                  value={detailsForm.terms_and_conditions}
                  onChange={(e) =>
                    setDetailsForm({
                      ...detailsForm,
                      terms_and_conditions: e.target.value,
                    })
                  }
                  placeholder="Payment terms, warranty info..."
                  rows={2}
                  className="resize-none"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Main Content ── */}
      <div className="flex-1 overflow-auto">
        {/* Action bar */}
        <div className="bg-muted/80 border-b px-4 py-2 flex items-center gap-2">
          <Button size="sm" onClick={() => setAddCategoryOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Category
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setAddingToCategoryId(categories[0]?.id || null);
              setCatalogOpen(true);
            }}
            disabled={categories.length === 0}
          >
            <Library className="h-3.5 w-3.5 mr-1.5" />
            Catalog
          </Button>
          <div className="flex-1" />
          <span className="text-xs text-muted-foreground">
            {categories.reduce((s, c) => s + ((c.items as any[])?.length || 0), 0)} items
            in {categories.length} categories
          </span>
        </div>

        {/* Table */}
        <div className="px-4 pb-8">
          {categories.length === 0 ? (
            <div className="text-center py-32 text-muted-foreground">
              <Calculator className="h-12 w-12 mx-auto mb-4 opacity-40" />
              <p className="font-medium mb-1">No categories yet</p>
              <p className="text-sm mb-4">
                Add a category to start building your estimate
              </p>
              <Button onClick={() => setAddCategoryOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Category
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-[40%]">Items</TableHead>
                  <TableHead className="text-right w-[10%]">Unit Cost</TableHead>
                  <TableHead className="text-right w-[8%]">Qty</TableHead>
                  <TableHead className="text-right w-[8%]">Unit</TableHead>
                  <TableHead className="text-right w-[12%]">Builder Cost</TableHead>
                  <TableHead className="text-right w-[12%]">Client Price</TableHead>
                  <TableHead className="text-right w-[10%]">Profit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((category) => (
                  <CategorySection
                    key={category.id}
                    category={category}
                    isExpanded={expandedCategories.has(category.id)}
                    onToggle={() => toggleCategory(category.id)}
                    onAddItem={() => openAddItem(category.id)}
                    onAddFromCatalog={() => openCatalogForCategory(category.id)}
                    onEditItem={(item) => openEditItem(item, category.id)}
                    onDeleteItem={(itemId) => handleDeleteItem(itemId, category.id)}
                    onDeleteCategory={() => handleDeleteCategory(category.id)}
                    isLocked={false}
                  />
                ))}

                {/* Totals footer row */}
                <TableRow className="bg-muted/50 font-bold border-t-2">
                  <TableCell className="py-3">
                    <span className="text-base">Estimate Total</span>
                  </TableCell>
                  <TableCell />
                  <TableCell />
                  <TableCell />
                  <TableCell className="text-right text-base">
                    {formatCurrency(totalBuilderCost)}
                  </TableCell>
                  <TableCell className="text-right text-base">
                    {formatCurrency(totalClientPrice)}
                  </TableCell>
                  <TableCell className="text-right text-base text-green-600">
                    {formatCurrency(totalProfit)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      {/* ── Add Category Dialog ── */}
      <Dialog open={addCategoryOpen} onOpenChange={setAddCategoryOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Category</DialogTitle>
            <DialogDescription>
              Organize your estimate by trade or cost code
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Cost Code (optional)</Label>
              <Select
                value={newCategoryForm.cost_code_id}
                onValueChange={(val) => {
                  const code = costCodes.find((c) => c.id === val);
                  setNewCategoryForm({
                    cost_code_id: val,
                    name: code
                      ? `${code.code} - ${code.name}`
                      : newCategoryForm.name,
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a cost code..." />
                </SelectTrigger>
                <SelectContent className="max-h-60 overflow-y-auto">
                  {costCodes.map((code) => (
                    <SelectItem key={code.id} value={code.id}>
                      {code.code} - {code.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Category Name</Label>
              <Input
                value={newCategoryForm.name}
                onChange={(e) =>
                  setNewCategoryForm({ ...newCategoryForm, name: e.target.value })
                }
                placeholder="e.g. Foundation, Framing, Electrical..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddCategoryOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddCategory}
              disabled={!newCategoryForm.name.trim()}
            >
              Add Category
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Item Detail Modal ── */}
      <Dialog open={itemModalOpen} onOpenChange={setItemModalOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editingItem ? "Edit Cost Item" : "Add Cost Item"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto">
            {/* Title + Cost Type */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input
                  value={itemForm.title}
                  onChange={(e) =>
                    setItemForm({ ...itemForm, title: e.target.value })
                  }
                  placeholder="e.g. Framing Lumber - 2x4"
                />
              </div>
              <div className="space-y-2">
                <Label>Cost Type</Label>
                <Select
                  value={itemForm.cost_type}
                  onValueChange={(val: CostType) =>
                    setItemForm({ ...itemForm, cost_type: val })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="material">Material</SelectItem>
                    <SelectItem value="labor">Labor</SelectItem>
                    <SelectItem value="equipment">Equipment</SelectItem>
                    <SelectItem value="subcontractor">Subcontractor</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Cost Code */}
            <div className="space-y-2">
              <Label>Cost Code</Label>
              <Select
                value={itemForm.cost_code}
                onValueChange={(val) =>
                  setItemForm({ ...itemForm, cost_code: val })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select cost code..." />
                </SelectTrigger>
                <SelectContent>
                  {costCodes.map((code) => (
                    <SelectItem key={code.id} value={code.code}>
                      {code.code} - {code.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={itemForm.description}
                onChange={(e) =>
                  setItemForm({ ...itemForm, description: e.target.value })
                }
                placeholder="Item details..."
                rows={2}
              />
            </div>

            {/* Cost Information */}
            <div className="border-t pt-4">
              <h4 className="text-sm font-medium mb-3">Cost Information</h4>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Unit Cost</Label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                      $
                    </span>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      className="pl-6"
                      value={itemForm.unit_cost || ""}
                      onChange={(e) =>
                        setItemForm({
                          ...itemForm,
                          unit_cost: parseFloat(e.target.value) || 0,
                        })
                      }
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Quantity</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={itemForm.quantity || ""}
                    onChange={(e) =>
                      setItemForm({
                        ...itemForm,
                        quantity: parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Unit</Label>
                  <Select
                    value={itemForm.unit}
                    onValueChange={(val) =>
                      setItemForm({ ...itemForm, unit: val })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EACH">EACH</SelectItem>
                      <SelectItem value="sqft">sqft</SelectItem>
                      <SelectItem value="lnft">lnft</SelectItem>
                      <SelectItem value="CU YD">CU YD</SelectItem>
                      <SelectItem value="hour">hour</SelectItem>
                      <SelectItem value="day">day</SelectItem>
                      <SelectItem value="sheet">sheet</SelectItem>
                      <SelectItem value="bag">bag</SelectItem>
                      <SelectItem value="ton">ton</SelectItem>
                      <SelectItem value="gallon">gallon</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Builder Cost (computed) */}
              <div className="grid grid-cols-3 gap-3 mt-3">
                <div className="space-y-1">
                  <Label className="text-xs">Builder Cost</Label>
                  <div className="h-9 px-3 flex items-center rounded-md border bg-muted font-mono font-semibold">
                    {formatCurrency(formBuilderCost)}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Markup %</Label>
                  <div className="relative">
                    <Input
                      type="number"
                      step="0.5"
                      min="0"
                      value={itemForm.markup_percent || ""}
                      onChange={(e) =>
                        setItemForm({
                          ...itemForm,
                          markup_percent: parseFloat(e.target.value) || 0,
                        })
                      }
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                      %
                    </span>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Client Price</Label>
                  <div className="h-9 px-3 flex items-center rounded-md border bg-muted font-mono font-semibold text-primary">
                    {formatCurrency(formClientPrice)}
                  </div>
                </div>
              </div>

              {/* Profit display */}
              {formBuilderCost > 0 && (
                <div className="mt-3 p-2 rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 flex items-center justify-between text-sm">
                  <span className="text-green-700 dark:text-green-400">
                    Profit on this item
                  </span>
                  <span className="font-bold text-green-700 dark:text-green-400">
                    {formatCurrency(formMarkupAmount)}
                  </span>
                </div>
              )}
            </div>

            {/* Options */}
            <div className="flex items-center gap-6 border-t pt-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="show_to_client"
                  checked={itemForm.show_to_client}
                  onCheckedChange={(checked) =>
                    setItemForm({ ...itemForm, show_to_client: !!checked })
                  }
                />
                <Label htmlFor="show_to_client" className="text-sm font-normal">
                  Show to client
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="save_to_catalog"
                  checked={itemForm.save_to_catalog}
                  onCheckedChange={(checked) =>
                    setItemForm({ ...itemForm, save_to_catalog: !!checked })
                  }
                />
                <Label htmlFor="save_to_catalog" className="text-sm font-normal">
                  Save to catalog
                </Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setItemModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveItem}>
              {editingItem ? "Update Item" : "Add Item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Catalog Modal ── */}
      <Dialog open={catalogOpen} onOpenChange={setCatalogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Cost Catalog</DialogTitle>
            <DialogDescription>
              Quick-add items from your catalog library
            </DialogDescription>
          </DialogHeader>

          {/* Search + Filter */}
          <div className="flex gap-2 py-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                placeholder="Search items..."
                className="pl-8"
              />
            </div>
            <Select value={catalogFilter} onValueChange={setCatalogFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="material">Material</SelectItem>
                <SelectItem value="labor">Labor</SelectItem>
                <SelectItem value="equipment">Equipment</SelectItem>
                <SelectItem value="subcontractor">Subcontractor</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Catalog Table */}
          <div className="flex-1 overflow-auto border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Unit Cost</TableHead>
                  <TableHead className="text-right">Unit</TableHead>
                  <TableHead className="text-right">Markup</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCatalog.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center py-8 text-muted-foreground"
                    >
                      No catalog items found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCatalog.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="font-medium">{item.title}</div>
                        {item.description && (
                          <div className="text-xs text-muted-foreground truncate max-w-xs">
                            {item.description}
                          </div>
                        )}
                        <Badge variant="outline" className="text-xs mt-1">
                          {item.cost_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(item.unit_cost)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {item.unit}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {item.default_markup_percent}%
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" onClick={() => addFromCatalog(item)}>
                          <Plus className="h-3 w-3 mr-1" />
                          Add
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Category Section Component ──────────────────────────────

interface CategorySectionProps {
  category: EstimateCategory;
  isExpanded: boolean;
  onToggle: () => void;
  onAddItem: () => void;
  onAddFromCatalog: () => void;
  onEditItem: (item: EstimateBuilderItem) => void;
  onDeleteItem: (itemId: string) => void;
  onDeleteCategory: () => void;
  isLocked: boolean;
}

function CategorySection({
  category,
  isExpanded,
  onToggle,
  onAddItem,
  onAddFromCatalog,
  onEditItem,
  onDeleteItem,
  onDeleteCategory,
  isLocked,
}: CategorySectionProps) {
  const items = (category.items || []) as EstimateBuilderItem[];

  return (
    <>
      {/* Category Header Row */}
      <TableRow className="bg-muted/30 hover:bg-muted/50">
        <TableCell className="py-2">
          <div className="flex items-center gap-2">
            <button onClick={onToggle} className="p-0.5 rounded hover:bg-muted">
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
            <span className="font-semibold text-sm">{category.name}</span>
            <span className="text-xs text-muted-foreground">
              ({items.length} item{items.length !== 1 ? "s" : ""})
            </span>
            {!isLocked && (
              <div className="flex items-center gap-1 ml-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddItem();
                  }}
                  title="Add custom item"
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddFromCatalog();
                  }}
                  title="Add from catalog"
                >
                  <Library className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        </TableCell>
        <TableCell />
        <TableCell />
        <TableCell />
        <TableCell className="text-right font-semibold text-sm">
          {formatCurrency(category.builder_cost || 0)}
        </TableCell>
        <TableCell className="text-right font-semibold text-sm">
          {formatCurrency(category.client_price || 0)}
        </TableCell>
        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-2">
            <span className="font-semibold text-sm text-green-600">
              {formatCurrency(
                (category.client_price || 0) - (category.builder_cost || 0)
              )}
            </span>
            {!isLocked && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={onAddItem}>
                    <Plus className="h-3.5 w-3.5 mr-2" />
                    Add Item
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onAddFromCatalog}>
                    <Library className="h-3.5 w-3.5 mr-2" />
                    Add from Catalog
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={onDeleteCategory}
                    className="text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-2" />
                    Delete Category
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </TableCell>
      </TableRow>

      {/* Item rows (if expanded) */}
      {isExpanded &&
        items.map((item) => (
          <TableRow
            key={item.id}
            className="hover:bg-muted/20 cursor-pointer group"
            onClick={() => !isLocked && onEditItem(item)}
          >
            <TableCell className="pl-10">
              <div className="flex items-center gap-2">
                <div>
                  <span className="text-sm font-medium text-primary">
                    {item.title || item.description}
                  </span>
                  {item.cost_code && (
                    <span className="text-xs text-muted-foreground ml-2">
                      [{item.cost_code}]
                    </span>
                  )}
                  {item.description &&
                    item.title &&
                    item.description !== item.title && (
                      <div className="text-xs text-muted-foreground truncate max-w-xs">
                        {item.description}
                      </div>
                    )}
                </div>
              </div>
            </TableCell>
            <TableCell className="text-right font-mono text-sm">
              {formatCurrency(item.unit_cost || 0)}
            </TableCell>
            <TableCell className="text-right text-sm">
              {(item.quantity || 0).toFixed(
                item.quantity % 1 === 0 ? 0 : 2
              )}
            </TableCell>
            <TableCell className="text-right text-xs text-muted-foreground">
              {item.unit || "EACH"}
            </TableCell>
            <TableCell className="text-right font-mono text-sm">
              {formatCurrency(item.builder_cost || 0)}
            </TableCell>
            <TableCell className="text-right font-mono text-sm">
              {formatCurrency(item.client_price || 0)}
            </TableCell>
            <TableCell className="text-right">
              <div className="flex items-center justify-end gap-2">
                <span className="font-mono text-sm text-green-600">
                  {formatCurrency(item.profit || 0)}
                </span>
                {!isLocked && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteItem(item.id);
                    }}
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}

      {/* Empty state row */}
      {isExpanded && items.length === 0 && (
        <TableRow>
          <TableCell
            colSpan={7}
            className="text-center py-4 text-muted-foreground text-sm"
          >
            No items yet.{" "}
            {!isLocked && (
              <>
                <button
                  onClick={onAddItem}
                  className="text-primary underline hover:no-underline"
                >
                  Add item
                </button>{" "}
                or{" "}
                <button
                  onClick={onAddFromCatalog}
                  className="text-primary underline hover:no-underline"
                >
                  browse catalog
                </button>
              </>
            )}
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
