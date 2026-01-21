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
} from "lucide-react";
import { ReceiptScannerDialog } from "@/components/receipt-scanner/receipt-scanner-dialog";
import type { ParsedReceipt } from "@/lib/ocr/receipt-parser";
import type { Vendor, PurchaseOrder } from "@/types";

export default function VendorsPage() {
  const { toast } = useToast();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [poDialogOpen, setPoDialogOpen] = useState(false);
  const [creatingPO, setCreatingPO] = useState(false);
  const [scannedData, setScannedData] = useState<ParsedReceipt | null>(null);
  const [scannedImageFile, setScannedImageFile] = useState<File | null>(null);
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
    order_date: new Date().toISOString().split("T")[0],
    description: "",
    total_amount: 0,
    notes: "",
  });

  useEffect(() => {
    fetchData();
  }, []);

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
        const fileName = `receipts/${poNumber}-${Date.now()}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from("documents")
          .upload(fileName, scannedImageFile);

        if (!uploadError) {
          receiptImagePath = fileName;
        }
      }

      // Create purchase order
      const { error } = await supabase.from("purchase_orders").insert({
        po_number: poNumber,
        vendor_id: poForm.vendor_id,
        order_date: poForm.order_date,
        status: "draft",
        total_amount: poForm.total_amount,
        notes: poForm.notes,
        receipt_image_path: receiptImagePath,
        ocr_raw_text: scannedData?.raw_text || null,
      });

      if (error) throw error;

      toast({
        title: "Purchase Order created",
        description: `${poNumber} has been created from the scanned receipt.`,
        variant: "success",
      });

      setPoDialogOpen(false);
      setScannedData(null);
      setScannedImageFile(null);
      setPoForm({
        vendor_id: "",
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
    setLoading(true);
    try {
      const { data: vendorsData } = await supabase
        .from("vendors")
        .select("*")
        .order("name");
      setVendors(vendorsData || []);

      const { data: poData } = await supabase
        .from("purchase_orders")
        .select("*, vendors(name)")
        .order("created_at", { ascending: false })
        .limit(20);
      setPurchaseOrders(poData || []);
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
      const { error } = await supabase.from("vendors").insert({
        ...vendorForm,
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
    if (!confirm("Are you sure you want to delete this vendor?")) return;

    try {
      const { error } = await supabase.from("vendors").delete().eq("id", id);
      if (error) throw error;
      setVendors(vendors.filter((v) => v.id !== id));
      toast({ title: "Vendor deleted" });
    } catch (error) {
      console.error("Error deleting vendor:", error);
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
                                <DropdownMenuItem>
                                  <Eye className="h-4 w-4 mr-2" />
                                  View Details
                                </DropdownMenuItem>
                                <DropdownMenuItem>
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
                  <Button variant="outline" onClick={() => setScannerOpen(true)}>
                    <ScanLine className="h-4 w-4 mr-2" />
                    Scan Receipt
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
                        <TableHead>Status</TableHead>
                        <TableHead>Order Date</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {purchaseOrders.map((po: any) => (
                        <TableRow key={po.id}>
                          <TableCell className="font-medium">{po.po_number}</TableCell>
                          <TableCell>{po.vendors?.name}</TableCell>
                          <TableCell>
                            <Badge className={getPOStatusColor(po.status)}>
                              {po.status.replace("_", " ")}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {po.order_date ? formatDate(po.order_date) : "-"}
                          </TableCell>
                          <TableCell>{formatCurrency(po.total_amount)}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon">
                              <Eye className="h-4 w-4" />
                            </Button>
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
        </Tabs>
      </div>

      {/* Receipt Scanner Dialog */}
      <ReceiptScannerDialog
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onScanComplete={handleScanComplete}
      />

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
    </div>
  );
}
