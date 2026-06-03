"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import type { Material, Project, Vendor } from "@/types";

const CATEGORIES = [
  "all","lumber","concrete","steel","electrical","plumbing",
  "roofing","finishing","hardware","tools","safety","other",
];

export default function MaterialsPage() {
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [allocateDialogOpen, setAllocateDialogOpen] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const supabase = createClient();

  const [materialForm, setMaterialForm] = useState({
    name: "", description: "", category: "other" as Material["category"],
    unit: "", unit_cost: 0, quantity_in_stock: 0,
    minimum_stock_level: 0, sku: "", supplier_id: "",
  });

  const [allocationForm, setAllocationForm] = useState({ project_id: "", quantity: 0, notes: "" });

  useEffect(() => {
    if (authLoading) return;
    if (profile && !profile.company_id) { setLoading(false); return; }
    if (profile?.company_id) fetchData();
    else if (profile === null) setLoading(false);
  }, [categoryFilter, profile?.company_id, profile, authLoading]);

  const fetchData = async () => {
    if (!profile?.company_id) return;
    setLoading(true);
    try {
      let query = supabase.from("materials").select("*").eq("company_id", profile.company_id).order("name");
      if (categoryFilter !== "all") query = query.eq("category", categoryFilter);
      const [{ data: matsData }, { data: projData }, { data: vendData }] = await Promise.all([
        query,
        supabase.from("projects").select("*").eq("company_id", profile.company_id).in("status", ["active", "planning"]).order("name"),
        supabase.from("vendors").select("*").eq("company_id", profile.company_id).eq("status", "active").order("name"),
      ]);
      setMaterials(matsData || []);
      setProjects(projData || []);
      setVendors(vendData || []);
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
      const { error } = await supabase.from("materials").insert({ ...materialForm, supplier_id: materialForm.supplier_id || null });
      if (error) throw error;
      toast({ title: "Material added" });
      setAddDialogOpen(false);
      setMaterialForm({ name: "", description: "", category: "other", unit: "", unit_cost: 0, quantity_in_stock: 0, minimum_stock_level: 0, sku: "", supplier_id: "" });
      fetchData();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
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
      toast({ title: "Allocated", description: `${allocationForm.quantity} ${selectedMaterial.unit} sent to project.` });
      setAllocateDialogOpen(false);
      setAllocationForm({ project_id: "", quantity: 0, notes: "" });
      setSelectedMaterial(null);
      fetchData();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this material?")) return;
    const { error } = await supabase.from("materials").delete().eq("id", id);
    if (error) { toast({ title: "Error", variant: "destructive" }); return; }
    setMaterials(materials.filter(m => m.id !== id));
    toast({ title: "Deleted" });
  };

  const filtered = materials.filter(m =>
    m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (m.sku?.toLowerCase() || "").includes(searchTerm.toLowerCase())
  );
  const lowStock = materials.filter(m => m.quantity_in_stock <= m.minimum_stock_level);
  const totalValue = materials.reduce((s, m) => s + m.quantity_in_stock * m.unit_cost, 0);

  return (
    <div className="flex flex-col h-full overflow-auto bg-[#18191b]">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#34373c] flex-shrink-0">
        <div>
          <p className="text-[11px] font-mono text-[#666] uppercase tracking-widest">Materials</p>
          <h1 className="text-[16px] font-semibold text-[#d0d0d0] mt-0.5">Inventory</h1>
        </div>
        <button
          onClick={() => setAddDialogOpen(true)}
          className="text-[12px] font-medium text-[#F5A623] hover:opacity-80 transition-opacity"
        >
          + Add Material
        </button>
      </div>

      <div className="flex-1 p-6 space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {loading
            ? Array(3).fill(0).map((_, i) => <div key={i} className="h-[72px] rounded border border-[#34373c] bg-[#202224] animate-pulse" />)
            : [
                { label: "Total Items",     value: materials.length.toString() },
                { label: "Inventory Value", value: formatCurrency(totalValue), accent: true },
                { label: "Low Stock",       value: lowStock.length.toString(), warn: lowStock.length > 0 },
              ].map(s => (
                <div key={s.label} className="rounded border border-[#34373c] bg-[#202224] px-4 py-3.5">
                  <p className="text-[11px] font-mono text-[#666] uppercase tracking-wider">{s.label}</p>
                  <p className={cn("text-[22px] font-semibold font-mono mt-1 leading-none",
                    s.accent ? "text-[#F5A623]" : s.warn ? "text-[#EF4444]" : "text-[#d0d0d0]"
                  )}>
                    {s.value}
                  </p>
                </div>
              ))
          }
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search materials..."
            className="flex-1 min-w-[200px] bg-[#202224] border border-[#34373c] rounded px-3 py-2 text-[13px] text-[#aaa] placeholder:text-[#444] outline-none focus:border-[#333] transition-colors"
          />
          <div className="flex items-center gap-1 flex-wrap">
            {CATEGORIES.slice(0, 7).map(c => (
              <button
                key={c}
                onClick={() => setCategoryFilter(c)}
                className={cn("px-2.5 py-1.5 rounded text-[10px] font-mono uppercase tracking-wide transition-colors",
                  categoryFilter === c ? "bg-[#2d3035] text-[#F5A623] border border-[#333]" : "text-[#555] hover:text-[#999]"
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="rounded border border-[#34373c] bg-[#202224] overflow-hidden">
          {loading ? (
            <div className="divide-y divide-[#292c31]">
              {Array(6).fill(0).map((_, i) => <div key={i} className="h-[52px] animate-pulse" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-[13px] text-[#555]">{searchTerm || categoryFilter !== "all" ? "No materials match" : "No materials yet"}</p>
              <button onClick={() => setAddDialogOpen(true)} className="inline-block mt-3 text-[12px] text-[#F5A623] hover:opacity-80">
                Add your first material →
              </button>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#2d3035]">
                  <th className="px-5 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest text-[#555]">Name</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest text-[#555]">Category</th>
                  <th className="px-5 py-2.5 text-right text-[10px] font-mono uppercase tracking-widest text-[#555]">Unit Cost</th>
                  <th className="px-5 py-2.5 text-right text-[10px] font-mono uppercase tracking-widest text-[#555]">In Stock</th>
                  <th className="px-5 py-2.5 text-right text-[10px] font-mono uppercase tracking-widest text-[#555]">Value</th>
                  <th className="w-44 px-5 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#292c31]">
                {filtered.map(mat => {
                  const isLow = mat.quantity_in_stock <= mat.minimum_stock_level;
                  return (
                    <tr key={mat.id} className="group hover:bg-[#23252a] transition-colors">
                      <td className="px-5 py-3">
                        <p className="text-[13px] text-[#aaa] group-hover:text-[#c4c4c4] transition-colors">{mat.name}</p>
                        {mat.sku && <p className="text-[10px] font-mono text-[#444] mt-0.5">{mat.sku}</p>}
                      </td>
                      <td className="px-5 py-3 text-[11px] font-mono text-[#555] capitalize">{mat.category}</td>
                      <td className="px-5 py-3 text-right text-[12px] font-mono text-[#aaa]">
                        {formatCurrency(mat.unit_cost)}/{mat.unit}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span className={cn("text-[12px] font-mono", isLow ? "text-[#EF4444]" : "text-[#666]")}>
                          {mat.quantity_in_stock} {mat.unit}
                          {isLow && <span className="text-[#EF4444] ml-1">⚠</span>}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right text-[12px] font-mono text-[#666]">
                        {formatCurrency(mat.quantity_in_stock * mat.unit_cost)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => { setSelectedMaterial(mat); setAllocateDialogOpen(true); }}
                            className="text-[11px] text-[#3B82F6] hover:opacity-80 transition-opacity"
                          >
                            Allocate
                          </button>
                          <button
                            onClick={() => router.push(`/materials/${mat.id}`)}
                            className="text-[11px] text-[#666] hover:text-[#aaa] transition-colors"
                          >
                            View
                          </button>
                          <button
                            onClick={() => handleDelete(mat.id)}
                            className="text-[11px] text-[#666] hover:text-[#EF4444] transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Add Material Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-md bg-[#202224] border-[#34373c] text-[#d0d0d0]">
          <DialogHeader>
            <DialogTitle className="text-[#d0d0d0] text-[15px]">Add Material</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddMaterial}>
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <p className="text-[10px] font-mono text-[#555] uppercase tracking-widest">Name *</p>
                <input
                  className="w-full h-8 px-2.5 rounded bg-[#292c31] border border-[#3a3d42] text-[13px] text-[#aaa] placeholder:text-[#444] outline-none focus:border-[#333] transition-colors"
                  placeholder="e.g. Ondura Roofing Sheet"
                  value={materialForm.name}
                  onChange={e => setMaterialForm(f => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <p className="text-[10px] font-mono text-[#555] uppercase tracking-widest">Category *</p>
                  <Select value={materialForm.category} onValueChange={v => setMaterialForm(f => ({ ...f, category: v as Material["category"] }))}>
                    <SelectTrigger className="h-8 bg-[#292c31] border-[#3a3d42] text-[#aaa] text-[13px] focus:ring-0 focus:border-[#333]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#202224] border-[#3a3d42]">
                      {CATEGORIES.slice(1).map(c => (
                        <SelectItem key={c} value={c} className="text-[#aaa] focus:bg-[#292c31] focus:text-[#d0d0d0] capitalize">{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-mono text-[#555] uppercase tracking-widest">Unit *</p>
                  <input
                    className="w-full h-8 px-2.5 rounded bg-[#292c31] border border-[#3a3d42] text-[13px] text-[#aaa] placeholder:text-[#444] outline-none focus:border-[#333] transition-colors"
                    placeholder="sheet, bag, roll..."
                    value={materialForm.unit}
                    onChange={e => setMaterialForm(f => ({ ...f, unit: e.target.value }))}
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <p className="text-[10px] font-mono text-[#555] uppercase tracking-widest">Unit Cost (BSD) *</p>
                  <input type="number" step="0.01" min="0"
                    className="w-full h-8 px-2.5 rounded bg-[#292c31] border border-[#3a3d42] text-[13px] text-[#aaa] outline-none focus:border-[#333] transition-colors"
                    value={materialForm.unit_cost}
                    onChange={e => setMaterialForm(f => ({ ...f, unit_cost: parseFloat(e.target.value) || 0 }))}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-mono text-[#555] uppercase tracking-widest">Initial Qty</p>
                  <input type="number" min="0"
                    className="w-full h-8 px-2.5 rounded bg-[#292c31] border border-[#3a3d42] text-[13px] text-[#aaa] outline-none focus:border-[#333] transition-colors"
                    value={materialForm.quantity_in_stock}
                    onChange={e => setMaterialForm(f => ({ ...f, quantity_in_stock: parseFloat(e.target.value) || 0 }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <p className="text-[10px] font-mono text-[#555] uppercase tracking-widest">Min Stock</p>
                  <input type="number" min="0"
                    className="w-full h-8 px-2.5 rounded bg-[#292c31] border border-[#3a3d42] text-[13px] text-[#aaa] outline-none focus:border-[#333] transition-colors"
                    value={materialForm.minimum_stock_level}
                    onChange={e => setMaterialForm(f => ({ ...f, minimum_stock_level: parseFloat(e.target.value) || 0 }))}
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-mono text-[#555] uppercase tracking-widest">SKU</p>
                  <input
                    className="w-full h-8 px-2.5 rounded bg-[#292c31] border border-[#3a3d42] text-[13px] text-[#aaa] placeholder:text-[#444] outline-none focus:border-[#333] transition-colors"
                    placeholder="SKU-001"
                    value={materialForm.sku}
                    onChange={e => setMaterialForm(f => ({ ...f, sku: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-mono text-[#555] uppercase tracking-widest">Supplier</p>
                <Select value={materialForm.supplier_id} onValueChange={v => setMaterialForm(f => ({ ...f, supplier_id: v }))}>
                  <SelectTrigger className="h-8 bg-[#292c31] border-[#3a3d42] text-[#aaa] text-[13px] focus:ring-0 focus:border-[#333]">
                    <SelectValue placeholder="Select supplier..." />
                  </SelectTrigger>
                  <SelectContent className="bg-[#202224] border-[#3a3d42]">
                    {vendors.map(v => (
                      <SelectItem key={v.id} value={v.id} className="text-[#aaa] focus:bg-[#292c31] focus:text-[#d0d0d0]">{v.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <button type="button" onClick={() => setAddDialogOpen(false)} className="px-4 py-2 text-[12px] text-[#555] hover:text-[#aaa] transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={submitting}
                className="flex items-center gap-1.5 px-4 py-2 rounded bg-[#2d3035] border border-[#333] text-[12px] text-[#F5A623] hover:bg-[#353840] transition-colors disabled:opacity-40"
              >
                {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Add Material
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Allocate Dialog */}
      <Dialog open={allocateDialogOpen} onOpenChange={setAllocateDialogOpen}>
        <DialogContent className="max-w-sm bg-[#202224] border-[#34373c] text-[#d0d0d0]">
          <DialogHeader>
            <DialogTitle className="text-[#d0d0d0] text-[15px]">Allocate to Project</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAllocate}>
            <div className="space-y-3 py-2">
              {selectedMaterial && (
                <div className="px-3 py-2.5 rounded border border-[#2d3035] bg-[#18191b]">
                  <p className="text-[13px] text-[#aaa]">{selectedMaterial.name}</p>
                  <p className="text-[11px] font-mono text-[#555] mt-0.5">
                    {selectedMaterial.quantity_in_stock} {selectedMaterial.unit} available · {formatCurrency(selectedMaterial.unit_cost)}/{selectedMaterial.unit}
                  </p>
                </div>
              )}
              <div className="space-y-1">
                <p className="text-[10px] font-mono text-[#555] uppercase tracking-widest">Project *</p>
                <Select value={allocationForm.project_id} onValueChange={v => setAllocationForm(f => ({ ...f, project_id: v }))}>
                  <SelectTrigger className="h-8 bg-[#292c31] border-[#3a3d42] text-[#aaa] text-[13px] focus:ring-0 focus:border-[#333]">
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#202224] border-[#3a3d42]">
                    {projects.map(p => (
                      <SelectItem key={p.id} value={p.id} className="text-[#aaa] focus:bg-[#292c31] focus:text-[#d0d0d0]">{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-mono text-[#555] uppercase tracking-widest">Quantity ({selectedMaterial?.unit}) *</p>
                <input type="number" min="0" max={selectedMaterial?.quantity_in_stock}
                  className="w-full h-8 px-2.5 rounded bg-[#292c31] border border-[#3a3d42] text-[13px] text-[#aaa] outline-none focus:border-[#333] transition-colors"
                  value={allocationForm.quantity}
                  onChange={e => setAllocationForm(f => ({ ...f, quantity: parseFloat(e.target.value) || 0 }))}
                  required
                />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-mono text-[#555] uppercase tracking-widest">Notes</p>
                <input
                  className="w-full h-8 px-2.5 rounded bg-[#292c31] border border-[#3a3d42] text-[13px] text-[#aaa] placeholder:text-[#444] outline-none focus:border-[#333] transition-colors"
                  placeholder="Optional notes..."
                  value={allocationForm.notes}
                  onChange={e => setAllocationForm(f => ({ ...f, notes: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <button type="button" onClick={() => setAllocateDialogOpen(false)} className="px-4 py-2 text-[12px] text-[#555] hover:text-[#aaa] transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={submitting || !allocationForm.project_id || allocationForm.quantity <= 0}
                className="flex items-center gap-1.5 px-4 py-2 rounded bg-[#2d3035] border border-[#333] text-[12px] text-[#3B82F6] hover:bg-[#353840] transition-colors disabled:opacity-40"
              >
                {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Allocate
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
