"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import {
  Plus,
  Search,
  Package,
  AlertTriangle,
  MoreHorizontal,
  Pencil,
  Trash2,
  ArrowDownToLine,
  Loader2,
  Filter,
} from "lucide-react";
import type { Material, Project, Vendor } from "@/types";

export default function MaterialsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [allocateDialogOpen, setAllocateDialogOpen] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const supabase = createClient();

  // Form state for new material
  const [materialForm, setMaterialForm] = useState({
    name: "",
    description: "",
    category: "other" as Material["category"],
    unit: "",
    unit_cost: 0,
    quantity_in_stock: 0,
    minimum_stock_level: 0,
    sku: "",
    supplier_id: "",
  });

  // Form state for allocation
  const [allocationForm, setAllocationForm] = useState({
    project_id: "",
    quantity: 0,
    notes: "",
  });

  useEffect(() => {
    fetchData();
  }, [categoryFilter]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch materials
      let query = supabase
        .from("materials")
        .select("*")
        .order("name");

      if (categoryFilter !== "all") {
        query = query.eq("category", categoryFilter);
      }

      const { data: materialsData } = await query;
      setMaterials(materialsData || []);

      // Fetch projects
      const { data: projectsData } = await supabase
        .from("projects")
        .select("*")
        .in("status", ["active", "planning"]);
      setProjects(projectsData || []);

      // Fetch vendors
      const { data: vendorsData } = await supabase
        .from("vendors")
        .select("*")
        .eq("status", "active");
      setVendors(vendorsData || []);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { error } = await supabase.from("materials").insert({
        ...materialForm,
        supplier_id: materialForm.supplier_id || null,
      });

      if (error) throw error;

      toast({
        title: "Material added",
        description: "The material has been added to inventory.",
        variant: "success",
      });

      setAddDialogOpen(false);
      setMaterialForm({
        name: "",
        description: "",
        category: "other",
        unit: "",
        unit_cost: 0,
        quantity_in_stock: 0,
        minimum_stock_level: 0,
        sku: "",
        supplier_id: "",
      });
      fetchData();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "An error occurred";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAllocate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedMaterial) return;

    setSubmitting(true);
    try {
      const { error } = await supabase.from("material_allocations").insert({
        material_id: selectedMaterial.id,
        project_id: allocationForm.project_id,
        quantity: allocationForm.quantity,
        notes: allocationForm.notes || null,
        allocated_by: user.id,
      });

      if (error) throw error;

      toast({
        title: "Material allocated",
        description: `${allocationForm.quantity} ${selectedMaterial.unit} allocated to project.`,
        variant: "success",
      });

      setAllocateDialogOpen(false);
      setAllocationForm({ project_id: "", quantity: 0, notes: "" });
      setSelectedMaterial(null);
      fetchData();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "An error occurred";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this material?")) return;

    try {
      const { error } = await supabase.from("materials").delete().eq("id", id);
      if (error) throw error;
      setMaterials(materials.filter((m) => m.id !== id));
      toast({ title: "Material deleted" });
    } catch (error) {
      console.error("Error deleting material:", error);
    }
  };

  const filteredMaterials = materials.filter(
    (material) =>
      material.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (material.sku?.toLowerCase() || "").includes(searchTerm.toLowerCase())
  );

  const lowStockMaterials = materials.filter(
    (m) => m.quantity_in_stock <= m.minimum_stock_level
  );

  const totalInventoryValue = materials.reduce(
    (sum, m) => sum + m.quantity_in_stock * m.unit_cost,
    0
  );

  const categories = [
    { value: "all", label: "All Categories" },
    { value: "lumber", label: "Lumber" },
    { value: "concrete", label: "Concrete" },
    { value: "steel", label: "Steel" },
    { value: "electrical", label: "Electrical" },
    { value: "plumbing", label: "Plumbing" },
    { value: "roofing", label: "Roofing" },
    { value: "finishing", label: "Finishing" },
    { value: "hardware", label: "Hardware" },
    { value: "tools", label: "Tools" },
    { value: "safety", label: "Safety" },
    { value: "other", label: "Other" },
  ];

  return (
    <div className="flex flex-col min-h-screen">
      <Header title="Materials" description="Manage inventory and allocations">
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Material
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add New Material</DialogTitle>
              <DialogDescription>
                Add a new item to your inventory
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAddMaterial}>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Material Name *</Label>
                  <Input
                    id="name"
                    placeholder="e.g., 2x4 Lumber (8ft)"
                    value={materialForm.name}
                    onChange={(e) =>
                      setMaterialForm({ ...materialForm, name: e.target.value })
                    }
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="category">Category *</Label>
                    <Select
                      value={materialForm.category}
                      onValueChange={(value) =>
                        setMaterialForm({ ...materialForm, category: value as Material["category"] })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.slice(1).map((cat) => (
                          <SelectItem key={cat.value} value={cat.value}>
                            {cat.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="unit">Unit *</Label>
                    <Input
                      id="unit"
                      placeholder="e.g., piece, bag, roll"
                      value={materialForm.unit}
                      onChange={(e) =>
                        setMaterialForm({ ...materialForm, unit: e.target.value })
                      }
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="unit_cost">Unit Cost (BSD) *</Label>
                    <Input
                      id="unit_cost"
                      type="number"
                      step="0.01"
                      min="0"
                      value={materialForm.unit_cost}
                      onChange={(e) =>
                        setMaterialForm({ ...materialForm, unit_cost: parseFloat(e.target.value) || 0 })
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="quantity">Initial Qty</Label>
                    <Input
                      id="quantity"
                      type="number"
                      min="0"
                      value={materialForm.quantity_in_stock}
                      onChange={(e) =>
                        setMaterialForm({ ...materialForm, quantity_in_stock: parseFloat(e.target.value) || 0 })
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="min_stock">Min Stock Level</Label>
                    <Input
                      id="min_stock"
                      type="number"
                      min="0"
                      value={materialForm.minimum_stock_level}
                      onChange={(e) =>
                        setMaterialForm({ ...materialForm, minimum_stock_level: parseFloat(e.target.value) || 0 })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sku">SKU</Label>
                    <Input
                      id="sku"
                      placeholder="SKU-001"
                      value={materialForm.sku}
                      onChange={(e) =>
                        setMaterialForm({ ...materialForm, sku: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="supplier">Supplier</Label>
                  <Select
                    value={materialForm.supplier_id}
                    onValueChange={(value) =>
                      setMaterialForm({ ...materialForm, supplier_id: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select supplier" />
                    </SelectTrigger>
                    <SelectContent>
                      {vendors.map((vendor) => (
                        <SelectItem key={vendor.id} value={vendor.id}>
                          {vendor.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setAddDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Add Material
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </Header>

      <div className="flex-1 p-6 space-y-6">
        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="p-2 rounded-lg bg-blue-100">
                  <Package className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Items</p>
                  <p className="text-2xl font-bold">{materials.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="p-2 rounded-lg bg-green-100">
                  <Package className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Inventory Value</p>
                  <p className="text-2xl font-bold">{formatCurrency(totalInventoryValue)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="p-2 rounded-lg bg-orange-100">
                  <AlertTriangle className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Low Stock Items</p>
                  <p className="text-2xl font-bold">{lowStockMaterials.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="py-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search materials..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Materials Table */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 text-center">
                <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
              </div>
            ) : filteredMaterials.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Material</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Unit Cost</TableHead>
                    <TableHead>In Stock</TableHead>
                    <TableHead>Min Level</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMaterials.map((material) => {
                    const isLowStock = material.quantity_in_stock <= material.minimum_stock_level;
                    return (
                      <TableRow key={material.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{material.name}</p>
                            {material.sku && (
                              <p className="text-xs text-muted-foreground">{material.sku}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="capitalize">
                            {material.category}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatCurrency(material.unit_cost)}/{material.unit}</TableCell>
                        <TableCell>
                          <span className={isLowStock ? "text-destructive font-medium" : ""}>
                            {material.quantity_in_stock} {material.unit}
                          </span>
                          {isLowStock && (
                            <AlertTriangle className="inline h-4 w-4 ml-1 text-orange-500" />
                          )}
                        </TableCell>
                        <TableCell>{material.minimum_stock_level} {material.unit}</TableCell>
                        <TableCell>
                          {formatCurrency(material.quantity_in_stock * material.unit_cost)}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedMaterial(material);
                                  setAllocateDialogOpen(true);
                                }}
                              >
                                <ArrowDownToLine className="h-4 w-4 mr-2" />
                                Allocate to Project
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <Pencil className="h-4 w-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => handleDelete(material.id)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <div className="p-12 text-center">
                <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No materials found</h3>
                <p className="text-muted-foreground mb-4">
                  Add your first material to get started
                </p>
                <Button onClick={() => setAddDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Material
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Allocate Dialog */}
      <Dialog open={allocateDialogOpen} onOpenChange={setAllocateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Allocate Material</DialogTitle>
            <DialogDescription>
              {selectedMaterial && `Allocate ${selectedMaterial.name} to a project`}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAllocate}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Project *</Label>
                <Select
                  value={allocationForm.project_id}
                  onValueChange={(value) =>
                    setAllocationForm({ ...allocationForm, project_id: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Quantity ({selectedMaterial?.unit}) *</Label>
                <Input
                  type="number"
                  min="0"
                  max={selectedMaterial?.quantity_in_stock}
                  value={allocationForm.quantity}
                  onChange={(e) =>
                    setAllocationForm({ ...allocationForm, quantity: parseFloat(e.target.value) || 0 })
                  }
                  required
                />
                {selectedMaterial && (
                  <p className="text-xs text-muted-foreground">
                    Available: {selectedMaterial.quantity_in_stock} {selectedMaterial.unit}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Input
                  placeholder="Optional notes..."
                  value={allocationForm.notes}
                  onChange={(e) =>
                    setAllocationForm({ ...allocationForm, notes: e.target.value })
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAllocateDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting || !allocationForm.project_id || allocationForm.quantity <= 0}
              >
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Allocate
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
