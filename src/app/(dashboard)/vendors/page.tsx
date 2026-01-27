"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { DatePicker } from "@/components/ui/date-picker";
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
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { formatCurrency, formatDate, getPOStatusColor } from "@/lib/utils";
import {
  Plus,
  Search,
  Truck,
  FileText,
  MoreHorizontal,
  Pencil,
  Trash2,
  Eye,
  Loader2,
  Mail,
  Phone,
  ScanLine,
  BarChart3,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Calendar,
  Building2,
} from "lucide-react";
import { ReceiptScannerDialog } from "@/components/receipt-scanner/receipt-scanner-dialog";
import { EnhancedReceiptScannerDialog } from "@/components/receipt-scanner/enhanced-receipt-scanner-dialog";
import type { ParsedReceipt } from "@/lib/ocr/receipt-parser";
import type { Vendor, PurchaseOrder, Project } from "@/types";

export default function VendorsPage() {
  const { toast } = useToast();
  const { profile, loading: authLoading } = useAuth();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [projects, setProjects] = useState<Pick<Project, "id" | "name" | "status">[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [enhancedScannerOpen, setEnhancedScannerOpen] = useState(false);
  const [poDialogOpen, setPoDialogOpen] = useState(false);
  const [creatingPO, setCreatingPO] = useState(false);
  const [scannedData, setScannedData] = useState<ParsedReceipt | null>(null);
  const [scannedImageFile, setScannedImageFile] = useState<File | null>(null);
  const [viewingReceipt, setViewingReceipt] = useState<{ po: any; imageUrl: string } | null>(null);
  const [viewVendorOpen, setViewVendorOpen] = useState(false);
  const [editVendorOpen, setEditVendorOpen] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [editVendorForm, setEditVendorForm] = useState({
    name: "",
    contact_name: "",
    email: "",
    phone: "",
    address: "",
    payment_terms: "",
    status: "active" as Vendor["status"],
    notes: "",
    tin: "",
    account_number: "",
  });
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [viewPOOpen, setViewPOOpen] = useState(false);
  const [editPOOpen, setEditPOOpen] = useState(false);
  const [selectedPO, setSelectedPO] = useState<any>(null);
  const [editPOForm, setEditPOForm] = useState({
    vendor_id: "",
    project_id: "",
    order_date: "",
    status: "draft" as string,
    total_amount: 0,
    notes: "",
  });
  const [editPOSubmitting, setEditPOSubmitting] = useState(false);
  const [vendorAnalytics, setVendorAnalytics] = useState<{
    totalSpend: number;
    vendorSpending: { vendor_id: string; vendor_name: string; total: number; count: number }[];
    monthlySpending: { month: string; total: number }[];
    projectSpending: { project_id: string; project_name: string; total: number }[];
  } | null>(null);
  const supabase = createClient();

  const [vendorForm, setVendorForm] = useState({
    name: "",
    contact_name: "",
    email: "",
    phone: "",
    address: "",
    payment_terms: "",
    status: "active" as Vendor["status"],
    notes: "",
  });

  const [poForm, setPoForm] = useState({
    vendor_id: "",
    project_id: "",
    order_date: new Date().toISOString().split("T")[0],
    description: "",
    total_amount: 0,
    notes: "",
  });

  useEffect(() => {
    // Wait for auth to finish loading
    if (authLoading) return;
    
    // If profile exists but no company_id, stop loading
    if (profile && !profile.company_id) {
      setLoading(false);
      return;
    }
    
    // If profile has company_id, fetch data
    if (profile?.company_id) {
      fetchData();
    } else if (profile === null) {
      setLoading(false);
    }
  }, [profile?.company_id, profile, authLoading]);

  const handleScanComplete = (data: ParsedReceipt, imageFile: File | null) => {
    setScannedData(data);
    setScannedImageFile(imageFile);

    // Pre-fill PO form from scanned data
    setPoForm({
      vendor_id: "",
      order_date: data.date || new Date().toISOString().split("T")[0],
      description: data.line_items.map((item) => item.description).join(", ") || "Scanned receipt",
      total_amount: data.total || 0,
      notes: `Vendor: ${data.vendor_name || "Unknown"}\nItems:\n${data.line_items
        .map((item) => `- ${item.description}: $${item.total.toFixed(2)}`)
        .join("\n")}`,
    });

    setPoDialogOpen(true);
  };

  const handleCreatePO = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!poForm.vendor_id) {
      toast({
        title: "Error",
        description: "Please select a vendor",
        variant: "destructive",
      });
      return;
    }

    setCreatingPO(true);
    try {
      // Generate PO number
      const poNumber = `PO-${Date.now().toString().slice(-8)}`;

      // Upload receipt image if available
      let receiptImagePath: string | null = null;
      if (scannedImageFile) {
        try {
          // First, verify the bucket exists by trying to list it
          const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
          
          if (bucketError) {
            console.error("Error checking buckets:", bucketError);
            throw new Error("Could not access storage. Please ensure the 'documents' bucket exists.");
          }

          const documentsBucket = buckets?.find(b => b.id === 'documents');
          if (!documentsBucket) {
            console.error("Documents bucket not found. Available buckets:", buckets?.map(b => b.id));
            throw new Error("The 'documents' storage bucket does not exist. Please create it in Supabase Dashboard > Storage.");
          }

          const fileName = `receipts/${poNumber}-${Date.now()}.jpg`;
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from("documents")
            .upload(fileName, scannedImageFile, {
              cacheControl: '3600',
              upsert: false,
              metadata: {
                user_id: profile?.id,
                company_id: profile?.company_id,
                po_number: poNumber,
                uploaded_at: new Date().toISOString(),
              }
            });

          if (uploadError) {
            console.error("Error uploading receipt image:", uploadError);
            // Continue with PO creation even if receipt upload fails
            toast({
              title: "Warning",
              description: `Purchase order created, but receipt image could not be saved: ${uploadError.message}. You can add it later.`,
              variant: "default",
            });
          } else if (uploadData?.path) {
            receiptImagePath = uploadData.path;
            console.log("Receipt uploaded successfully:", receiptImagePath);
          } else {
            console.warn("Upload succeeded but no path returned");
          }
        } catch (uploadErr: any) {
          console.error("Exception uploading receipt:", uploadErr);
          // Continue with PO creation even if receipt upload fails
          toast({
            title: "Warning",
            description: uploadErr?.message || "Purchase order created, but receipt image could not be saved. You can add it later.",
            variant: "default",
          });
        }
      }

      // Create purchase order
      const { error } = await supabase.from("purchase_orders").insert({
        po_number: poNumber,
        vendor_id: poForm.vendor_id,
        project_id: poForm.project_id || null,
        order_date: poForm.order_date,
        status: "draft",
        total_amount: poForm.total_amount,
        notes: poForm.notes,
        receipt_image_path: receiptImagePath,
        ocr_raw_text: scannedData?.raw_text || null,
        company_id: profile?.company_id,
        created_by: profile?.id,
      });

      if (error) throw error;

      const successMessage = receiptImagePath 
        ? `${poNumber} has been created with the scanned receipt attached.`
        : `${poNumber} has been created${scannedImageFile ? ' (receipt upload failed)' : ''}.`;

      toast({
        title: "Purchase Order created",
        description: successMessage,
        variant: "success",
      });

      setPoDialogOpen(false);
      setScannedData(null);
      setScannedImageFile(null);
      setPoForm({
        vendor_id: "",
        project_id: "",
        order_date: new Date().toISOString().split("T")[0],
        description: "",
        total_amount: 0,
        notes: "",
      });
      fetchData();
    } catch (error: any) {
      console.error("Error creating PO:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create purchase order",
        variant: "destructive",
      });
    } finally {
      setCreatingPO(false);
    }
  };

  const fetchData = async () => {
    if (!profile?.company_id) return;

    setLoading(true);
    try {
      const { data: vendorsData } = await supabase
        .from("vendors")
        .select("*")
        .eq("company_id", profile.company_id)
        .order("name");
      setVendors(vendorsData || []);

      const { data: poData } = await supabase
        .from("purchase_orders")
        .select("*, vendors(name), projects(name)")
        .eq("company_id", profile.company_id)
        .order("created_at", { ascending: false })
        .limit(50);
      setPurchaseOrders(poData || []);

      // Fetch active projects for assignment
      const { data: projectsData } = await supabase
        .from("projects")
        .select("id, name, status")
        .eq("company_id", profile.company_id)
        .in("status", ["active", "planning"])
        .order("name");
      setProjects(projectsData || []);

      // Calculate vendor analytics from all POs (not just recent)
      const { data: allPOs } = await supabase
        .from("purchase_orders")
        .select("*, vendors(name), projects(name)")
        .eq("company_id", profile.company_id)
        .order("order_date", { ascending: false });

      if (allPOs && allPOs.length > 0) {
        // Total spend
        const totalSpend = allPOs.reduce((sum, po) => sum + (po.total_amount || 0), 0);

        // Spending by vendor
        const vendorMap = new Map<string, { vendor_name: string; total: number; count: number }>();
        allPOs.forEach((po) => {
          if (po.vendor_id) {
            const existing = vendorMap.get(po.vendor_id) || { vendor_name: po.vendors?.name || "Unknown", total: 0, count: 0 };
            existing.total += po.total_amount || 0;
            existing.count += 1;
            vendorMap.set(po.vendor_id, existing);
          }
        });
        const vendorSpending = Array.from(vendorMap.entries())
          .map(([vendor_id, data]) => ({ vendor_id, ...data }))
          .sort((a, b) => b.total - a.total)
          .slice(0, 10);

        // Monthly spending (last 6 months)
        const monthlyMap = new Map<string, number>();
        const now = new Date();
        for (let i = 5; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const key = d.toISOString().slice(0, 7);
          monthlyMap.set(key, 0);
        }
        allPOs.forEach((po) => {
          if (po.order_date) {
            const key = po.order_date.slice(0, 7);
            if (monthlyMap.has(key)) {
              monthlyMap.set(key, (monthlyMap.get(key) || 0) + (po.total_amount || 0));
            }
          }
        });
        const monthlySpending = Array.from(monthlyMap.entries()).map(([month, total]) => ({ month, total }));

        // Spending by project
        const projectMap = new Map<string, { project_name: string; total: number }>();
        allPOs.forEach((po) => {
          const projectId = po.project_id || "unassigned";
          const projectName = po.projects?.name || "Unassigned";
          const existing = projectMap.get(projectId) || { project_name: projectName, total: 0 };
          existing.total += po.total_amount || 0;
          projectMap.set(projectId, existing);
        });
        const projectSpending = Array.from(projectMap.entries())
          .map(([project_id, data]) => ({ project_id, ...data }))
          .sort((a, b) => b.total - a.total)
          .slice(0, 10);

        setVendorAnalytics({ totalSpend, vendorSpending, monthlySpending, projectSpending });
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (!profile) {
        throw new Error("User profile not loaded. Please refresh the page and try again.");
      }

      if (!profile.company_id) {
        throw new Error("You must be associated with a company to create vendors. Please contact your administrator to assign you to a company.");
      }

      const { error } = await supabase.from("vendors").insert({
        ...vendorForm,
        company_id: profile.company_id,
        email: vendorForm.email || null,
        phone: vendorForm.phone || null,
      });

      if (error) throw error;

      toast({
        title: "Vendor added",
        description: "The vendor has been successfully added.",
        variant: "success",
      });

      setDialogOpen(false);
      setVendorForm({
        name: "",
        contact_name: "",
        email: "",
        phone: "",
        address: "",
        payment_terms: "",
        status: "active",
        notes: "",
      });
      fetchData();
    } catch (error: any) {
      console.error("Error saving vendor:", error);
      
      // Provide helpful error messages for common issues
      let errorMessage = error.message || "Failed to save vendor";
      
      if (error.code === "42501" || error.message?.includes("row-level security")) {
        if (!profile?.company_id) {
          errorMessage = "You must be associated with a company to create vendors. Please contact your administrator to assign you to a company.";
        } else {
          errorMessage = "Permission denied. Please ensure you're associated with a company and try again. If this persists, contact your administrator.";
        }
      }
      
      toast({
        title: "Error saving vendor",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleViewReceipt = async (po: any) => {
    if (!po.receipt_image_path) {
      toast({
        title: "No receipt",
        description: "No receipt image is attached to this purchase order.",
        variant: "default",
      });
      return;
    }

    try {
      // Try to get a signed URL (works for both public and private buckets)
      // For public buckets, we could use getPublicUrl, but signed URLs work for both
      const { data: signedData, error: urlError } = await supabase.storage
        .from("documents")
        .createSignedUrl(po.receipt_image_path, 3600); // URL valid for 1 hour

      if (urlError) {
        console.error("Error creating signed URL:", urlError);
        // If signed URL fails, try public URL as fallback
        const { data: publicUrlData } = supabase.storage
          .from("documents")
          .getPublicUrl(po.receipt_image_path);
        
        if (publicUrlData?.publicUrl) {
          setViewingReceipt({ po, imageUrl: publicUrlData.publicUrl });
        } else {
          throw urlError;
        }
      } else if (signedData?.signedUrl) {
        setViewingReceipt({ po, imageUrl: signedData.signedUrl });
      } else {
        throw new Error("Could not generate receipt URL");
      }
    } catch (error) {
      console.error("Error loading receipt:", error);
      toast({
        title: "Error",
        description: "Could not load receipt image. Please ensure the storage bucket exists and you have permission to access it.",
        variant: "destructive",
      });
    }
  };

  const handleDeletePO = async (id: string) => {
    if (!confirm("Are you sure you want to delete this purchase order? This action cannot be undone.")) return;

    try {
      // Check user permissions
      const isAdmin = profile?.role === "admin" || profile?.role === "project_manager";
      if (!isAdmin) {
        toast({
          title: "Permission denied",
          description: "Only administrators and project managers can delete purchase orders.",
          variant: "destructive",
        });
        return;
      }

      const { error } = await supabase
        .from("purchase_orders")
        .delete()
        .eq("id", id);

      if (error) {
        console.error("Error deleting purchase order:", error);
        toast({
          title: "Error deleting purchase order",
          description: error.message || "An error occurred while deleting the purchase order.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Purchase order deleted",
        description: "The purchase order has been successfully deleted.",
        variant: "success",
      });

      fetchData();
    } catch (error: any) {
      console.error("Error deleting purchase order:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete purchase order",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this vendor? This action cannot be undone.")) return;

    try {
      // Check user permissions first
      const isAdmin = profile?.role === "admin" || profile?.role === "project_manager";
      if (!isAdmin) {
        toast({
          title: "Permission denied",
          description: "Only administrators and project managers can delete vendors.",
          variant: "destructive",
        });
        return;
      }

      // Check if vendor has purchase orders
      const { count: poCount } = await supabase
        .from("purchase_orders")
        .select("*", { count: "exact", head: true })
        .eq("vendor_id", id);

      if (poCount && poCount > 0) {
        toast({
          title: "Cannot delete vendor",
          description: `This vendor has ${poCount} purchase order(s). Consider marking them as inactive instead.`,
          variant: "destructive",
        });
        return;
      }

      const { data, error } = await supabase
        .from("vendors")
        .delete()
        .eq("id", id)
        .select();
      
      if (error) {
        console.error("Error deleting vendor:", error);
        toast({
          title: "Error deleting vendor",
          description: error.message || "An error occurred while deleting the vendor.",
          variant: "destructive",
        });
        return;
      }

      // Check if anything was actually deleted
      if (!data || data.length === 0) {
        toast({
          title: "Cannot delete vendor",
          description: "The vendor could not be deleted. This may be due to database permissions. Please ensure the RLS policy allows deletion for your role.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Vendor deleted",
        description: "The vendor has been successfully deleted.",
        variant: "success",
      });

      // Refresh the vendors list
      fetchData();
    } catch (error) {
      console.error("Error deleting vendor:", error);
      const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
      toast({
        title: "Error deleting vendor",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const handleViewVendor = (vendor: Vendor) => {
    setSelectedVendor(vendor);
    setViewVendorOpen(true);
  };

  const handleOpenEditVendor = (vendor: Vendor) => {
    setSelectedVendor(vendor);
    setEditVendorForm({
      name: vendor.name || "",
      contact_name: vendor.contact_name || "",
      email: vendor.email || "",
      phone: vendor.phone || "",
      address: vendor.address || "",
      payment_terms: vendor.payment_terms || "",
      status: vendor.status || "active",
      notes: vendor.notes || "",
      tin: (vendor as any).tin || "",
      account_number: (vendor as any).account_number || "",
    });
    setEditVendorOpen(true);
  };

  const handleEditVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVendor) return;

    setEditSubmitting(true);
    try {
      const { error } = await supabase
        .from("vendors")
        .update({
          name: editVendorForm.name,
          contact_name: editVendorForm.contact_name || null,
          email: editVendorForm.email || null,
          phone: editVendorForm.phone || null,
          address: editVendorForm.address || null,
          payment_terms: editVendorForm.payment_terms || null,
          status: editVendorForm.status,
          notes: editVendorForm.notes || null,
          tin: editVendorForm.tin || null,
          account_number: editVendorForm.account_number || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", selectedVendor.id);

      if (error) throw error;

      toast({
        title: "Vendor updated",
        description: "The vendor has been successfully updated.",
        variant: "success",
      });

      setEditVendorOpen(false);
      setSelectedVendor(null);
      fetchData();
    } catch (error: any) {
      console.error("Error updating vendor:", error);
      toast({
        title: "Error updating vendor",
        description: error.message || "Failed to update vendor",
        variant: "destructive",
      });
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleViewPO = (po: any) => {
    setSelectedPO(po);
    setViewPOOpen(true);
  };

  const handleEditPO = (po: any) => {
    setSelectedPO(po);
    setEditPOForm({
      vendor_id: po.vendor_id || "",
      project_id: po.project_id || "",
      order_date: po.order_date || new Date().toISOString().split("T")[0],
      status: po.status || "draft",
      total_amount: po.total_amount || 0,
      notes: po.notes || "",
    });
    setEditPOOpen(true);
  };

  const handleUpdatePO = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPO) return;

    setEditPOSubmitting(true);
    try {
      const { error } = await supabase
        .from("purchase_orders")
        .update({
          vendor_id: editPOForm.vendor_id,
          project_id: editPOForm.project_id || null,
          order_date: editPOForm.order_date,
          status: editPOForm.status,
          total_amount: editPOForm.total_amount,
          notes: editPOForm.notes || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", selectedPO.id);

      if (error) throw error;

      toast({
        title: "Purchase Order updated",
        description: "The purchase order has been successfully updated.",
        variant: "success",
      });

      setEditPOOpen(false);
      setSelectedPO(null);
      fetchData();
    } catch (error: any) {
      console.error("Error updating PO:", error);
      toast({
        title: "Error updating purchase order",
        description: error.message || "Failed to update purchase order",
        variant: "destructive",
      });
    } finally {
      setEditPOSubmitting(false);
    }
  };

  const handleApprovePO = async (po: any) => {
    const isAdmin = profile?.role === "admin" || profile?.role === "project_manager";
    if (!isAdmin) {
      toast({
        title: "Permission denied",
        description: "Only administrators and project managers can approve purchase orders.",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase
        .from("purchase_orders")
        .update({
          status: "approved",
          approved_by: profile?.id,
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", po.id);

      if (error) throw error;

      toast({
        title: "Purchase Order approved",
        description: `${po.po_number} has been approved.`,
        variant: "success",
      });

      setViewPOOpen(false);
      setSelectedPO(null);
      fetchData();
    } catch (error: any) {
      console.error("Error approving PO:", error);
      toast({
        title: "Error approving purchase order",
        description: error.message || "Failed to approve purchase order",
        variant: "destructive",
      });
    }
  };

  const filteredVendors = vendors.filter(
    (vendor) =>
      vendor.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (vendor.contact_name?.toLowerCase() || "").includes(searchTerm.toLowerCase())
  );

  const getVendorStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
      inactive: "bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-300",
      blacklisted: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    };
    return colors[status] || "bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-300";
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Header title="Vendors" description="Manage suppliers and purchase orders">
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Vendor
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add New Vendor</DialogTitle>
              <DialogDescription>Add a supplier to your vendor list</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAddVendor}>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Company Name *</Label>
                  <Input
                    id="name"
                    placeholder="ABC Building Supplies"
                    value={vendorForm.name}
                    onChange={(e) => setVendorForm({ ...vendorForm, name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contact_name">Contact Person</Label>
                  <Input
                    id="contact_name"
                    placeholder="John Doe"
                    value={vendorForm.contact_name}
                    onChange={(e) => setVendorForm({ ...vendorForm, contact_name: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="vendor@example.com"
                      value={vendorForm.email}
                      onChange={(e) => setVendorForm({ ...vendorForm, email: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      placeholder="(242) 555-1234"
                      value={vendorForm.phone}
                      onChange={(e) => setVendorForm({ ...vendorForm, phone: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">Address</Label>
                  <Textarea
                    id="address"
                    placeholder="Street address, city"
                    rows={2}
                    value={vendorForm.address}
                    onChange={(e) => setVendorForm({ ...vendorForm, address: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="payment_terms">Payment Terms</Label>
                  <Input
                    id="payment_terms"
                    placeholder="Net 30"
                    value={vendorForm.payment_terms}
                    onChange={(e) => setVendorForm({ ...vendorForm, payment_terms: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Add Vendor
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </Header>

      <div className="flex-1 p-6 space-y-6">
        <Tabs defaultValue="vendors">
          <TabsList>
            <TabsTrigger value="vendors">Vendors</TabsTrigger>
            <TabsTrigger value="purchase-orders">Purchase Orders</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="vendors" className="space-y-6">
            {/* Search */}
            <Card>
              <CardContent className="py-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search vendors..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Vendors Table */}
            <Card>
              <CardContent className="p-0">
                {loading ? (
                  <div className="p-8 text-center">
                    <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
                  </div>
                ) : filteredVendors.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Vendor</TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Payment Terms</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredVendors.map((vendor) => (
                        <TableRow key={vendor.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{vendor.name}</p>
                              {vendor.email && (
                                <p className="text-sm text-muted-foreground flex items-center gap-1">
                                  <Mail className="h-3 w-3" />
                                  {vendor.email}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{vendor.contact_name || "-"}</TableCell>
                          <TableCell>
                            {vendor.phone ? (
                              <span className="flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {vendor.phone}
                              </span>
                            ) : (
                              "-"
                            )}
                          </TableCell>
                          <TableCell>{vendor.payment_terms || "-"}</TableCell>
                          <TableCell>
                            <Badge className={getVendorStatusColor(vendor.status)}>
                              {vendor.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleViewVendor(vendor)}>
                                  <Eye className="h-4 w-4 mr-2" />
                                  View Details
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleOpenEditVendor(vendor)}>
                                  <Pencil className="h-4 w-4 mr-2" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => handleDelete(vendor.id)}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="p-12 text-center">
                    <Truck className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No vendors found</h3>
                    <p className="text-muted-foreground mb-4">
                      Add your first vendor to get started
                    </p>
                    <Button onClick={() => setDialogOpen(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Vendor
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="purchase-orders" className="space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Purchase Orders</CardTitle>
                  <CardDescription>Track orders with vendors</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setEnhancedScannerOpen(true)}>
                    <ScanLine className="h-4 w-4 mr-2" />
                    AI Scan Receipt
                  </Button>
                  <Button onClick={() => setPoDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create PO
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {purchaseOrders.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>PO Number</TableHead>
                        <TableHead>Vendor</TableHead>
                        <TableHead>Project</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Order Date</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {purchaseOrders.map((po: any) => (
                        <TableRow key={po.id}>
                          <TableCell className="font-medium">{po.po_number}</TableCell>
                          <TableCell>{po.vendors?.name}</TableCell>
                          <TableCell>
                            {po.projects?.name ? (
                              <Badge variant="outline" className="font-normal">
                                {po.projects.name}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-sm">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge className={getPOStatusColor(po.status)}>
                              {po.status.replace("_", " ")}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {po.order_date ? formatDate(po.order_date) : "-"}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(po.total_amount)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              {po.receipt_image_path && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleViewReceipt(po)}
                                  title="View receipt"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              )}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => handleViewPO(po)}>
                                    <Eye className="h-4 w-4 mr-2" />
                                    View Details
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleEditPO(po)}>
                                    <Pencil className="h-4 w-4 mr-2" />
                                    Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-destructive"
                                    onClick={() => handleDeletePO(po.id)}
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="p-12 text-center">
                    <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No purchase orders</h3>
                    <p className="text-muted-foreground">
                      Create a purchase order to track vendor orders
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analytics" className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Spend</p>
                      <p className="text-2xl font-bold">
                        {formatCurrency(vendorAnalytics?.totalSpend || 0)}
                      </p>
                    </div>
                    <div className="p-3 bg-primary/10 rounded-full">
                      <DollarSign className="h-6 w-6 text-primary" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Active Vendors</p>
                      <p className="text-2xl font-bold">
                        {vendors.filter((v) => v.status === "active").length}
                      </p>
                    </div>
                    <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-full">
                      <Truck className="h-6 w-6 text-green-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Purchase Orders</p>
                      <p className="text-2xl font-bold">{purchaseOrders.length}</p>
                    </div>
                    <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-full">
                      <FileText className="h-6 w-6 text-blue-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Spending Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Monthly Spending Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Monthly Spending (Last 6 Months)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {vendorAnalytics?.monthlySpending && vendorAnalytics.monthlySpending.length > 0 ? (
                    <div className="space-y-3">
                      {(() => {
                        const maxSpend = Math.max(...vendorAnalytics.monthlySpending.map((m) => m.total));
                        return vendorAnalytics.monthlySpending.map((item, idx) => {
                          const percent = maxSpend > 0 ? (item.total / maxSpend) * 100 : 0;
                          const monthLabel = new Date(item.month + "-01").toLocaleDateString("en-US", {
                            month: "short",
                            year: "2-digit",
                          });
                          return (
                            <div key={item.month} className="space-y-1">
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">{monthLabel}</span>
                                <span className="font-medium">{formatCurrency(item.total)}</span>
                              </div>
                              <div className="h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-primary rounded-full transition-all"
                                  style={{ width: `${percent}%` }}
                                />
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <BarChart3 className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>No spending data available</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Top Vendors */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Truck className="h-4 w-4" />
                    Top Vendors by Spend
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {vendorAnalytics?.vendorSpending && vendorAnalytics.vendorSpending.length > 0 ? (
                    <div className="space-y-3">
                      {vendorAnalytics.vendorSpending.slice(0, 5).map((vendor, idx) => {
                        const maxSpend = vendorAnalytics.vendorSpending[0]?.total || 1;
                        const percent = (vendor.total / maxSpend) * 100;
                        return (
                          <div key={vendor.vendor_id} className="space-y-1">
                            <div className="flex justify-between text-sm">
                              <span className="font-medium truncate max-w-[60%]">{vendor.vendor_name}</span>
                              <span className="text-muted-foreground">
                                {vendor.count} PO{vendor.count !== 1 ? "s" : ""} • {formatCurrency(vendor.total)}
                              </span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-green-500 rounded-full transition-all"
                                style={{ width: `${percent}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Truck className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>No vendor spending data</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Spending by Project */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Spending by Project
                </CardTitle>
                <CardDescription>
                  Track material costs per project for job costing
                </CardDescription>
              </CardHeader>
              <CardContent>
                {vendorAnalytics?.projectSpending && vendorAnalytics.projectSpending.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Project</TableHead>
                        <TableHead className="text-right">Total Spend</TableHead>
                        <TableHead className="text-right">% of Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {vendorAnalytics.projectSpending.map((project) => {
                        const percentOfTotal = vendorAnalytics.totalSpend > 0
                          ? ((project.total / vendorAnalytics.totalSpend) * 100).toFixed(1)
                          : "0";
                        return (
                          <TableRow key={project.project_id}>
                            <TableCell>
                              {project.project_id === "unassigned" ? (
                                <span className="text-muted-foreground italic">Unassigned</span>
                              ) : (
                                <span className="font-medium">{project.project_name}</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {formatCurrency(project.total)}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {percentOfTotal}%
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Building2 className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No project spending data</p>
                    <p className="text-sm mt-1">Assign purchase orders to projects to track job costs</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Receipt Scanner Dialog (Legacy) */}
      <ReceiptScannerDialog
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onScanComplete={handleScanComplete}
      />

      {/* Enhanced AI Receipt Scanner Dialog */}
      <EnhancedReceiptScannerDialog
        open={enhancedScannerOpen}
        onOpenChange={setEnhancedScannerOpen}
        onComplete={(poId) => {
          fetchData();
          toast({
            title: "Success",
            description: "Purchase order created from scanned receipt",
            variant: "success",
          });
        }}
        vendors={vendors}
        projects={projects}
      />

      {/* Receipt Viewer Dialog */}
      <Dialog open={!!viewingReceipt} onOpenChange={(open) => !open && setViewingReceipt(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>
              Receipt - {viewingReceipt?.po.po_number}
            </DialogTitle>
            <DialogDescription>
              {viewingReceipt?.po.vendors?.name} • {viewingReceipt?.po.order_date && formatDate(viewingReceipt.po.order_date)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {viewingReceipt?.imageUrl && (
              <div className="border rounded-lg overflow-hidden bg-muted">
                <img
                  src={viewingReceipt.imageUrl}
                  alt={`Receipt for ${viewingReceipt.po.po_number}`}
                  className="w-full h-auto max-h-[60vh] object-contain"
                  onError={(e) => {
                    console.error("Error loading receipt image");
                    toast({
                      title: "Error",
                      description: "Could not load receipt image. It may have been deleted.",
                      variant: "destructive",
                    });
                    setViewingReceipt(null);
                  }}
                />
              </div>
            )}
            {viewingReceipt?.po.ocr_raw_text && (
              <div className="space-y-2">
                <Label>Scanned Text</Label>
                <Textarea
                  value={viewingReceipt.po.ocr_raw_text}
                  readOnly
                  rows={6}
                  className="font-mono text-sm"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewingReceipt(null)}>
              Close
            </Button>
            {viewingReceipt?.imageUrl && (
              <Button
                onClick={() => {
                  window.open(viewingReceipt.imageUrl, "_blank");
                }}
              >
                Open in New Tab
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create PO from Scan Dialog */}
      <Dialog open={poDialogOpen} onOpenChange={setPoDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {scannedData ? "Create PO from Receipt" : "Create Purchase Order"}
            </DialogTitle>
            <DialogDescription>
              {scannedData
                ? "Review the scanned data and create a purchase order"
                : "Enter the purchase order details"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreatePO}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="po_vendor">Vendor *</Label>
                <Select
                  value={poForm.vendor_id}
                  onValueChange={(value) => setPoForm({ ...poForm, vendor_id: value })}
                >
                  <SelectTrigger id="po_vendor">
                    <SelectValue placeholder="Select vendor" />
                  </SelectTrigger>
                  <SelectContent>
                    {vendors.map((vendor) => (
                      <SelectItem key={vendor.id} value={vendor.id}>
                        {vendor.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {scannedData?.vendor_name && (
                  <p className="text-sm text-muted-foreground">
                    Detected vendor: {scannedData.vendor_name}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="po_project">Project (Optional)</Label>
                <Select
                  value={poForm.project_id}
                  onValueChange={(value) => setPoForm({ ...poForm, project_id: value })}
                >
                  <SelectTrigger id="po_project">
                    <SelectValue placeholder="Assign to project..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No project</SelectItem>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Linking to a project helps track job costs
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="po_date">Order Date</Label>
                <DatePicker
                  id="po_date"
                  value={poForm.order_date}
                  onChange={(value) => setPoForm({ ...poForm, order_date: value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="po_amount">Total Amount (BSD)</Label>
                <Input
                  id="po_amount"
                  type="number"
                  step="0.01"
                  value={poForm.total_amount}
                  onChange={(e) =>
                    setPoForm({ ...poForm, total_amount: parseFloat(e.target.value) || 0 })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="po_notes">Notes / Line Items</Label>
                <Textarea
                  id="po_notes"
                  rows={5}
                  value={poForm.notes}
                  onChange={(e) => setPoForm({ ...poForm, notes: e.target.value })}
                  placeholder="Purchase order details..."
                />
              </div>

              {scannedImageFile && (
                <div className="p-3 bg-muted rounded-lg flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">Receipt image will be attached</span>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setPoDialogOpen(false);
                  setScannedData(null);
                  setScannedImageFile(null);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={creatingPO}>
                {creatingPO && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create Purchase Order
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* View Vendor Dialog */}
      <Dialog open={viewVendorOpen} onOpenChange={setViewVendorOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5" />
              {selectedVendor?.name}
            </DialogTitle>
            <DialogDescription>Vendor details and information</DialogDescription>
          </DialogHeader>
          {selectedVendor && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground text-xs">Status</Label>
                  <div className="mt-1">
                    <Badge className={getVendorStatusColor(selectedVendor.status)}>
                      {selectedVendor.status}
                    </Badge>
                  </div>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">Payment Terms</Label>
                  <p className="font-medium">{selectedVendor.payment_terms || "-"}</p>
                </div>
              </div>

              {selectedVendor.contact_name && (
                <div>
                  <Label className="text-muted-foreground text-xs">Contact Person</Label>
                  <p className="font-medium">{selectedVendor.contact_name}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {selectedVendor.email && (
                  <div>
                    <Label className="text-muted-foreground text-xs">Email</Label>
                    <p className="font-medium flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      <a href={`mailto:${selectedVendor.email}`} className="text-primary hover:underline">
                        {selectedVendor.email}
                      </a>
                    </p>
                  </div>
                )}
                {selectedVendor.phone && (
                  <div>
                    <Label className="text-muted-foreground text-xs">Phone</Label>
                    <p className="font-medium flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      <a href={`tel:${selectedVendor.phone}`} className="text-primary hover:underline">
                        {selectedVendor.phone}
                      </a>
                    </p>
                  </div>
                )}
              </div>

              {selectedVendor.address && (
                <div>
                  <Label className="text-muted-foreground text-xs">Address</Label>
                  <p className="font-medium whitespace-pre-line">{selectedVendor.address}</p>
                </div>
              )}

              {((selectedVendor as any).tin || (selectedVendor as any).account_number) && (
                <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                  {(selectedVendor as any).tin && (
                    <div>
                      <Label className="text-muted-foreground text-xs">TIN (Tax ID)</Label>
                      <p className="font-medium font-mono">{(selectedVendor as any).tin}</p>
                    </div>
                  )}
                  {(selectedVendor as any).account_number && (
                    <div>
                      <Label className="text-muted-foreground text-xs">Account Number</Label>
                      <p className="font-medium font-mono">{(selectedVendor as any).account_number}</p>
                    </div>
                  )}
                </div>
              )}

              {selectedVendor.notes && (
                <div className="pt-2 border-t">
                  <Label className="text-muted-foreground text-xs">Notes</Label>
                  <p className="text-sm whitespace-pre-line">{selectedVendor.notes}</p>
                </div>
              )}

              <div className="pt-2 border-t text-xs text-muted-foreground">
                Created: {formatDate(selectedVendor.created_at)}
                {selectedVendor.updated_at && selectedVendor.updated_at !== selectedVendor.created_at && (
                  <> • Updated: {formatDate(selectedVendor.updated_at)}</>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewVendorOpen(false)}>
              Close
            </Button>
            <Button
              onClick={() => {
                setViewVendorOpen(false);
                if (selectedVendor) handleOpenEditVendor(selectedVendor);
              }}
            >
              <Pencil className="h-4 w-4 mr-2" />
              Edit Vendor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Vendor Dialog */}
      <Dialog open={editVendorOpen} onOpenChange={setEditVendorOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Vendor</DialogTitle>
            <DialogDescription>Update vendor information</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditVendor}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit_name">Company Name *</Label>
                <Input
                  id="edit_name"
                  placeholder="ABC Building Supplies"
                  value={editVendorForm.name}
                  onChange={(e) => setEditVendorForm({ ...editVendorForm, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_contact_name">Contact Person</Label>
                <Input
                  id="edit_contact_name"
                  placeholder="John Doe"
                  value={editVendorForm.contact_name}
                  onChange={(e) => setEditVendorForm({ ...editVendorForm, contact_name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit_email">Email</Label>
                  <Input
                    id="edit_email"
                    type="email"
                    placeholder="vendor@example.com"
                    value={editVendorForm.email}
                    onChange={(e) => setEditVendorForm({ ...editVendorForm, email: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_phone">Phone</Label>
                  <Input
                    id="edit_phone"
                    placeholder="(242) 555-1234"
                    value={editVendorForm.phone}
                    onChange={(e) => setEditVendorForm({ ...editVendorForm, phone: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_address">Address</Label>
                <Textarea
                  id="edit_address"
                  placeholder="Street address, city"
                  rows={2}
                  value={editVendorForm.address}
                  onChange={(e) => setEditVendorForm({ ...editVendorForm, address: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit_payment_terms">Payment Terms</Label>
                  <Input
                    id="edit_payment_terms"
                    placeholder="Net 30"
                    value={editVendorForm.payment_terms}
                    onChange={(e) => setEditVendorForm({ ...editVendorForm, payment_terms: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_status">Status</Label>
                  <Select
                    value={editVendorForm.status}
                    onValueChange={(value: Vendor["status"]) => setEditVendorForm({ ...editVendorForm, status: value })}
                  >
                    <SelectTrigger id="edit_status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                      <SelectItem value="blacklisted">Blacklisted</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit_tin">TIN (Tax ID)</Label>
                  <Input
                    id="edit_tin"
                    placeholder="100012345"
                    value={editVendorForm.tin}
                    onChange={(e) => setEditVendorForm({ ...editVendorForm, tin: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_account_number">Account Number</Label>
                  <Input
                    id="edit_account_number"
                    placeholder="Customer account #"
                    value={editVendorForm.account_number}
                    onChange={(e) => setEditVendorForm({ ...editVendorForm, account_number: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_notes">Notes</Label>
                <Textarea
                  id="edit_notes"
                  placeholder="Additional notes about this vendor..."
                  rows={3}
                  value={editVendorForm.notes}
                  onChange={(e) => setEditVendorForm({ ...editVendorForm, notes: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditVendorOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={editSubmitting}>
                {editSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* View PO Dialog */}
      <Dialog open={viewPOOpen} onOpenChange={setViewPOOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {selectedPO?.po_number}
            </DialogTitle>
            <DialogDescription>Purchase order details</DialogDescription>
          </DialogHeader>
          {selectedPO && (
            <div className="space-y-4 py-4">
              {/* Status & Project */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground text-xs">Status</Label>
                  <div className="mt-1">
                    <Badge className={getPOStatusColor(selectedPO.status)}>
                      {selectedPO.status.replace("_", " ")}
                    </Badge>
                  </div>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">Project</Label>
                  <p className="font-medium">
                    {selectedPO.projects?.name || (
                      <span className="text-muted-foreground">Not assigned</span>
                    )}
                  </p>
                </div>
              </div>

              {/* Vendor */}
              <div>
                <Label className="text-muted-foreground text-xs">Vendor</Label>
                <p className="font-medium flex items-center gap-2">
                  <Truck className="h-4 w-4" />
                  {selectedPO.vendors?.name}
                </p>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground text-xs">Order Date</Label>
                  <p className="font-medium">
                    {selectedPO.order_date ? formatDate(selectedPO.order_date) : "-"}
                  </p>
                </div>
                {selectedPO.actual_delivery_date && (
                  <div>
                    <Label className="text-muted-foreground text-xs">Delivery Date</Label>
                    <p className="font-medium">{formatDate(selectedPO.actual_delivery_date)}</p>
                  </div>
                )}
              </div>

              {/* Financials */}
              <div className="border rounded-lg p-4 bg-muted/30 space-y-2">
                <h4 className="font-medium text-sm">Financial Summary</h4>
                {selectedPO.subtotal_before_discount && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal (before discount)</span>
                    <span>{formatCurrency(selectedPO.subtotal_before_discount)}</span>
                  </div>
                )}
                {selectedPO.discount_amount > 0 && (
                  <div className="flex justify-between text-sm text-green-600">
                    <span>{selectedPO.discount_label || "Discount"}</span>
                    <span>-{formatCurrency(selectedPO.discount_amount)}</span>
                  </div>
                )}
                {selectedPO.subtotal && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>{formatCurrency(selectedPO.subtotal)}</span>
                  </div>
                )}
                {selectedPO.tax_amount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">VAT (10%)</span>
                    <span>{formatCurrency(selectedPO.tax_amount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-medium pt-2 border-t">
                  <span>Total</span>
                  <span>{formatCurrency(selectedPO.total_amount)}</span>
                </div>
              </div>

              {/* Vendor Invoice Number */}
              {selectedPO.vendor_invoice_number && (
                <div>
                  <Label className="text-muted-foreground text-xs">Vendor Invoice #</Label>
                  <p className="font-mono">{selectedPO.vendor_invoice_number}</p>
                </div>
              )}

              {/* Notes */}
              {selectedPO.notes && (
                <div>
                  <Label className="text-muted-foreground text-xs">Notes</Label>
                  <p className="text-sm whitespace-pre-line bg-muted/50 p-3 rounded-lg max-h-48 overflow-y-auto">
                    {selectedPO.notes}
                  </p>
                </div>
              )}

              {/* Receipt Image */}
              {selectedPO.receipt_image_path && (
                <div>
                  <Label className="text-muted-foreground text-xs mb-2 block">Receipt</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setViewPOOpen(false);
                      handleViewReceipt(selectedPO);
                    }}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    View Receipt Image
                  </Button>
                </div>
              )}

              {/* Timestamps */}
              <div className="pt-2 border-t text-xs text-muted-foreground">
                Created: {formatDate(selectedPO.created_at)}
                {selectedPO.updated_at && selectedPO.updated_at !== selectedPO.created_at && (
                  <> • Updated: {formatDate(selectedPO.updated_at)}</>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewPOOpen(false)}>
              Close
            </Button>
            <Button
              onClick={() => {
                setViewPOOpen(false);
                if (selectedPO) handleEditPO(selectedPO);
              }}
            >
              <Pencil className="h-4 w-4 mr-2" />
              Edit PO
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit PO Dialog */}
      <Dialog open={editPOOpen} onOpenChange={setEditPOOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Purchase Order</DialogTitle>
            <DialogDescription>
              {selectedPO?.po_number} - Update purchase order details
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdatePO}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit_po_vendor">Vendor *</Label>
                <Select
                  value={editPOForm.vendor_id}
                  onValueChange={(value) => setEditPOForm({ ...editPOForm, vendor_id: value })}
                >
                  <SelectTrigger id="edit_po_vendor">
                    <SelectValue placeholder="Select vendor" />
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

              <div className="space-y-2">
                <Label htmlFor="edit_po_project">Project</Label>
                <Select
                  value={editPOForm.project_id}
                  onValueChange={(value) => setEditPOForm({ ...editPOForm, project_id: value })}
                >
                  <SelectTrigger id="edit_po_project">
                    <SelectValue placeholder="Assign to project..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No project</SelectItem>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit_po_date">Order Date</Label>
                  <DatePicker
                    id="edit_po_date"
                    value={editPOForm.order_date}
                    onChange={(value) => setEditPOForm({ ...editPOForm, order_date: value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_po_status">Status</Label>
                  <Select
                    value={editPOForm.status}
                    onValueChange={(value) => setEditPOForm({ ...editPOForm, status: value })}
                  >
                    <SelectTrigger id="edit_po_status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="ordered">Ordered</SelectItem>
                      <SelectItem value="received">Received</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit_po_amount">Total Amount (BSD)</Label>
                <Input
                  id="edit_po_amount"
                  type="number"
                  step="0.01"
                  value={editPOForm.total_amount}
                  onChange={(e) =>
                    setEditPOForm({ ...editPOForm, total_amount: parseFloat(e.target.value) || 0 })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit_po_notes">Notes</Label>
                <Textarea
                  id="edit_po_notes"
                  rows={4}
                  value={editPOForm.notes}
                  onChange={(e) => setEditPOForm({ ...editPOForm, notes: e.target.value })}
                  placeholder="Purchase order notes..."
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditPOOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={editPOSubmitting}>
                {editPOSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
