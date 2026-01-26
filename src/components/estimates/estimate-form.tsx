"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import {
  Plus,
  Trash2,
  Loader2,
  Save,
  Calculator,
} from "lucide-react";
import { AIDescriptionField } from "@/components/ai/ai-description-field";
import { TemplateSelector } from "@/components/templates/template-selector";
import { FlexibleLineItemForm } from "@/components/line-items/flexible-line-item-form";
import { QuickEntryButtons } from "@/components/line-items/quick-entry-buttons";
import type {
  Estimate,
  EstimateLineItem,
  EstimateLineCategory,
  Client,
  Material,
  Worker,
  Equipment,
  DocumentTemplate,
  LineItemEntryMode,
} from "@/types";

interface EstimateFormProps {
  estimate?: Estimate;
  lineItems?: EstimateLineItem[];
  mode: "create" | "edit";
}

interface LineItemFormData {
  id?: string;
  category: EstimateLineCategory;
  description: string;
  quantity?: number;
  unit?: string;
  unit_rate?: number;
  entry_mode: LineItemEntryMode;
  manual_amount?: number;
  worker_id?: string;
  material_id?: string;
  equipment_id?: string;
  notes?: string;
}

export function EstimateForm({ estimate, lineItems = [], mode }: EstimateFormProps) {
  const router = useRouter();
  const supabase = createClient();
  const { toast } = useToast();
  const { profile } = useAuth();

  const [saving, setSaving] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<DocumentTemplate | null>(null);
  const [templateId, setTemplateId] = useState<string | undefined>(estimate?.template_id);
  const [showLineItemForm, setShowLineItemForm] = useState(false);
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [quickMode, setQuickMode] = useState<LineItemEntryMode | undefined>(undefined);
  const [quickCategory, setQuickCategory] = useState<string | undefined>(undefined);

  // Form state
  const [formData, setFormData] = useState({
    client_id: estimate?.client_id || "",
    client_name: estimate?.client_name || "",
    client_email: estimate?.client_email || "",
    client_phone: estimate?.client_phone || "",
    client_address: estimate?.client_address || "",
    title: estimate?.title || "",
    description: estimate?.description || "",
    issue_date: estimate?.issue_date || new Date().toISOString().split("T")[0],
    valid_until: estimate?.valid_until || "",
    overhead_markup_percent: estimate?.overhead_markup_percent || 0,
    profit_margin_percent: estimate?.profit_margin_percent || 0,
    tax_rate: estimate?.tax_rate || 0,
    notes: estimate?.notes || "",
    terms_and_conditions: estimate?.terms_and_conditions ||
      "This estimate is valid for 30 days from the issue date. Prices are subject to change based on material costs and project scope changes. A 50% deposit is required to begin work.",
  });

  const [items, setItems] = useState<LineItemFormData[]>(
    lineItems.length > 0
      ? lineItems.map((item) => ({
          id: item.id,
          category: item.category,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit || "",
          unit_rate: item.unit_rate,
          entry_mode: item.entry_mode || "detailed",
          manual_amount: item.manual_amount,
          worker_id: item.worker_id,
          material_id: item.material_id,
          equipment_id: item.equipment_id,
          notes: item.notes,
        }))
      : []
  );

  useEffect(() => {
    fetchReferenceData();
  }, []);

  const fetchReferenceData = async () => {
    try {
      let workersQuery = supabase.from("workers").select("*").eq("status", "active");
      if (profile?.company_id) {
        workersQuery = workersQuery.eq("company_id", profile.company_id);
      }
      
      const [clientsRes, materialsRes, workersRes, equipmentRes] = await Promise.all([
        supabase.from("clients").select("*").order("name"),
        supabase.from("materials").select("*").order("name"),
        workersQuery.order("last_name"),
        supabase.from("equipment").select("*").eq("status", "available").order("name"),
      ]);

      if (clientsRes.data) setClients(clientsRes.data);
      if (materialsRes.data) setMaterials(materialsRes.data);
      if (workersRes.data) setWorkers(workersRes.data);
      if (equipmentRes.data) setEquipment(equipmentRes.data);
    } catch (error) {
      console.error("Error fetching reference data:", error);
    }
  };

  const handleClientChange = (clientId: string) => {
    const client = clients.find((c) => c.id === clientId);
    if (client) {
      setFormData({
        ...formData,
        client_id: clientId,
        client_name: client.name,
        client_email: client.email || "",
        client_phone: client.phone || "",
        client_address: `${client.address || ""}${client.city ? `, ${client.city}` : ""}`,
      });
    }
  };

  const handleQuickAdd = (mode: LineItemEntryMode, category: string) => {
    setQuickMode(mode);
    setQuickCategory(category);
    setShowLineItemForm(true);
  };

  const handleAddLineItem = () => {
    setQuickMode(undefined);
    setQuickCategory(undefined);
    setEditingItemIndex(null);
    setShowLineItemForm(true);
  };

  const handleEditLineItem = (index: number) => {
    setEditingItemIndex(index);
    setShowLineItemForm(true);
  };

  const handleSaveLineItem = (item: any) => {
    if (editingItemIndex !== null) {
      // Edit existing item
      const newItems = [...items];
      newItems[editingItemIndex] = { ...item, id: items[editingItemIndex].id };
      setItems(newItems);
    } else {
      // Add new item
      setItems([...items, item]);
    }
    setShowLineItemForm(false);
    setEditingItemIndex(null);
    setQuickMode(undefined);
    setQuickCategory(undefined);
  };

  const handleCancelLineItem = () => {
    setShowLineItemForm(false);
    setEditingItemIndex(null);
    setQuickMode(undefined);
    setQuickCategory(undefined);
  };

  const removeLineItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  // Calculate totals
  const subtotal = items.reduce((sum, item) => {
    if (item.entry_mode === "lump_sum") {
      return sum + (item.manual_amount || 0);
    }
    return sum + ((item.quantity || 0) * (item.unit_rate || 0));
  }, 0);
  const overheadAmount = subtotal * (formData.overhead_markup_percent / 100);
  const profitAmount = (subtotal + overheadAmount) * (formData.profit_margin_percent / 100);
  const taxableAmount = subtotal + overheadAmount + profitAmount;
  const taxAmount = taxableAmount * (formData.tax_rate / 100);
  const totalAmount = taxableAmount + taxAmount;

  const generateEstimateNumber = () => {
    const prefix = "EST";
    const date = new Date().toISOString().slice(2, 10).replace(/-/g, "");
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}-${date}-${random}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      if (!profile) {
        throw new Error("User profile not loaded. Please refresh the page and try again.");
      }

      if (!profile.company_id) {
        throw new Error("You must be associated with a company to create estimates. Please contact your administrator to assign you to a company.");
      }

      if (!formData.client_name || !formData.title) {
        throw new Error("Client name and title are required");
      }

      if (items.some((item) => !item.description)) {
        throw new Error("All line items must have a description");
      }

      if (items.some((item) => {
        if (item.entry_mode === "lump_sum") {
          return !item.manual_amount || item.manual_amount <= 0;
        }
        return !item.unit_rate || item.unit_rate <= 0;
      })) {
        throw new Error("All line items must have a valid amount or rate");
      }

      if (mode === "create") {
        // Create estimate
        const { data: newEstimate, error: estimateError } = await supabase
          .from("estimates")
          .insert({
            estimate_number: generateEstimateNumber(),
            company_id: profile.company_id,
            client_id: formData.client_id || null,
            client_name: formData.client_name,
            client_email: formData.client_email || null,
            client_phone: formData.client_phone || null,
            client_address: formData.client_address || null,
            title: formData.title,
            description: formData.description || null,
            issue_date: formData.issue_date,
            valid_until: formData.valid_until || null,
            overhead_markup_percent: formData.overhead_markup_percent,
            profit_margin_percent: formData.profit_margin_percent,
            tax_rate: formData.tax_rate,
            notes: formData.notes || null,
            terms_and_conditions: formData.terms_and_conditions || null,
            template_id: templateId || null,
            status: "draft",
            created_by: profile?.id,
          })
          .select()
          .single();

        if (estimateError) throw estimateError;

        // Create line items
        const lineItemsToInsert = items.map((item, index) => {
          const amount = item.entry_mode === "lump_sum"
            ? (item.manual_amount || 0)
            : ((item.quantity || 0) * (item.unit_rate || 0));

          return {
            estimate_id: newEstimate.id,
            category: item.category,
            description: item.description,
            quantity: item.entry_mode === "lump_sum" ? null : item.quantity,
            unit: item.entry_mode === "lump_sum" ? null : (item.unit || null),
            unit_rate: item.entry_mode === "lump_sum" ? null : item.unit_rate,
            entry_mode: item.entry_mode,
            manual_amount: item.entry_mode === "lump_sum" ? item.manual_amount : null,
            amount: amount,
            worker_id: item.worker_id || null,
            material_id: item.material_id || null,
            equipment_id: item.equipment_id || null,
            notes: item.notes || null,
            order_index: index,
          };
        });

        const { error: itemsError } = await supabase
          .from("estimate_line_items")
          .insert(lineItemsToInsert);

        if (itemsError) throw itemsError;

        toast({
          title: "Estimate created",
          description: `Estimate ${newEstimate.estimate_number} has been created.`,
        });

        router.push(`/estimates/${newEstimate.id}`);
      } else {
        // Update estimate
        const { error: estimateError } = await supabase
          .from("estimates")
          .update({
            client_id: formData.client_id || null,
            client_name: formData.client_name,
            client_email: formData.client_email || null,
            client_phone: formData.client_phone || null,
            client_address: formData.client_address || null,
            title: formData.title,
            description: formData.description || null,
            issue_date: formData.issue_date,
            valid_until: formData.valid_until || null,
            overhead_markup_percent: formData.overhead_markup_percent,
            profit_margin_percent: formData.profit_margin_percent,
            tax_rate: formData.tax_rate,
            notes: formData.notes || null,
            terms_and_conditions: formData.terms_and_conditions || null,
          })
          .eq("id", estimate!.id);

        if (estimateError) throw estimateError;

        // Delete existing line items
        await supabase.from("estimate_line_items").delete().eq("estimate_id", estimate!.id);

        // Create new line items
        const lineItemsToInsert = items.map((item, index) => {
          const amount = item.entry_mode === "lump_sum"
            ? (item.manual_amount || 0)
            : ((item.quantity || 0) * (item.unit_rate || 0));

          return {
            estimate_id: estimate!.id,
            category: item.category,
            description: item.description,
            quantity: item.entry_mode === "lump_sum" ? null : item.quantity,
            unit: item.entry_mode === "lump_sum" ? null : (item.unit || null),
            unit_rate: item.entry_mode === "lump_sum" ? null : item.unit_rate,
            entry_mode: item.entry_mode,
            manual_amount: item.entry_mode === "lump_sum" ? item.manual_amount : null,
            amount: amount,
            worker_id: item.worker_id || null,
            material_id: item.material_id || null,
            equipment_id: item.equipment_id || null,
            notes: item.notes || null,
            order_index: index,
          };
        });

        const { error: itemsError } = await supabase
          .from("estimate_line_items")
          .insert(lineItemsToInsert);

        if (itemsError) throw itemsError;

        toast({
          title: "Estimate updated",
          description: "Your changes have been saved.",
        });

        router.push(`/estimates/${estimate!.id}`);
      }
    } catch (error: any) {
      console.error("Error saving estimate:", error);
      
      // Provide helpful error messages for common issues
      let errorMessage = error.message || "Failed to save estimate";
      
      if (error.code === "42501" || error.message?.includes("row-level security")) {
        if (!profile?.company_id) {
          errorMessage = "You must be associated with a company to create estimates. Please contact your administrator to assign you to a company.";
        } else {
          errorMessage = "Permission denied. Please ensure you're associated with a company and try again. If this persists, contact your administrator.";
        }
      }
      
      toast({
        title: "Error saving estimate",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const categoryOptions: { value: EstimateLineCategory; label: string }[] = [
    { value: "labor", label: "Labor" },
    { value: "material", label: "Material" },
    { value: "equipment", label: "Equipment" },
    { value: "subcontractor", label: "Subcontractor" },
    { value: "other", label: "Other" },
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Client Information */}
        <Card>
          <CardHeader>
            <CardTitle>Client Information</CardTitle>
            <CardDescription>Select existing client or enter manually</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Select Existing Client</Label>
              <Select value={formData.client_id} onValueChange={handleClientChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a client..." />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Separator />
            <div className="space-y-2">
              <Label htmlFor="client_name">Client Name *</Label>
              <Input
                id="client_name"
                value={formData.client_name}
                onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
                placeholder="Enter client name"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="client_email">Email</Label>
                <Input
                  id="client_email"
                  type="email"
                  value={formData.client_email}
                  onChange={(e) => setFormData({ ...formData, client_email: e.target.value })}
                  placeholder="client@email.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="client_phone">Phone</Label>
                <Input
                  id="client_phone"
                  value={formData.client_phone}
                  onChange={(e) => setFormData({ ...formData, client_phone: e.target.value })}
                  placeholder="(242) 555-0100"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="client_address">Address</Label>
              <Input
                id="client_address"
                value={formData.client_address}
                onChange={(e) => setFormData({ ...formData, client_address: e.target.value })}
                placeholder="Street, City"
              />
            </div>
          </CardContent>
        </Card>

        {/* Estimate Details */}
        <Card>
          <CardHeader>
            <CardTitle>Estimate Details</CardTitle>
            <CardDescription>Basic information about this estimate</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Project Title *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="e.g., Kitchen Renovation"
                required
              />
            </div>
            <AIDescriptionField
              id="description"
              label="Description"
              value={formData.description}
              onChange={(value) => setFormData({ ...formData, description: value })}
              placeholder="Brief description of the work..."
              rows={3}
              contentType="estimate_description"
              context={{
                title: formData.title,
                client_name: formData.client_name,
                project_type: "Construction",
                line_items: items.map((item) => ({
                  category: item.category,
                  description: item.description,
                  quantity: item.quantity,
                  unit: item.unit,
                })),
              }}
            />
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="issue_date">Issue Date *</Label>
                <DatePicker
                  id="issue_date"
                  value={formData.issue_date}
                  onChange={(value) => setFormData({ ...formData, issue_date: value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="valid_until">Valid Until</Label>
                <DatePicker
                  id="valid_until"
                  value={formData.valid_until}
                  onChange={(value) => setFormData({ ...formData, valid_until: value })}
                />
              </div>
            </div>
            <Separator />
            <TemplateSelector
              type="estimate"
              selectedTemplateId={templateId}
              onTemplateChange={(id, template) => {
                setTemplateId(id);
                setSelectedTemplate(template);
              }}
            />
          </CardContent>
        </Card>
      </div>

      {/* Line Items */}
      {!showLineItemForm ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Line Items</CardTitle>
                <CardDescription>Add labor, materials, equipment, and other costs</CardDescription>
              </div>
              <Button type="button" onClick={handleAddLineItem}>
                <Plus className="h-4 w-4 mr-2" />
                Add Item
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Quick Entry Buttons */}
            {items.length === 0 && (
              <QuickEntryButtons onQuickAdd={handleQuickAdd} />
            )}

            {/* Existing Line Items */}
            {items.map((item, index) => {
              const itemAmount = item.entry_mode === "lump_sum"
                ? (item.manual_amount || 0)
                : ((item.quantity || 0) * (item.unit_rate || 0));

              return (
                <div
                  key={index}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-muted-foreground uppercase">
                        {item.category}
                      </span>
                      {item.entry_mode === "lump_sum" && (
                        <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded">
                          Lump Sum
                        </span>
                      )}
                    </div>
                    <div className="font-medium">{item.description}</div>
                    <div className="text-sm text-muted-foreground">
                      {item.entry_mode === "lump_sum" ? (
                        "Total amount"
                      ) : (
                        <>
                          {item.quantity} {item.unit} × {formatCurrency(item.unit_rate || 0)}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-lg font-bold">
                        {formatCurrency(itemAmount)}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditLineItem(index)}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeLineItem(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}

            {items.length === 0 && !showLineItemForm && (
              <div className="text-center py-8 text-muted-foreground">
                <p>No line items added yet</p>
                <p className="text-sm mt-1">Use the quick add buttons above or click "Add Item"</p>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <FlexibleLineItemForm
          type="estimate"
          workers={workers}
          onSave={handleSaveLineItem}
          onCancel={handleCancelLineItem}
          initialData={editingItemIndex !== null ? items[editingItemIndex] : undefined}
          quickMode={quickMode}
          quickCategory={quickCategory}
        />
      )}

      {/* Pricing & Summary */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Markup & Tax
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="overhead">Overhead %</Label>
                <Input
                  id="overhead"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={formData.overhead_markup_percent}
                  onChange={(e) =>
                    setFormData({ ...formData, overhead_markup_percent: parseFloat(e.target.value) || 0 })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profit">Profit Margin %</Label>
                <Input
                  id="profit"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={formData.profit_margin_percent}
                  onChange={(e) =>
                    setFormData({ ...formData, profit_margin_percent: parseFloat(e.target.value) || 0 })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tax">Tax Rate %</Label>
                <Input
                  id="tax"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={formData.tax_rate}
                  onChange={(e) =>
                    setFormData({ ...formData, tax_rate: parseFloat(e.target.value) || 0 })
                  }
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Estimate Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            {overheadAmount > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Overhead ({formData.overhead_markup_percent}%)
                </span>
                <span>{formatCurrency(overheadAmount)}</span>
              </div>
            )}
            {profitAmount > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Profit ({formData.profit_margin_percent}%)
                </span>
                <span>{formatCurrency(profitAmount)}</span>
              </div>
            )}
            {taxAmount > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax ({formData.tax_rate}%)</span>
                <span>{formatCurrency(taxAmount)}</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between text-lg font-bold">
              <span>Total</span>
              <span>{formatCurrency(totalAmount)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Notes & Terms */}
      <Card>
        <CardHeader>
          <CardTitle>Notes & Terms</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="notes">Internal Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Internal notes (not shown to client)..."
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="terms">Terms & Conditions</Label>
            <Textarea
              id="terms"
              value={formData.terms_and_conditions}
              onChange={(e) => setFormData({ ...formData, terms_and_conditions: e.target.value })}
              placeholder="Payment terms, warranty information, etc."
              rows={4}
            />
          </div>
        </CardContent>
      </Card>

      {/* Submit */}
      <div className="flex items-center justify-end gap-4">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {mode === "create" ? "Create Estimate" : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}
