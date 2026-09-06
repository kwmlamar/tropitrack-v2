"use client";
import { APP_NAME } from "@/lib/brand";

import { useEffect, useState, useMemo } from "react";
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
import { Loader2, Search, Trash2, Edit3, Plus, FileDown, Layers, Info } from "lucide-react";

interface DbMaterial {
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

const DIVISIONS = [
  { code: "03", name: "Concrete" },
  { code: "04", name: "Masonry" },
  { code: "06", name: "Wood & Plastics" },
  { code: "07", name: "Thermal & Moisture" },
  { code: "08", name: "Openings" },
  { code: "09", name: "Finishes" },
  { code: "22", name: "Plumbing" },
  { code: "23", name: "HVAC" },
  { code: "26", name: "Electrical" },
  { code: "31", name: "Earthwork" },
  { code: "32", name: "Exterior Improvements" },
];

const DIV_COLORS: Record<string, string> = {
  "03": "#78716C",
  "04": "#B45309",
  "06": "#15803D",
  "07": "#1D4ED8",
  "08": "#7C3AED",
  "09": "#BE185D",
  "22": "#0E7490",
  "23": "#92400E",
  "26": "#D97706",
  "31": "#4B5563",
  "32": "#047857",
};

const COMMON_UNITS = [
  "EA",
  "LF",
  "SF",
  "CY",
  "BAG",
  "SHEET",
  "ROLL",
  "SY",
  "GAL",
  "LB",
  "SET",
  "BOX",
  "TUBE",
  "CAN",
  "PAIL",
  "SQUARE",
  "BF",
  "TON",
];

export default function MaterialsPage() {
  const router = useRouter();
  const { profile, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [materials, setMaterials] = useState<DbMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeDiv, setActiveDiv] = useState("ALL");
  
  // Dialog controls
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState<DbMaterial | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form states
  const [materialForm, setMaterialForm] = useState({
    division_code: "03",
    category: "",
    name: "",
    unit: "EA",
    unit_cost: 0,
    supplier: "",
    notes: "",
  });

  useEffect(() => {
    if (authLoading) return;
    fetchData();
  }, [authLoading]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("materials")
        .select("*")
        .order("name");

      if (error) throw error;
      setMaterials(data || []);
    } catch (error: any) {
      console.error("Error fetching materials:", error);
      toast({
        title: "Error fetching materials",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const supabase = createClient();
      const id = "M" + Date.now();
      const division = DIVISIONS.find((d) => d.code === materialForm.division_code);
      const division_name = division ? division.name : "Other";

      const { error } = await supabase.from("materials").insert({
        id,
        division_code: materialForm.division_code,
        division_name,
        category: materialForm.category.trim(),
        name: materialForm.name.trim(),
        unit: materialForm.unit,
        unit_cost: materialForm.unit_cost,
        supplier: materialForm.supplier.trim() || null,
        notes: materialForm.notes.trim() || null,
        updated_at: new Date().toISOString().split("T")[0],
      });

      if (error) throw error;
      toast({ title: "Material added successfully" });
      setAddDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      toast({
        title: "Error adding material",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMaterial) return;
    setSubmitting(true);
    try {
      const supabase = createClient();
      const division = DIVISIONS.find((d) => d.code === materialForm.division_code);
      const division_name = division ? division.name : "Other";

      const { error } = await supabase
        .from("materials")
        .update({
          division_code: materialForm.division_code,
          division_name,
          category: materialForm.category.trim(),
          name: materialForm.name.trim(),
          unit: materialForm.unit,
          unit_cost: materialForm.unit_cost,
          supplier: materialForm.supplier.trim() || null,
          notes: materialForm.notes.trim() || null,
          updated_at: new Date().toISOString().split("T")[0],
        })
         .eq("id", selectedMaterial.id);

      if (error) throw error;
      toast({ title: "Material updated successfully" });
      setEditDialogOpen(false);
      setSelectedMaterial(null);
      resetForm();
      fetchData();
    } catch (error: any) {
      toast({
        title: "Error updating material",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this material from the database?")) return;
    try {
      const supabase = createClient();
      const { error } = await supabase.from("materials").delete().eq("id", id);
      if (error) throw error;
      setMaterials(materials.filter((m) => m.id !== id));
      toast({ title: "Material deleted" });
    } catch (error: any) {
      toast({
        title: "Error deleting material",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setMaterialForm({
      division_code: "03",
      category: "",
      name: "",
      unit: "EA",
      unit_cost: 0,
      supplier: "",
      notes: "",
    });
  };

  const openEditDialog = (mat: DbMaterial) => {
    setSelectedMaterial(mat);
    setMaterialForm({
      division_code: mat.division_code,
      category: mat.category,
      name: mat.name,
      unit: mat.unit,
      unit_cost: Number(mat.unit_cost),
      supplier: mat.supplier || "",
      notes: mat.notes || "",
    });
    setEditDialogOpen(true);
  };

  const exportCSV = () => {
    const hdr = ["CSI Code", "Division", "Category", "Material Name", "Unit", "Unit Cost (BSD$)", "Supplier", "Notes", "Updated"];
    const rows = filtered.map((m) => [
      m.division_code,
      m.division_name,
      m.category,
      m.name,
      m.unit,
      m.unit_cost,
      m.supplier || "",
      m.notes || "",
      m.updated_at || "",
    ]);
    const csv = [hdr, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${APP_NAME}_Materials_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: "CSV Exported successfully" });
  };

  // Filter materials based on search and division sidebar
  const filtered = useMemo(() => {
    return materials.filter((m) => {
      const matchesSearch =
        m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (m.supplier || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (m.notes || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.division_code.includes(searchTerm);

      const matchesDiv = activeDiv === "ALL" || m.division_code === activeDiv;
      return matchesSearch && matchesDiv;
    });
  }, [materials, searchTerm, activeDiv]);

  // Compute stats
  const stats = useMemo(() => {
    const count = filtered.length;
    const avg = count ? filtered.reduce((sum, m) => sum + Number(m.unit_cost), 0) / count : 0;
    const categoriesCount = new Set(filtered.map((m) => m.category)).size;
    return { count, avg, categoriesCount };
  }, [filtered]);

  return (
    <div className="flex h-full bg-background text-foreground overflow-hidden">
      {/* Internal Sidebar for CSI Divisions */}
      <div className="w-56 border-r border-border bg-card flex flex-col flex-shrink-0">
        <div className="px-4 py-4 border-b border-border">
          <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">CSI CLASSIFICATION</p>
          <h2 className="text-[14px] font-semibold text-foreground mt-0.5">Divisions</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          <button
            onClick={() => setActiveDiv("ALL")}
            className={cn(
              "w-full text-left px-3 py-2 rounded-md text-[12.5px] transition-colors flex justify-between items-center",
              activeDiv === "ALL"
                ? "bg-accent text-brand font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
            )}
          >
            <span>All Materials</span>
            <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full tabular-nums">
              {materials.length}
            </span>
          </button>
          
          <div className="h-px bg-border my-2" />

          {DIVISIONS.map((div) => {
            const count = materials.filter((m) => m.division_code === div.code).length;
            const isActive = activeDiv === div.code;
            const color = DIV_COLORS[div.code] || "#ccc";

            return (
              <button
                key={div.code}
                onClick={() => setActiveDiv(div.code)}
                className={cn(
                  "w-full text-left px-3 py-1.5 rounded-md text-[12px] transition-colors flex justify-between items-center group",
                  isActive
                    ? "bg-accent text-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                )}
              >
                <span className="flex items-center truncate">
                  <span
                    className="w-1.5 h-1.5 rounded-full mr-2.5 flex-shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <span className="tabular-nums text-[10px] text-muted-foreground/60 mr-1.5">{div.code}</span>
                  <span className="truncate">{div.name}</span>
                </span>
                <span className="text-[9px] bg-muted text-muted-foreground px-1 py-0.2 rounded-full tabular-nums ml-2">
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0 bg-card">
          <div>
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Pricing Database</p>
            <h1 className="text-[16px] font-semibold text-foreground mt-0.5">
              {activeDiv === "ALL" ? "All Materials" : `Division ${activeDiv} — ${DIVISIONS.find((d) => d.code === activeDiv)?.name}`}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={exportCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-card text-[12px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <FileDown className="h-3.5 w-3.5" />
              Export CSV
            </button>
            <button
              onClick={() => {
                resetForm();
                if (activeDiv !== "ALL") {
                  setMaterialForm((f) => ({ ...f, division_code: activeDiv }));
                }
                setAddDialogOpen(true);
              }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-primary text-primary-foreground font-semibold text-[12px] hover:opacity-90 transition-opacity"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Material
            </button>
          </div>
        </div>

        {/* Stats and Filter Bar */}
        <div className="px-6 py-4 space-y-4 flex-shrink-0 border-b border-border bg-muted/20">
          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Items Shown", value: stats.count.toString() },
              { label: "Average Unit Cost", value: formatCurrency(stats.avg), accent: true },
              { label: "Categories", value: stats.categoriesCount.toString() },
            ].map((s, idx) => (
              <div key={idx} className="rounded-lg border border-border bg-card px-4 py-3">
                <p className="text-[9.5px] font-mono text-muted-foreground uppercase tracking-wider">{s.label}</p>
                <p className={cn("text-[20px] font-semibold tabular-nums mt-0.5 leading-none",
                  s.accent ? "text-brand" : "text-foreground"
                )}>
                  {s.value}
                </p>
              </div>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search materials by name, category, supplier, or notes..."
              className="w-full bg-card border border-border rounded-md pl-9 pr-4 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-primary/40 transition-colors"
            />
          </div>
        </div>

        {/* Table View */}
        <div className="flex-1 overflow-auto p-6 bg-background">
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            {loading ? (
              <div className="p-16 text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-brand" />
                <p className="text-[12px] text-muted-foreground mt-2 tabular-nums">Loading materials catalog...</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-20 text-center">
                <Layers className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-[13px] text-muted-foreground">
                  {searchTerm ? "No materials match your search" : "No materials found in this division"}
                </p>
                <button
                  onClick={() => setAddDialogOpen(true)}
                  className="mt-3 text-[12px] text-brand hover:underline"
                >
                  Add a material now →
                </button>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    {activeDiv === "ALL" && (
                      <th className="px-4 py-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground w-20">Div</th>
                    )}
                    <th className="px-4 py-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground w-36">Category</th>
                    <th className="px-4 py-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Material Name / Description</th>
                    <th className="px-4 py-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground w-20 text-center">Unit</th>
                    <th className="px-4 py-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground w-32 text-right">Unit Cost</th>
                    <th className="px-4 py-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground w-36">Supplier</th>
                    <th className="w-24 px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((mat) => {
                    const color = DIV_COLORS[mat.division_code] || "#ccc";
                    return (
                      <tr key={mat.id} className="group hover:bg-muted/40 transition-colors align-top">
                        {activeDiv === "ALL" && (
                          <td className="px-4 py-3 text-[11px] tabular-nums">
                            <span
                              className="px-2 py-0.5 rounded-full text-white text-[10px] font-semibold"
                              style={{ backgroundColor: color }}
                              title={mat.division_name}
                            >
                              {mat.division_code}
                            </span>
                          </td>
                        )}
                        <td className="px-4 py-3 text-[12px] text-muted-foreground tabular-nums capitalize truncate max-w-[144px]" title={mat.category}>
                          {mat.category}
                        </td>
                        <td className="px-4 py-3 text-[13px] text-foreground">
                          <div className="font-medium">{mat.name}</div>
                          {mat.notes && (
                            <div className="text-[10.5px] text-muted-foreground/80 font-normal mt-0.5 italic flex items-start gap-1">
                              <Info className="h-3 w-3 mt-0.5 flex-shrink-0 text-muted-foreground/55" />
                              <span>{mat.notes}</span>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center text-[12px] tabular-nums text-muted-foreground">
                          {mat.unit}
                        </td>
                        <td className="px-4 py-3 text-right text-[13px] tabular-nums text-brand font-medium">
                          {formatCurrency(mat.unit_cost)}
                        </td>
                        <td className="px-4 py-3 text-[12px] text-muted-foreground truncate max-w-[144px]" title={mat.supplier || ""}>
                          {mat.supplier || "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => openEditDialog(mat)}
                              className="text-[11px] text-info hover:opacity-80 transition-colors"
                              title="Edit price/info"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(mat.id)}
                              className="text-[11px] text-muted-foreground hover:text-destructive transition-colors"
                              title="Delete material"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
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
      </div>

      {/* Add Material Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-md bg-surface-100 border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-foreground text-[15px]">Add Catalog Material</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddMaterial}>
            <div className="space-y-4 py-2 text-[12px]">
              <div className="space-y-1">
                <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">CSI Division *</p>
                <Select
                  value={materialForm.division_code}
                  onValueChange={(v) => setMaterialForm((f) => ({ ...f, division_code: v }))}
                >
                  <SelectTrigger className="h-8 bg-surface-100 border-strong text-foreground-light text-[13px] focus:ring-0 focus:border-strong">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-surface-100 border-strong max-h-56">
                    {DIVISIONS.map((d) => (
                      <SelectItem
                        key={d.code}
                        value={d.code}
                        className="text-foreground-light focus:bg-surface-100 focus:text-foreground"
                      >
                        {d.code} — {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">Category *</p>
                  <input
                    className="w-full h-8 px-2.5 rounded-md bg-surface-100 border border-strong text-[13px] text-foreground-light placeholder:text-foreground-lighter outline-none focus:border-primary/40 transition-colors"
                    placeholder="e.g. Ready-Mix, Tile"
                    value={materialForm.category}
                    onChange={(e) => setMaterialForm((f) => ({ ...f, category: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">Unit *</p>
                  <Select
                    value={materialForm.unit}
                    onValueChange={(v) => setMaterialForm((f) => ({ ...f, unit: v }))}
                  >
                    <SelectTrigger className="h-8 bg-surface-100 border-strong text-foreground-light text-[13px] focus:ring-0 focus:border-strong">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-surface-100 border-strong max-h-56">
                      {COMMON_UNITS.map((u) => (
                        <SelectItem
                          key={u}
                          value={u}
                          className="text-foreground-light focus:bg-surface-100 focus:text-foreground tabular-nums"
                        >
                          {u}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">Material Name / Description *</p>
                <input
                  className="w-full h-8 px-2.5 rounded-md bg-surface-100 border border-strong text-[13px] text-foreground-light placeholder:text-foreground-lighter outline-none focus:border-primary/40 transition-colors"
                  placeholder="e.g. Ready-Mix Concrete 3000 PSI"
                  value={materialForm.name}
                  onChange={(e) => setMaterialForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">Unit Cost (BSD$) *</p>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="w-full h-8 px-2.5 rounded-md bg-surface-100 border border-strong text-[13px] text-foreground-light outline-none focus:border-primary/40 transition-colors tabular-nums"
                    value={materialForm.unit_cost || ""}
                    onChange={(e) => setMaterialForm((f) => ({ ...f, unit_cost: parseFloat(e.target.value) || 0 }))}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">Supplier</p>
                  <input
                    className="w-full h-8 px-2.5 rounded-md bg-surface-100 border border-strong text-[13px] text-foreground-light placeholder:text-foreground-lighter outline-none focus:border-primary/40 transition-colors"
                    placeholder="e.g. Nassau, Local"
                    value={materialForm.supplier}
                    onChange={(e) => setMaterialForm((f) => ({ ...f, supplier: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">Notes</p>
                <textarea
                  className="w-full px-2.5 py-1.5 rounded-md bg-surface-100 border border-strong text-[13px] text-foreground-light placeholder:text-foreground-lighter outline-none focus:border-primary/40 transition-colors min-h-[50px] resize-y"
                  placeholder="e.g. Delivered. Price varies with freight."
                  value={materialForm.notes}
                  onChange={(e) => setMaterialForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter>
              <button
                type="button"
                onClick={() => setAddDialogOpen(false)}
                className="px-4 py-2 text-[12px] text-foreground-lighter hover:text-foreground-light transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary border border-primary text-[12px] text-primary-foreground font-semibold hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Add Material
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Material Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-md bg-surface-100 border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-foreground text-[15px]">Edit Catalog Material</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditMaterial}>
            <div className="space-y-4 py-2 text-[12px]">
              <div className="space-y-1">
                <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">CSI Division *</p>
                <Select
                  value={materialForm.division_code}
                  onValueChange={(v) => setMaterialForm((f) => ({ ...f, division_code: v }))}
                >
                  <SelectTrigger className="h-8 bg-surface-100 border-strong text-foreground-light text-[13px] focus:ring-0 focus:border-strong">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-surface-100 border-strong max-h-56">
                    {DIVISIONS.map((d) => (
                      <SelectItem
                        key={d.code}
                        value={d.code}
                        className="text-foreground-light focus:bg-surface-100 focus:text-foreground"
                      >
                        {d.code} — {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">Category *</p>
                  <input
                    className="w-full h-8 px-2.5 rounded-md bg-surface-100 border border-strong text-[13px] text-foreground-light placeholder:text-foreground-lighter outline-none focus:border-primary/40 transition-colors"
                    placeholder="e.g. Ready-Mix, Tile"
                    value={materialForm.category}
                    onChange={(e) => setMaterialForm((f) => ({ ...f, category: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">Unit *</p>
                  <Select
                    value={materialForm.unit}
                    onValueChange={(v) => setMaterialForm((f) => ({ ...f, unit: v }))}
                  >
                    <SelectTrigger className="h-8 bg-surface-100 border-strong text-foreground-light text-[13px] focus:ring-0 focus:border-strong">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-surface-100 border-strong max-h-56">
                      {COMMON_UNITS.map((u) => (
                        <SelectItem
                          key={u}
                          value={u}
                          className="text-foreground-light focus:bg-surface-100 focus:text-foreground tabular-nums"
                        >
                          {u}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">Material Name / Description *</p>
                <input
                  className="w-full h-8 px-2.5 rounded-md bg-surface-100 border border-strong text-[13px] text-foreground-light placeholder:text-foreground-lighter outline-none focus:border-primary/40 transition-colors"
                  placeholder="e.g. Ready-Mix Concrete 3000 PSI"
                  value={materialForm.name}
                  onChange={(e) => setMaterialForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">Unit Cost (BSD$) *</p>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="w-full h-8 px-2.5 rounded-md bg-surface-100 border border-strong text-[13px] text-foreground-light outline-none focus:border-primary/40 transition-colors tabular-nums"
                    value={materialForm.unit_cost || ""}
                    onChange={(e) => setMaterialForm((f) => ({ ...f, unit_cost: parseFloat(e.target.value) || 0 }))}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">Supplier</p>
                  <input
                    className="w-full h-8 px-2.5 rounded-md bg-surface-100 border border-strong text-[13px] text-foreground-light placeholder:text-foreground-lighter outline-none focus:border-primary/40 transition-colors"
                    placeholder="e.g. Nassau, Local"
                    value={materialForm.supplier}
                    onChange={(e) => setMaterialForm((f) => ({ ...f, supplier: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">Notes</p>
                <textarea
                  className="w-full px-2.5 py-1.5 rounded-md bg-surface-100 border border-strong text-[13px] text-foreground-light placeholder:text-foreground-lighter outline-none focus:border-primary/40 transition-colors min-h-[50px] resize-y"
                  placeholder="e.g. Delivered. Price varies with freight."
                  value={materialForm.notes}
                  onChange={(e) => setMaterialForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter>
              <button
                type="button"
                onClick={() => {
                  setEditDialogOpen(false);
                  setSelectedMaterial(null);
                }}
                className="px-4 py-2 text-[12px] text-foreground-lighter hover:text-foreground-light transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary border border-primary text-[12px] text-primary-foreground font-semibold hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Save Changes
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
