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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import {
  Plus,
  Trash2,
  Loader2,
  Save,
  FolderKanban,
  Calculator,
} from "lucide-react";
import { AIDescriptionField } from "@/components/ai/ai-description-field";
import { TemplateSelector } from "@/components/templates/template-selector";
import { FlexibleLineItemForm } from "@/components/line-items/flexible-line-item-form";
import { QuickEntryButtons } from "@/components/line-items/quick-entry-buttons";
import type {
  Invoice,
  InvoiceLineItem,
  InvoiceType,
  InvoiceLineCategory,
  Client,
  Project,
  DocumentTemplate,
  LineItemEntryMode,
} from "@/types";

interface InvoiceFormProps {
  invoice?: Invoice;
  lineItems?: InvoiceLineItem[];
  mode: "create" | "edit";
}

interface LineItemFormData {
  id?: string;
  category: InvoiceLineCategory;
  description: string;
  quantity?: number;
  unit?: string;
  unit_rate?: number;
  entry_mode: LineItemEntryMode;
  manual_amount?: number;
  notes?: string;
}

interface ProjectCostData {
  laborCosts: Array<{
    worker_name: string;
    hours: number;
    rate: number;
    amount: number;
  }>;
  materialCosts: Array<{
    material_name: string;
    quantity: number;
    unit: string;
    unit_cost: number;
    amount: number;
  }>;
  equipmentCosts: Array<{
    equipment_name: string;
    days: number;
    rate: number;
    amount: number;
  }>;
}

