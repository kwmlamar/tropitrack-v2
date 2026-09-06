"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
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
  Wand2,
} from "lucide-react";
import { ClaudeIcon } from "@/components/icons/claude-icon";
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

  // AI generation state
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiDescription, setAiDescription] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);

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

  // ─── AI Generate ────────────────────────────────────────

  const handleAIGenerate = async () => {
    if (!aiDescription.trim() || aiGenerating) return;
    setAiGenerating(true);

    try {
      // 1. Fetch materials DB
      const { data: materials, error: matError } = await supabase
        .from("materials")
        .select("id, name, unit, unit_cost, division_name, category")
        .order("name");
      if (matError) throw matError;

      // 2. Call generate API
      const res = await fetch("/api/estimates/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: aiDescription, materials: materials || [] }),
      });
      if (!res.ok) throw new Error("Generation failed — check OPENAI_API_KEY");

      const generated = await res.json();
      if (generated.error) throw new Error(generated.error);
      if (!generated.sections?.length) throw new Error("No sections returned");

      // 3. Convert sections → EstimateCategory[]
      const newCategories = (generated.sections as any[]).map((section, sIdx) => {
        const catId = crypto.randomUUID();

        const items: EstimateBuilderItem[] = (section.items as any[]).map((item, iIdx) => {
          const totalCost =
            (item.labor_cost || 0) + (item.material_cost || 0) + (item.equipment_cost || 0);
          const qty = Math.max(item.quantity || 1, 0.01);
          const unitCost = Math.round((totalCost / qty) * 100) / 100;
          const builderCost = Math.round(unitCost * qty * 100) / 100;
          const markupAmt = Math.round(builderCost * 0.15 * 100) / 100;
          const clientPrice = Math.round((builderCost + markupAmt) * 100) / 100;

          const dominant: CostType =
            (item.labor_cost || 0) >= (item.material_cost || 0) &&
            (item.labor_cost || 0) >= (item.equipment_cost || 0)
              ? "labor"
              : (item.material_cost || 0) >= (item.equipment_cost || 0)
              ? "material"
              : "equipment";

          const breakdown = [
            item.labor_cost > 0 && `Labor $${(item.labor_cost as number).toFixed(0)}`,
            item.material_cost > 0 && `Mat $${(item.material_cost as number).toFixed(0)}`,
            item.equipment_cost > 0 && `Equip $${(item.equipment_cost as number).toFixed(0)}`,
          ]
            .filter(Boolean)
            .join(" · ");

          return {
            id: crypto.randomUUID(),
            estimate_id: "",
            category_id: catId,
            title: item.description,
            description: [item.notes, breakdown].filter(Boolean).join(" — "),
            category: dominant,
            cost_type: dominant,
            cost_code: "",
            unit_cost: unitCost,
            quantity: qty,
            unit: item.unit || "LS",
            unit_rate: unitCost,
            amount: clientPrice,
            builder_cost: builderCost,
            markup_percent: 15,
            markup_amount: markupAmt,
            client_price: clientPrice,
            profit: markupAmt,
            show_to_client: true,
            save_to_catalog: false,
            entry_mode: "detailed",
            display_order: iIdx,
          } as EstimateBuilderItem;
        });

        const catBuilderCost = items.reduce((s, i) => s + (i.builder_cost || 0), 0);
        const catClientPrice = items.reduce((s, i) => s + (i.client_price || 0), 0);

        return {
          id: catId,
          estimate_id: "",
          cost_code_id: null,
          name: section.name,
          display_order: categories.length + sIdx,
          builder_cost: catBuilderCost,
          client_price: catClientPrice,
          profit: catClientPrice - catBuilderCost,
          show_to_client: true,
          is_expanded: true,
          items,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as unknown as EstimateCategory;
      });

      // 4. Populate builder state
      setCategories((prev) => [...prev, ...newCategories]);
      setExpandedCategories(
        (prev) => new Set([...Array.from(prev), ...newCategories.map((c) => c.id)])
      );

      // 5. Auto-fill title if empty
      if (generated.property_name && !detailsForm.title) {
        setDetailsForm((prev) => ({ ...prev, title: generated.property_name }));
      }

      const totalItems = newCategories.reduce(
        (s, c) => s + ((c.items as any[])?.length || 0),
        0
      );
      toast({
        title: "Estimate generated",
        description: `${newCategories.length} trade sections · ${totalItems} line items`,
      });

      setAiPanelOpen(false);
      setAiDescription("");
    } catch (error: any) {
      toast({
        title: "Generation failed",
        description: error.message || "Unknown error",
        variant: "destructive",
      });
    } finally {
      setAiGenerating(false);
    }
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
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="h-5 w-5 rounded-full border border-strong border-t-primary animate-spin" />
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* ── Top Bar ── */}
      <div className="border-b border-border bg-surface-100 sticky top-0 z-20">
        <div className="px-4 py-3">
          <div className="flex items-center gap-3 mb-2">
            <Link href="/estimates" className="text-[11px] tabular-nums text-foreground-lighter hover:text-foreground-light transition-colors">
              ← Estimates
            </Link>
            <div className="h-3 w-px bg-surface-400" />
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">New Estimate</div>
              <h1 className="text-[15px] font-semibold text-foreground truncate mt-0.5">
                {detailsForm.title || "Untitled"}
              </h1>
            </div>
            <span className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest border border-strong rounded-full px-2 py-0.5">
              Draft
            </span>
          </div>

          {/* Summary metrics row */}
          <div className="flex items-center gap-5 text-[12px]">
            <div>
              <span className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">Builder Cost</span>
              <p className="text-[15px] tabular-nums font-semibold text-foreground-light">{formatCurrency(totalBuilderCost)}</p>
            </div>
            <span className="text-foreground-lighter">→</span>
            <div>
              <span className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">Client Price</span>
              <p className="text-[15px] tabular-nums font-semibold text-foreground">{formatCurrency(totalClientPrice)}</p>
            </div>
            <span className="text-foreground-lighter">·</span>
            <div>
              <span className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">Profit</span>
              <p className="text-[15px] tabular-nums font-semibold text-success">
                {formatCurrency(totalProfit)}
                <span className="text-[10px] font-normal text-foreground-lighter ml-1">({profitMargin.toFixed(1)}%)</span>
              </p>
            </div>

            <div className="ml-auto flex items-center gap-3">
              <button
                onClick={() => router.push("/estimates")}
                className="text-[12px] text-foreground-lighter hover:text-foreground-light transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEstimate}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-surface-300 border border-strong text-[12px] text-brand hover:bg-surface-400 transition-colors disabled:opacity-40"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Save Estimate
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Collapsible Estimate Details ── */}
      <div className="border-b border-border">
        <button
          onClick={() => setDetailsOpen(!detailsOpen)}
          className="w-full px-4 py-2.5 flex items-center gap-2 text-[12px] tabular-nums hover:bg-surface-100 transition-colors"
        >
          <span className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">Estimate Details</span>
          {detailsForm.client_name && (
            <span className="text-[11px] text-foreground-lighter">— {detailsForm.client_name}</span>
          )}
          <div className="flex-1" />
          <ChevronUp
            className={`h-3.5 w-3.5 text-foreground-lighter transition-transform ${detailsOpen ? "" : "rotate-180"}`}
          />
        </button>

        {detailsOpen && (
          <div className="px-4 pb-4 pt-2 space-y-3 bg-surface-100">
            {/* Client + Title row */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">Client</p>
                <Select value={detailsForm.client_id} onValueChange={handleClientSelect}>
                  <SelectTrigger className="h-8 bg-surface-100 border-strong text-foreground-light text-[13px] focus:ring-0 focus:border-strong">
                    <SelectValue placeholder="Select client..." />
                  </SelectTrigger>
                  <SelectContent className="bg-surface-100 border-strong">
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id} className="text-foreground-light focus:bg-surface-100 focus:text-foreground">
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">Client Name *</p>
                <input
                  className="w-full h-8 px-2.5 rounded-md bg-surface-100 border border-strong text-[13px] text-foreground-light placeholder:text-foreground-lighter outline-none focus:border-strong transition-colors"
                  value={detailsForm.client_name}
                  onChange={(e) => setDetailsForm({ ...detailsForm, client_name: e.target.value })}
                  placeholder="Client name"
                />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">Project Title *</p>
                <input
                  className="w-full h-8 px-2.5 rounded-md bg-surface-100 border border-strong text-[13px] text-foreground-light placeholder:text-foreground-lighter outline-none focus:border-strong transition-colors"
                  value={detailsForm.title}
                  onChange={(e) => setDetailsForm({ ...detailsForm, title: e.target.value })}
                  placeholder="e.g. Roof Repair — Governor's Harbour"
                />
              </div>
            </div>

            {/* Contact + Dates row */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: "Email", key: "client_email", placeholder: "email@example.com", type: "email" },
                { label: "Phone", key: "client_phone", placeholder: "(242) 555-0100", type: "text" },
                { label: "Issue Date", key: "issue_date", placeholder: "", type: "date" },
                { label: "Valid Until", key: "valid_until", placeholder: "", type: "date" },
              ].map((f) => (
                <div key={f.key} className="space-y-1">
                  <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">{f.label}</p>
                  <input
                    type={f.type}
                    className="w-full h-8 px-2.5 rounded-md bg-surface-100 border border-strong text-[13px] text-foreground-light placeholder:text-foreground-lighter outline-none focus:border-strong transition-colors"
                    value={(detailsForm as any)[f.key]}
                    onChange={(e) => setDetailsForm({ ...detailsForm, [f.key]: e.target.value })}
                    placeholder={f.placeholder}
                  />
                </div>
              ))}
            </div>

            {/* Description */}
            <div className="space-y-1">
              <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">Description</p>
              <textarea
                className="w-full px-2.5 py-2 rounded-md bg-surface-100 border border-strong text-[13px] text-foreground-light placeholder:text-foreground-lighter outline-none focus:border-strong transition-colors resize-none"
                value={detailsForm.description}
                onChange={(e) => setDetailsForm({ ...detailsForm, description: e.target.value })}
                placeholder="Brief project description..."
                rows={2}
              />
            </div>

            {/* Notes + Terms */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">Notes (internal)</p>
                <textarea
                  className="w-full px-2.5 py-2 rounded-md bg-surface-100 border border-strong text-[13px] text-foreground-light placeholder:text-foreground-lighter outline-none focus:border-strong transition-colors resize-none"
                  value={detailsForm.notes}
                  onChange={(e) => setDetailsForm({ ...detailsForm, notes: e.target.value })}
                  placeholder="Internal notes..."
                  rows={2}
                />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">Terms & Conditions</p>
                <textarea
                  className="w-full px-2.5 py-2 rounded-md bg-surface-100 border border-strong text-[13px] text-foreground-light placeholder:text-foreground-lighter outline-none focus:border-strong transition-colors resize-none"
                  value={detailsForm.terms_and_conditions}
                  onChange={(e) => setDetailsForm({ ...detailsForm, terms_and_conditions: e.target.value })}
                  placeholder="Payment terms, warranty info..."
                  rows={2}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── AI Generate Panel ── */}
      {aiPanelOpen && (
        <div
          className="border-b"
          style={{
            background: "hsl(var(--card))",
          }}
        >
          {/* Panel header */}
          <div className="px-4 pt-3 pb-2 flex items-center gap-2.5">
            <div className="flex items-center gap-1.5">
              <ClaudeIcon
                className="h-3.5 w-3.5 text-warning"
              />
              <span
                className="text-xs font-bold tracking-widest uppercase text-warning"
                style={{ fontFamily: "monospace" }}
              >
                AI Generate
              </span>
            </div>
            <span
              className="text-xs"
              style={{ color: "hsl(var(--muted-foreground))" }}
            >
              — describe the job, Claude fills in trade sections with real Eleuthera prices
            </span>
            <button
              onClick={() => { setAiPanelOpen(false); setAiDescription(""); }}
              className="ml-auto p-1 rounded-md hover:bg-accent transition-colors"
              style={{ color: "hsl(var(--muted-foreground))" }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Textarea */}
          <div className="px-4 pb-3">
            <textarea
              value={aiDescription}
              onChange={(e) => setAiDescription(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleAIGenerate();
              }}
              disabled={aiGenerating}
              placeholder={"e.g. Repair hurricane damage at Governor's Harbour — replace 3 sections of Ondura roofing, fix rotted fascia boards, repaint exterior two coats"}
              rows={3}
              className="w-full rounded-md px-3 py-2.5 text-sm resize-none outline-none transition-all"
              style={{
                background: "hsl(var(--input))",
                border: "1px solid hsl(var(--border))",
                color: "hsl(var(--foreground))",
                fontFamily: "monospace",
                lineHeight: "1.6",
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "hsl(var(--primary))"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "hsl(var(--border))"; }}
            />

            <div className="flex items-center justify-between mt-2">
              <span
                className="text-xs text-foreground-lighter"
              >
                ⌘↵ to generate · uses 165-item Eleuthera materials DB
              </span>

              <button
                onClick={handleAIGenerate}
                disabled={!aiDescription.trim() || aiGenerating}
                className="flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-semibold text-primary-foreground transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                // Brand gradient + glow. Built from the theme's own brand scale rather
                // than literals, so the CTA tracks the orange in both themes. The
                // disabled:opacity above covers the generating state.
                style={{
                  background:
                    "linear-gradient(135deg, hsl(var(--brand-500)) 0%, hsl(var(--primary)) 100%)",
                  boxShadow: aiGenerating ? "none" : "0 0 16px hsl(var(--primary) / 0.25)",
                }}
              >
                {aiGenerating ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Claude is analyzing…</span>
                  </>
                ) : (
                  <>
                    <Wand2 className="h-3.5 w-3.5" />
                    <span>Generate Estimate</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main Content ── */}
      <div className="flex-1 overflow-auto">
        {/* Action bar */}
        <div className="bg-surface-100 border-b border-border px-4 py-2 flex items-center gap-4">
          <button
            onClick={() => setAddCategoryOpen(true)}
            className="text-[11px] tabular-nums text-foreground-lighter hover:text-foreground transition-colors"
          >
            + Section
          </button>
          <button
            onClick={() => { setAddingToCategoryId(categories[0]?.id || null); setCatalogOpen(true); }}
            disabled={categories.length === 0}
            className="text-[11px] tabular-nums text-foreground-lighter hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Catalog
          </button>
          <button
            onClick={() => setAiPanelOpen(!aiPanelOpen)}
            className={cn(
              "text-[11px] tabular-nums transition-colors",
              aiPanelOpen ? "text-brand" : "text-foreground-lighter hover:text-brand"
            )}
          >
            AI Generate
          </button>
          <div className="flex-1" />
          <span className="text-[10px] tabular-nums text-foreground-lighter">
            {categories.reduce((s, c) => s + ((c.items as any[])?.length || 0), 0)} items · {categories.length} sections
          </span>
        </div>

        {/* Table */}
        <div className="px-4 pb-8">
          {categories.length === 0 ? (
            <div className="text-center py-32">
              <p className="text-[13px] text-foreground-lighter">No sections yet</p>
              <p className="text-[12px] text-foreground-lighter mt-1 mb-4">
                Add a category manually or use AI Generate
              </p>
              <button
                onClick={() => setAddCategoryOpen(true)}
                className="text-[12px] text-brand hover:opacity-80 transition-opacity"
              >
                + Add category
              </button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-surface-100 border-b border-border">
                  <TableHead className="w-[40%] text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">Items</TableHead>
                  <TableHead className="text-right w-[10%] text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">Unit Cost</TableHead>
                  <TableHead className="text-right w-[8%] text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">Qty</TableHead>
                  <TableHead className="text-right w-[8%] text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">Unit</TableHead>
                  <TableHead className="text-right w-[12%] text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">Builder Cost</TableHead>
                  <TableHead className="text-right w-[12%] text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">Client Price</TableHead>
                  <TableHead className="text-right w-[10%] text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">Profit</TableHead>
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
                <TableRow className="bg-surface-100 border-t border-border">
                  <TableCell className="py-3">
                    <span className="text-[11px] font-mono text-foreground-lighter uppercase tracking-widest">Estimate Total</span>
                  </TableCell>
                  <TableCell />
                  <TableCell />
                  <TableCell />
                  <TableCell className="text-right text-[14px] tabular-nums font-semibold text-foreground-light">
                    {formatCurrency(totalBuilderCost)}
                  </TableCell>
                  <TableCell className="text-right text-[14px] tabular-nums font-semibold text-foreground">
                    {formatCurrency(totalClientPrice)}
                  </TableCell>
                  <TableCell className="text-right text-[14px] tabular-nums font-semibold text-success">
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
        <DialogContent className="max-w-md bg-surface-100 border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-foreground text-[15px]">Add Section</DialogTitle>
            <DialogDescription className="text-foreground-lighter text-[12px]">
              Organize your estimate by trade or cost code
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">Cost Code (optional)</p>
              <Select
                value={newCategoryForm.cost_code_id}
                onValueChange={(val) => {
                  const code = costCodes.find((c) => c.id === val);
                  setNewCategoryForm({ cost_code_id: val, name: code ? `${code.code} - ${code.name}` : newCategoryForm.name });
                }}
              >
                <SelectTrigger className="bg-surface-100 border-strong text-foreground-light text-[13px] focus:ring-0 focus:border-strong">
                  <SelectValue placeholder="Select a cost code..." />
                </SelectTrigger>
                <SelectContent className="bg-surface-100 border-strong max-h-60 overflow-y-auto">
                  {costCodes.map((code) => (
                    <SelectItem key={code.id} value={code.id} className="text-foreground-light focus:bg-surface-100 focus:text-foreground">
                      {code.code} - {code.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">Section Name</p>
              <input
                className="w-full h-9 px-2.5 rounded-md bg-surface-100 border border-strong text-[13px] text-foreground-light placeholder:text-foreground-lighter outline-none focus:border-strong transition-colors"
                value={newCategoryForm.name}
                onChange={(e) => setNewCategoryForm({ ...newCategoryForm, name: e.target.value })}
                placeholder="e.g. ROOF REPAIRS, MASONRY, CARPENTRY…"
                onKeyDown={(e) => { if (e.key === "Enter") handleAddCategory(); }}
              />
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setAddCategoryOpen(false)} className="px-4 py-2 text-[12px] text-foreground-lighter hover:text-foreground-light transition-colors">
              Cancel
            </button>
            <button
              onClick={handleAddCategory}
              disabled={!newCategoryForm.name.trim()}
              className="px-4 py-2 rounded-md bg-surface-300 border border-strong text-[12px] text-brand hover:bg-surface-400 transition-colors disabled:opacity-40"
            >
              Add Section
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Item Detail Modal ── */}
      <Dialog open={itemModalOpen} onOpenChange={setItemModalOpen}>
        <DialogContent className="max-w-xl bg-surface-100 border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-foreground text-[15px]">
              {editingItem ? "Edit Item" : "Add Item"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 max-h-[70vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">Title</p>
                <input
                  className="w-full h-8 px-2.5 rounded-md bg-surface-100 border border-strong text-[13px] text-foreground-light placeholder:text-foreground-lighter outline-none focus:border-strong transition-colors"
                  value={itemForm.title}
                  onChange={(e) => setItemForm({ ...itemForm, title: e.target.value })}
                  placeholder="e.g. Ondura Roofing Sheet"
                />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">Cost Type</p>
                <Select value={itemForm.cost_type} onValueChange={(val: CostType) => setItemForm({ ...itemForm, cost_type: val })}>
                  <SelectTrigger className="h-8 bg-surface-100 border-strong text-foreground-light text-[13px] focus:ring-0 focus:border-strong">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-surface-100 border-strong">
                    {["material","labor","equipment","subcontractor","other"].map((v) => (
                      <SelectItem key={v} value={v} className="text-foreground-light focus:bg-surface-100 focus:text-foreground capitalize">{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">Cost Code</p>
              <Select value={itemForm.cost_code} onValueChange={(val) => setItemForm({ ...itemForm, cost_code: val })}>
                <SelectTrigger className="h-8 bg-surface-100 border-strong text-foreground-light text-[13px] focus:ring-0 focus:border-strong">
                  <SelectValue placeholder="Select cost code..." />
                </SelectTrigger>
                <SelectContent className="bg-surface-100 border-strong">
                  {costCodes.map((code) => (
                    <SelectItem key={code.id} value={code.code} className="text-foreground-light focus:bg-surface-100 focus:text-foreground">
                      {code.code} - {code.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">Description</p>
              <textarea
                className="w-full px-2.5 py-2 rounded-md bg-surface-100 border border-strong text-[13px] text-foreground-light placeholder:text-foreground-lighter outline-none focus:border-strong transition-colors resize-none"
                value={itemForm.description}
                onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                placeholder="Item details..."
                rows={2}
              />
            </div>

            <div className="border-t border-border pt-3">
              <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest mb-3">Cost</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">Unit Cost</p>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-foreground-lighter text-[12px]">$</span>
                    <input
                      type="number" step="0.01" min="0"
                      className="w-full h-8 pl-6 pr-2.5 rounded-md bg-surface-100 border border-strong text-[13px] text-foreground-light outline-none focus:border-strong transition-colors"
                      value={itemForm.unit_cost || ""}
                      onChange={(e) => setItemForm({ ...itemForm, unit_cost: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">Qty</p>
                  <input
                    type="number" step="0.01" min="0"
                    className="w-full h-8 px-2.5 rounded-md bg-surface-100 border border-strong text-[13px] text-foreground-light outline-none focus:border-strong transition-colors"
                    value={itemForm.quantity || ""}
                    onChange={(e) => setItemForm({ ...itemForm, quantity: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">Unit</p>
                  <Select value={itemForm.unit} onValueChange={(val) => setItemForm({ ...itemForm, unit: val })}>
                    <SelectTrigger className="h-8 bg-surface-100 border-strong text-foreground-light text-[13px] focus:ring-0 focus:border-strong">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-surface-100 border-strong">
                      {["EACH","sqft","lnft","CU YD","hour","day","sheet","bag","ton","gallon","LS"].map((u) => (
                        <SelectItem key={u} value={u} className="text-foreground-light focus:bg-surface-100 focus:text-foreground">{u}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 mt-3">
                <div className="space-y-1">
                  <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">Builder Cost</p>
                  <div className="h-8 px-2.5 flex items-center rounded-md border border-border bg-surface-100 tabular-nums text-[13px] text-foreground-light">
                    {formatCurrency(formBuilderCost)}
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">Markup %</p>
                  <div className="relative">
                    <input
                      type="number" step="0.5" min="0"
                      className="w-full h-8 px-2.5 pr-6 rounded-md bg-surface-100 border border-strong text-[13px] text-foreground-light outline-none focus:border-strong transition-colors"
                      value={itemForm.markup_percent || ""}
                      onChange={(e) => setItemForm({ ...itemForm, markup_percent: parseFloat(e.target.value) || 0 })}
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-foreground-lighter text-[12px]">%</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">Client Price</p>
                  <div className="h-8 px-2.5 flex items-center rounded-md border border-border bg-surface-100 tabular-nums text-[13px] text-brand font-semibold">
                    {formatCurrency(formClientPrice)}
                  </div>
                </div>
              </div>

              {formBuilderCost > 0 && (
                <div className="mt-3 px-3 py-2 rounded-lg border border-success/20 bg-success/5 flex items-center justify-between">
                  <span className="text-[11px] tabular-nums text-success/70">Profit</span>
                  <span className="text-[13px] tabular-nums font-semibold text-success">{formatCurrency(formMarkupAmount)}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-5 border-t border-border pt-3">
              {[
                { id: "show_to_client", label: "Show to client", checked: itemForm.show_to_client, key: "show_to_client" },
                { id: "save_to_catalog", label: "Save to catalog", checked: itemForm.save_to_catalog, key: "save_to_catalog" },
              ].map((opt) => (
                <label key={opt.id} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={opt.checked}
                    onChange={(e) => setItemForm({ ...itemForm, [opt.key]: e.target.checked })}
                    className="accent-primary h-3.5 w-3.5"
                  />
                  <span className="text-[11px] tabular-nums text-foreground-lighter">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          <DialogFooter>
            <button onClick={() => setItemModalOpen(false)} className="px-4 py-2 text-[12px] text-foreground-lighter hover:text-foreground-light transition-colors">
              Cancel
            </button>
            <button
              onClick={handleSaveItem}
              className="px-4 py-2 rounded-md bg-surface-300 border border-strong text-[12px] text-brand hover:bg-surface-400 transition-colors"
            >
              {editingItem ? "Update" : "Add Item"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Catalog Modal ── */}
      <Dialog open={catalogOpen} onOpenChange={setCatalogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col bg-surface-100 border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground text-[15px]">Cost Catalog</DialogTitle>
            <DialogDescription className="text-foreground-lighter text-[12px]">Quick-add items from your catalog library</DialogDescription>
          </DialogHeader>

          <div className="flex gap-2 py-2">
            <input
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
              placeholder="Search items..."
              className="flex-1 h-8 px-2.5 rounded-md bg-surface-100 border border-strong text-[13px] text-foreground-light placeholder:text-foreground-lighter outline-none focus:border-strong transition-colors"
            />
            <div className="flex items-center gap-1">
              {["all","material","labor","equipment","subcontractor"].map((f) => (
                <button
                  key={f}
                  onClick={() => setCatalogFilter(f)}
                  className={cn(
                    "px-2.5 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-wide transition-colors",
                    catalogFilter === f ? "bg-surface-300 text-brand border border-strong" : "text-foreground-lighter hover:text-foreground-light"
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-auto rounded-lg border border-border">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">Item</th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">Unit Cost</th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">Unit</th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">Markup</th>
                  <th className="w-16 px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredCatalog.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-10 text-[13px] text-foreground-lighter">No catalog items found</td>
                  </tr>
                ) : filteredCatalog.map((item) => (
                  <tr key={item.id} className="group hover:bg-surface-200 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-[13px] text-foreground-light">{item.title}</p>
                      {item.description && (
                        <p className="text-[11px] text-foreground-lighter truncate max-w-xs">{item.description}</p>
                      )}
                      <span className="text-[10px] tabular-nums text-foreground-lighter capitalize">{item.cost_type}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-[12px] tabular-nums text-foreground-light">{formatCurrency(item.unit_cost)}</td>
                    <td className="px-4 py-3 text-right text-[11px] tabular-nums text-foreground-lighter">{item.unit}</td>
                    <td className="px-4 py-3 text-right text-[11px] tabular-nums text-foreground-lighter">{item.default_markup_percent}%</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => addFromCatalog(item)}
                        className="text-[11px] text-brand hover:opacity-80 transition-opacity opacity-0 group-hover:opacity-100"
                      >
                        + Add
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
      <TableRow className="group bg-surface-100 hover:bg-surface-200 border-b border-border">
        <TableCell className="py-2.5">
          <div className="flex items-center gap-2">
            <button onClick={onToggle} className="p-0.5 rounded-md hover:bg-surface-100 transition-colors">
              {isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5 text-foreground-lighter" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-foreground-lighter" />
              )}
            </button>
            <span className="text-[12px] font-mono font-semibold text-foreground-light uppercase tracking-wide">{category.name}</span>
            <span className="text-[10px] tabular-nums text-foreground-lighter">
              {items.length} item{items.length !== 1 ? "s" : ""}
            </span>
            {!isLocked && (
              <div className="flex items-center gap-2 ml-2 opacity-0 group-hover:opacity-100">
                <button
                  onClick={(e) => { e.stopPropagation(); onAddItem(); }}
                  className="text-[10px] tabular-nums text-foreground-lighter hover:text-brand transition-colors"
                >
                  + item
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onAddFromCatalog(); }}
                  className="text-[10px] tabular-nums text-foreground-lighter hover:text-foreground-light transition-colors"
                >
                  catalog
                </button>
              </div>
            )}
          </div>
        </TableCell>
        <TableCell />
        <TableCell />
        <TableCell />
        <TableCell className="text-right text-[12px] tabular-nums text-foreground-lighter">
          {formatCurrency(category.builder_cost || 0)}
        </TableCell>
        <TableCell className="text-right text-[12px] tabular-nums text-foreground-light font-semibold">
          {formatCurrency(category.client_price || 0)}
        </TableCell>
        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-3">
            <span className="text-[12px] tabular-nums text-success">
              {formatCurrency((category.client_price || 0) - (category.builder_cost || 0))}
            </span>
            {!isLocked && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="p-1 rounded-md hover:bg-surface-100 transition-colors">
                    <MoreHorizontal className="h-3.5 w-3.5 text-foreground-lighter" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-surface-100 border-border">
                  <DropdownMenuItem onClick={onAddItem} className="text-[12px] text-foreground-light focus:bg-surface-100 focus:text-foreground">
                    Add item
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onAddFromCatalog} className="text-[12px] text-foreground-light focus:bg-surface-100 focus:text-foreground">
                    Add from catalog
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-surface-300" />
                  <DropdownMenuItem onClick={onDeleteCategory} className="text-[12px] text-destructive focus:bg-surface-100 focus:text-destructive">
                    Delete section
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </TableCell>
      </TableRow>

      {/* Item rows */}
      {isExpanded && items.map((item) => (
        <TableRow
          key={item.id}
          className="hover:bg-surface-200 cursor-pointer group border-b border-border"
          onClick={() => !isLocked && onEditItem(item)}
        >
          <TableCell className="pl-10 py-2.5">
            <div>
              <span className="text-[13px] text-foreground-lighter group-hover:text-foreground-light transition-colors">
                {item.title || item.description}
              </span>
              {item.cost_code && (
                <span className="text-[10px] tabular-nums text-foreground-lighter ml-2">[{item.cost_code}]</span>
              )}
              {item.description && item.title && item.description !== item.title && (
                <div className="text-[11px] text-foreground-lighter truncate max-w-xs">{item.description}</div>
              )}
            </div>
          </TableCell>
          <TableCell className="text-right text-[12px] tabular-nums text-foreground-lighter">
            {formatCurrency(item.unit_cost || 0)}
          </TableCell>
          <TableCell className="text-right text-[12px] tabular-nums text-foreground-lighter">
            {(item.quantity || 0) % 1 === 0 ? item.quantity : (item.quantity || 0).toFixed(2)}
          </TableCell>
          <TableCell className="text-right text-[11px] tabular-nums text-foreground-lighter">
            {item.unit || "EACH"}
          </TableCell>
          <TableCell className="text-right text-[12px] tabular-nums text-foreground-lighter">
            {formatCurrency(item.builder_cost || 0)}
          </TableCell>
          <TableCell className="text-right text-[12px] tabular-nums text-foreground-light">
            {formatCurrency(item.client_price || 0)}
          </TableCell>
          <TableCell className="text-right">
            <div className="flex items-center justify-end gap-2">
              <span className="text-[12px] tabular-nums text-success">{formatCurrency(item.profit || 0)}</span>
              {!isLocked && (
                <button
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-surface-100"
                  onClick={(e) => { e.stopPropagation(); onDeleteItem(item.id); }}
                >
                  <Trash2 className="h-3 w-3 text-destructive" />
                </button>
              )}
            </div>
          </TableCell>
        </TableRow>
      ))}

      {isExpanded && items.length === 0 && (
        <TableRow className="border-b border-border">
          <TableCell colSpan={7} className="text-center py-5 text-[12px] text-foreground-lighter">
            No items.{" "}
            {!isLocked && (
              <>
                <button onClick={onAddItem} className="text-brand hover:opacity-80">Add item</button>
                {" "}or{" "}
                <button onClick={onAddFromCatalog} className="text-foreground-lighter hover:text-foreground-light">browse catalog</button>
              </>
            )}
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