export function InvoiceForm({ invoice, lineItems = [], mode }: InvoiceFormProps) {
  const router = useRouter();
  const supabase = createClient();
  const { toast } = useToast();
  const { profile } = useAuth();

  const [saving, setSaving] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [showProjectDialog, setShowProjectDialog] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projectCosts, setProjectCosts] = useState<ProjectCostData | null>(null);
  const [loadingCosts, setLoadingCosts] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<DocumentTemplate | null>(null);
  const [templateId, setTemplateId] = useState<string | undefined>(invoice?.template_id);
  const [showLineItemForm, setShowLineItemForm] = useState(false);
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [quickMode, setQuickMode] = useState<LineItemEntryMode | undefined>(undefined);
  const [quickCategory, setQuickCategory] = useState<string | undefined>(undefined);

  // Form state
  const [formData, setFormData] = useState({
    client_id: invoice?.client_id || "",
    project_id: invoice?.project_id || "",
    client_name: invoice?.client_name || "",
    client_email: invoice?.client_email || "",
    client_phone: invoice?.client_phone || "",
    client_address: invoice?.client_address || "",
    invoice_type: invoice?.invoice_type || ("time_and_materials" as InvoiceType),
    issue_date: invoice?.issue_date || new Date().toISOString().split("T")[0],
    due_date: invoice?.due_date || (() => {
      const d = new Date();
      d.setDate(d.getDate() + 30);
      return d.toISOString().split("T")[0];
    })(),
    tax_rate: invoice?.tax_rate || 0,
    notes: invoice?.notes || "",
    terms: invoice?.terms || "Payment is due within 30 days of invoice date. Late payments may be subject to a 1.5% monthly finance charge.",
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
          notes: item.notes,
        }))
      : []
  );

  // Selected items from project
  const [selectedLabor, setSelectedLabor] = useState<boolean[]>([]);
  const [selectedMaterials, setSelectedMaterials] = useState<boolean[]>([]);
  const [selectedEquipment, setSelectedEquipment] = useState<boolean[]>([]);

  useEffect(() => {
    fetchReferenceData();
  }, []);

  const fetchReferenceData = async () => {
    try {
      const [clientsRes, projectsRes] = await Promise.all([
        supabase.from("clients").select("*").order("name"),
        supabase.from("projects").select("*").in("status", ["active", "completed"]).order("name"),
      ]);

      if (clientsRes.data) setClients(clientsRes.data);
      if (projectsRes.data) setProjects(projectsRes.data);
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

  const handleProjectSelect = async (project: Project) => {
    setSelectedProject(project);
    setLoadingCosts(true);

    try {
      // Fetch project costs
      const [timeRes, materialsRes, equipmentRes] = await Promise.all([
        supabase
          .from("time_entries")
          .select(`
            *,
            workers(first_name, last_name, hourly_rate, overtime_rate_multiplier)
          `)
          .eq("project_id", project.id),
        supabase
          .from("material_allocations")
          .select(`
            *,
            materials(name, unit, unit_cost)
          `)
          .eq("project_id", project.id),
        supabase
          .from("equipment_usage")
          .select(`
            *,
            equipment(name, daily_rate, hourly_rate)
          `)
          .eq("project_id", project.id),
      ]);

      // Process labor costs
      const laborCosts: ProjectCostData["laborCosts"] = [];
      const workerHours: Record<string, { name: string; regular: number; overtime: number; rate: number; otMultiplier: number }> = {};

      (timeRes.data || []).forEach((entry: any) => {
        const workerId = entry.worker_id;
        const worker = entry.workers;
        if (!worker) return;

        if (!workerHours[workerId]) {
          workerHours[workerId] = {
            name: `${worker.first_name} ${worker.last_name}`,
            regular: 0,
            overtime: 0,
            rate: worker.hourly_rate || 0,
            otMultiplier: worker.overtime_rate_multiplier || 1.5,
          };
        }
        workerHours[workerId].regular += entry.regular_hours || 0;
        workerHours[workerId].overtime += entry.overtime_hours || 0;
      });

      Object.values(workerHours).forEach((w) => {
        const regularAmount = w.regular * w.rate;
        const overtimeAmount = w.overtime * w.rate * w.otMultiplier;
        laborCosts.push({
          worker_name: w.name,
          hours: w.regular + w.overtime,
          rate: w.rate,
          amount: regularAmount + overtimeAmount,
        });
      });

      // Process material costs
      const materialCosts: ProjectCostData["materialCosts"] = [];
      (materialsRes.data || []).forEach((alloc: any) => {
        const material = alloc.materials;
        if (!material) return;
        materialCosts.push({
          material_name: material.name,
          quantity: alloc.quantity,
          unit: material.unit,
          unit_cost: material.unit_cost,
          amount: alloc.quantity * material.unit_cost,
        });
      });

      // Process equipment costs
      const equipmentCosts: ProjectCostData["equipmentCosts"] = [];
      (equipmentRes.data || []).forEach((usage: any) => {
        const equip = usage.equipment;
        if (!equip) return;
        const days = usage.hours_used ? usage.hours_used / 8 : 1;
        equipmentCosts.push({
          equipment_name: equip.name,
          days,
          rate: equip.daily_rate || equip.hourly_rate * 8,
          amount: usage.cost || 0,
        });
      });

      setProjectCosts({ laborCosts, materialCosts, equipmentCosts });
      setSelectedLabor(laborCosts.map(() => true));
      setSelectedMaterials(materialCosts.map(() => true));
      setSelectedEquipment(equipmentCosts.map(() => true));

      // Update form with project info
      setFormData({
        ...formData,
        project_id: project.id,
        client_name: project.client_name || "N/A",
        client_email: project.client_email || "",
        client_phone: project.client_phone || "",
      });
    } catch (error) {
      console.error("Error fetching project costs:", error);
      toast({
        title: "Error",
        description: "Failed to load project costs",
        variant: "destructive",
      });
    } finally {
      setLoadingCosts(false);
    }
  };

  const importFromProject = () => {
    if (!projectCosts) return;

    const newItems: LineItemFormData[] = [];

    // Add selected labor
    projectCosts.laborCosts.forEach((labor, i) => {
      if (selectedLabor[i]) {
        newItems.push({
          category: "labor",
          description: `Labor - ${labor.worker_name}`,
          quantity: labor.hours,
          unit: "hours",
          unit_rate: labor.rate,
          entry_mode: "detailed",
        });
      }
    });

    // Add selected materials
    projectCosts.materialCosts.forEach((mat, i) => {
      if (selectedMaterials[i]) {
        newItems.push({
          category: "material",
          description: mat.material_name,
          quantity: mat.quantity,
          unit: mat.unit,
          unit_rate: mat.unit_cost,
          entry_mode: "simple",
        });
      }
    });

    // Add selected equipment
    projectCosts.equipmentCosts.forEach((equip, i) => {
      if (selectedEquipment[i]) {
        newItems.push({
          category: "equipment",
          description: equip.equipment_name,
          quantity: equip.days,
          unit: "days",
          unit_rate: equip.rate,
          entry_mode: "simple",
        });
      }
    });

    if (newItems.length > 0) {
      setItems(newItems);
    }

    setShowProjectDialog(false);
    toast({
      title: "Items imported",
      description: `${newItems.length} items imported from project.`,
    });
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
  const taxAmount = subtotal * (formData.tax_rate / 100);
  const totalAmount = subtotal + taxAmount;

  const generateInvoiceNumber = () => {
    const prefix = "INV";
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
        throw new Error("You must be associated with a company to create invoices. Please contact your administrator to assign you to a company.");
      }

      if (!formData.client_name) {
        throw new Error("Client name is required");
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
        const { data: newInvoice, error: invoiceError } = await supabase
          .from("invoices")
          .insert({
            invoice_number: generateInvoiceNumber(),
            company_id: profile.company_id,
            client_id: formData.client_id || null,
            project_id: formData.project_id || null,
            client_name: formData.client_name,
            client_email: formData.client_email || null,
            client_phone: formData.client_phone || null,
            client_address: formData.client_address || null,
            invoice_type: formData.invoice_type,
            issue_date: formData.issue_date,
            due_date: formData.due_date,
            tax_rate: formData.tax_rate,
            notes: formData.notes || null,
            terms: formData.terms || null,
            template_id: templateId || null,
            status: "draft",
            created_by: profile?.id,
          })
          .select()
          .single();

        if (invoiceError) throw invoiceError;

        const lineItemsToInsert = items.map((item, index) => {
          const amount = item.entry_mode === "lump_sum"
            ? (item.manual_amount || 0)
            : ((item.quantity || 0) * (item.unit_rate || 0));

          return {
            invoice_id: newInvoice.id,
            category: item.category,
            description: item.description,
            quantity: item.entry_mode === "lump_sum" ? null : item.quantity,
            unit: item.entry_mode === "lump_sum" ? null : (item.unit || null),
            unit_rate: item.entry_mode === "lump_sum" ? null : item.unit_rate,
            entry_mode: item.entry_mode,
            manual_amount: item.entry_mode === "lump_sum" ? item.manual_amount : null,
            amount: amount,
            notes: item.notes || null,
            order_index: index,
          };
        });

        const { error: itemsError } = await supabase
          .from("invoice_line_items")
          .insert(lineItemsToInsert);

        if (itemsError) throw itemsError;

        toast({
          title: "Invoice created",
          description: `Invoice ${newInvoice.invoice_number} has been created.`,
        });

        router.push(`/invoices/${newInvoice.id}`);
      } else {
        const { error: invoiceError } = await supabase
          .from("invoices")
          .update({
            client_id: formData.client_id || null,
            project_id: formData.project_id || null,
            client_name: formData.client_name,
            client_email: formData.client_email || null,
            client_phone: formData.client_phone || null,
            client_address: formData.client_address || null,
            invoice_type: formData.invoice_type,
            issue_date: formData.issue_date,
            due_date: formData.due_date,
            tax_rate: formData.tax_rate,
            notes: formData.notes || null,
            terms: formData.terms || null,
            template_id: templateId || null,
          })
          .eq("id", invoice!.id);

        if (invoiceError) throw invoiceError;

        await supabase.from("invoice_line_items").delete().eq("invoice_id", invoice!.id);

        const lineItemsToInsert = items.map((item, index) => {
          const amount = item.entry_mode === "lump_sum"
            ? (item.manual_amount || 0)
            : ((item.quantity || 0) * (item.unit_rate || 0));

          return {
            invoice_id: invoice!.id,
            category: item.category,
            description: item.description,
            quantity: item.entry_mode === "lump_sum" ? null : item.quantity,
            unit: item.entry_mode === "lump_sum" ? null : (item.unit || null),
            unit_rate: item.entry_mode === "lump_sum" ? null : item.unit_rate,
            entry_mode: item.entry_mode,
            manual_amount: item.entry_mode === "lump_sum" ? item.manual_amount : null,
            amount: amount,
            notes: item.notes || null,
            order_index: index,
          };
        });

        const { error: itemsError } = await supabase
          .from("invoice_line_items")
          .insert(lineItemsToInsert);

        if (itemsError) throw itemsError;

        toast({
          title: "Invoice updated",
          description: "Your changes have been saved.",
        });

        router.push(`/invoices/${invoice!.id}`);
      }
    } catch (error: any) {
      console.error("Error saving invoice:", error);
      
      // Provide helpful error messages for common issues
      let errorMessage = error.message || "Failed to save invoice";
      
      if (error.code === "42501" || error.message?.includes("row-level security")) {
        if (!profile?.company_id) {
          errorMessage = "You must be associated with a company to create invoices. Please contact your administrator to assign you to a company.";
        } else {
          errorMessage = "Permission denied. Please ensure you're associated with a company and try again. If this persists, contact your administrator.";
        }
      }
      
      toast({
        title: "Error saving invoice",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const categoryOptions: { value: InvoiceLineCategory; label: string }[] = [
    { value: "labor", label: "Labor" },
    { value: "material", label: "Material" },
    { value: "equipment", label: "Equipment" },
    { value: "overhead", label: "Overhead" },
    { value: "other", label: "Other" },
  ];

  const invoiceTypeOptions: { value: InvoiceType; label: string }[] = [
    { value: "time_and_materials", label: "Time & Materials" },
    { value: "fixed_price", label: "Fixed Price" },
    { value: "progress", label: "Progress Billing" },
    { value: "final", label: "Final Invoice" },
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Import from Project */}
      {mode === "create" && (
        <Card className="border-dashed">
          <CardContent className="py-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">Generate from Project</h3>
                <p className="text-sm text-muted-foreground">
                  Import time entries, materials, and equipment from an existing project
                </p>
              </div>
              <Dialog open={showProjectDialog} onOpenChange={setShowProjectDialog}>
                <DialogTrigger asChild>
                  <Button type="button" variant="outline">
                    <FolderKanban className="h-4 w-4 mr-2" />
                    Select Project
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Import from Project</DialogTitle>
                    <DialogDescription>
                      Select a project and choose which costs to include
                    </DialogDescription>
                  </DialogHeader>

                  {!selectedProject ? (
                    <div className="grid gap-2 py-4">
                      {projects.map((project) => (
                        <Button
                          key={project.id}
                          type="button"
                          variant="outline"
                          className="justify-start h-auto py-3"
                          onClick={() => handleProjectSelect(project)}
                        >
                          <div className="text-left">
                            <div className="font-medium">{project.name}</div>
                            <div className="text-sm text-muted-foreground">
                              {project.client_name} - {project.location}
                            </div>
                          </div>
                        </Button>
                      ))}
                    </div>
                  ) : loadingCosts ? (
                    <div className="py-8 text-center">
                      <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
                      <p>Loading project costs...</p>
                    </div>
                  ) : projectCosts ? (
                    <div className="space-y-6 py-4">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{selectedProject.name}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedProject(null);
                            setProjectCosts(null);
                          }}
                        >
                          Change Project
                        </Button>
                      </div>

                      {/* Labor */}
                      {projectCosts.laborCosts.length > 0 && (
                        <div>
                          <h4 className="font-medium mb-2">Labor</h4>
                          <div className="space-y-2">
                            {projectCosts.laborCosts.map((labor, i) => (
                              <div key={i} className="flex items-center gap-3 p-2 border rounded">
                                <Checkbox
                                  checked={selectedLabor[i]}
                                  onCheckedChange={(checked) => {
                                    const newSelected = [...selectedLabor];
                                    newSelected[i] = checked as boolean;
                                    setSelectedLabor(newSelected);
                                  }}
                                />
                                <div className="flex-1">
                                  <div className="font-medium">{labor.worker_name}</div>
                                  <div className="text-sm text-muted-foreground">
                                    {labor.hours} hrs @ {formatCurrency(labor.rate)}/hr
                                  </div>
                                </div>
                                <div className="font-medium">{formatCurrency(labor.amount)}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Materials */}
                      {projectCosts.materialCosts.length > 0 && (
                        <div>
                          <h4 className="font-medium mb-2">Materials</h4>
                          <div className="space-y-2">
                            {projectCosts.materialCosts.map((mat, i) => (
                              <div key={i} className="flex items-center gap-3 p-2 border rounded">
                                <Checkbox
                                  checked={selectedMaterials[i]}
                                  onCheckedChange={(checked) => {
                                    const newSelected = [...selectedMaterials];
                                    newSelected[i] = checked as boolean;
                                    setSelectedMaterials(newSelected);
                                  }}
                                />
                                <div className="flex-1">
                                  <div className="font-medium">{mat.material_name}</div>
                                  <div className="text-sm text-muted-foreground">
                                    {mat.quantity} {mat.unit} @ {formatCurrency(mat.unit_cost)}/{mat.unit}
                                  </div>
                                </div>
                                <div className="font-medium">{formatCurrency(mat.amount)}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Equipment */}
                      {projectCosts.equipmentCosts.length > 0 && (
                        <div>
                          <h4 className="font-medium mb-2">Equipment</h4>
                          <div className="space-y-2">
                            {projectCosts.equipmentCosts.map((equip, i) => (
                              <div key={i} className="flex items-center gap-3 p-2 border rounded">
                                <Checkbox
                                  checked={selectedEquipment[i]}
                                  onCheckedChange={(checked) => {
                                    const newSelected = [...selectedEquipment];
                                    newSelected[i] = checked as boolean;
                                    setSelectedEquipment(newSelected);
                                  }}
                                />
                                <div className="flex-1">
                                  <div className="font-medium">{equip.equipment_name}</div>
                                  <div className="text-sm text-muted-foreground">
                                    {equip.days.toFixed(1)} days @ {formatCurrency(equip.rate)}/day
                                  </div>
                                </div>
                                <div className="font-medium">{formatCurrency(equip.amount)}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : null}

                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setShowProjectDialog(false)}>
                      Cancel
                    </Button>
                    {projectCosts && (
                      <Button type="button" onClick={importFromProject}>
                        Import Selected Items
                      </Button>
                    )}
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>
      )}

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
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="client_phone">Phone</Label>
                <Input
                  id="client_phone"
                  value={formData.client_phone}
                  onChange={(e) => setFormData({ ...formData, client_phone: e.target.value })}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Invoice Details */}
        <Card>
          <CardHeader>
            <CardTitle>Invoice Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Invoice Type</Label>
              <Select
                value={formData.invoice_type}
                onValueChange={(value) => setFormData({ ...formData, invoice_type: value as InvoiceType })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {invoiceTypeOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
                <Label htmlFor="due_date">Due Date *</Label>
                <DatePicker
                  id="due_date"
                  value={formData.due_date}
                  onChange={(value) => setFormData({ ...formData, due_date: value })}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tax_rate">Tax Rate (%)</Label>
              <Input
                id="tax_rate"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={formData.tax_rate}
                onChange={(e) => setFormData({ ...formData, tax_rate: parseFloat(e.target.value) || 0 })}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Template Selection */}
      <Separator />
      <TemplateSelector
        type="invoice"
        selectedTemplateId={templateId}
        onTemplateChange={(id, template) => {
          setTemplateId(id);
          setSelectedTemplate(template);
        }}
      />

      {/* Line Items */}
      {!showLineItemForm ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Line Items</CardTitle>
                <CardDescription>Add billable items</CardDescription>
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
          type="invoice"
          onSave={handleSaveLineItem}
          onCancel={handleCancelLineItem}
          initialData={editingItemIndex !== null ? items[editingItemIndex] : undefined}
          quickMode={quickMode}
          quickCategory={quickCategory}
        />
      )}

      {/* Summary */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Notes & Terms</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <AIDescriptionField
              id="notes"
              label="Notes"
              value={formData.notes}
              onChange={(value) => setFormData({ ...formData, notes: value })}
              placeholder="Additional notes for the client..."
              rows={2}
              contentType="invoice_description"
              context={{
                client_name: formData.client_name,
                project_name: selectedProject?.name,
                invoice_type: formData.invoice_type,
                line_items: items.map((item) => ({
                  category: item.category,
                  description: item.description,
                  quantity: item.quantity,
                  unit: item.unit,
                })),
              }}
            />
            <div className="space-y-2">
              <Label htmlFor="terms">Terms</Label>
              <Textarea
                id="terms"
                value={formData.terms}
                onChange={(e) => setFormData({ ...formData, terms: e.target.value })}
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Invoice Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
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

      {/* Submit */}
      <div className="flex items-center justify-end gap-4">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {mode === "create" ? "Create Invoice" : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}
