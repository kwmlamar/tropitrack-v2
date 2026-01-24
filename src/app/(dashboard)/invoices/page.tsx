"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import {
  Plus,
  Search,
  MoreHorizontal,
  Eye,
  Pencil,
  Trash2,
  Receipt,
  DollarSign,
  AlertCircle,
  CheckCircle,
  Clock,
  Send,
  CreditCard,
} from "lucide-react";
import type { Invoice, InvoiceStatus } from "@/types";

type AgingBucket = "all" | "current" | "1-30" | "31-60" | "61-90" | "90+";

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<AgingBucket>("all");
  const supabase = createClient();
  const { toast } = useToast();
  const { profile } = useAuth();

  useEffect(() => {
    if (profile?.company_id) {
      fetchInvoices();
    }
  }, [profile?.company_id]);

  const fetchInvoices = async () => {
    if (!profile?.company_id) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("company_id", profile.company_id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setInvoices(data || []);
    } catch (error) {
      console.error("Error fetching invoices:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this invoice? This action cannot be undone.")) return;

    try {
      // Check user permissions first
      const isAdmin = profile?.role === "admin" || profile?.role === "project_manager";
      if (!isAdmin) {
        toast({
          title: "Permission denied",
          description: "Only administrators and project managers can delete invoices.",
          variant: "destructive",
        });
        return;
      }

      const { data, error } = await supabase
        .from("invoices")
        .delete()
        .eq("id", id)
        .select();
      
      if (error) {
        console.error("Error deleting invoice:", error);
        toast({
          title: "Error deleting invoice",
          description: error.message || "An error occurred while deleting the invoice.",
          variant: "destructive",
        });
        return;
      }

      // Check if anything was actually deleted
      if (!data || data.length === 0) {
        toast({
          title: "Cannot delete invoice",
          description: "The invoice could not be deleted. This may be due to database permissions. Please ensure the RLS policy allows deletion for your role.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Invoice deleted",
        description: "The invoice has been successfully deleted.",
        variant: "success",
      });

      // Refresh the invoices list
      fetchInvoices();
    } catch (error: any) {
      console.error("Error deleting invoice:", error);
      const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
      toast({
        title: "Error deleting invoice",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const handleStatusChange = async (id: string, newStatus: InvoiceStatus) => {
    try {
      const updateData: Partial<Invoice> = { status: newStatus };
      if (newStatus === "sent") updateData.sent_at = new Date().toISOString();

      const { error } = await supabase.from("invoices").update(updateData).eq("id", id);

      if (error) throw error;

      setInvoices(invoices.map((i) => (i.id === id ? { ...i, ...updateData } : i)));
      toast({
        title: "Status updated",
        description: `Invoice marked as ${newStatus}.`,
      });
    } catch (error: any) {
      console.error("Error updating status:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to update status",
        variant: "destructive",
      });
    }
  };

  // Calculate aging bucket for each invoice
  const getAgingBucket = (invoice: Invoice): AgingBucket => {
    if (invoice.status === "paid") return "current";

    const today = new Date();
    const dueDate = new Date(invoice.due_date);
    const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

    if (daysOverdue <= 0) return "current";
    if (daysOverdue <= 30) return "1-30";
    if (daysOverdue <= 60) return "31-60";
    if (daysOverdue <= 90) return "61-90";
    return "90+";
  };

  // Filter invoices by search and aging bucket
  const filteredInvoices = invoices.filter((invoice) => {
    const matchesSearch =
      invoice.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.client_name.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    if (activeTab === "all") return true;
    return getAgingBucket(invoice) === activeTab;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "draft":
        return "bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-300";
      case "sent":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
      case "viewed":
        return "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300";
      case "paid":
        return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
      case "partial":
        return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
      case "overdue":
        return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
      case "cancelled":
      case "void":
        return "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400";
      default:
        return "bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-300";
    }
  };

  // Calculate stats
  const stats = {
    total: invoices.length,
    outstanding: invoices
      .filter((i) => !["paid", "cancelled", "void"].includes(i.status))
      .reduce((sum, i) => sum + i.balance_due, 0),
    overdue: invoices
      .filter((i) => getAgingBucket(i) !== "current" && i.status !== "paid")
      .reduce((sum, i) => sum + i.balance_due, 0),
    paid: invoices.filter((i) => i.status === "paid").reduce((sum, i) => sum + i.total_amount, 0),
  };

  const agingCounts = {
    all: invoices.length,
    current: invoices.filter((i) => getAgingBucket(i) === "current" || i.status === "paid").length,
    "1-30": invoices.filter((i) => getAgingBucket(i) === "1-30" && i.status !== "paid").length,
    "31-60": invoices.filter((i) => getAgingBucket(i) === "31-60" && i.status !== "paid").length,
    "61-90": invoices.filter((i) => getAgingBucket(i) === "61-90" && i.status !== "paid").length,
    "90+": invoices.filter((i) => getAgingBucket(i) === "90+" && i.status !== "paid").length,
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Header title="Invoices" description="Create and manage client invoices">
        <Link href="/invoices/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Invoice
          </Button>
        </Link>
      </Header>

      <div className="flex-1 p-6 space-y-6">
        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-100 dark:bg-blue-950/50 rounded-lg">
                  <Receipt className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Invoices</p>
                  <p className="text-2xl font-bold">{stats.total}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-amber-100 dark:bg-amber-950/50 rounded-lg">
                  <Clock className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Outstanding</p>
                  <p className="text-2xl font-bold">{formatCurrency(stats.outstanding)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-red-100 dark:bg-red-950/50 rounded-lg">
                  <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Overdue</p>
                  <p className="text-2xl font-bold">{formatCurrency(stats.overdue)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-green-100 dark:bg-green-950/50 rounded-lg">
                  <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Collected</p>
                  <p className="text-2xl font-bold">{formatCurrency(stats.paid)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <Card>
          <CardContent className="py-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search invoices..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </CardContent>
        </Card>

        {/* Invoices with Aging Tabs */}
        <Card>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as AgingBucket)}>
            <div className="border-b px-4">
              <TabsList className="h-12">
                <TabsTrigger value="all">All ({agingCounts.all})</TabsTrigger>
                <TabsTrigger value="current">Current ({agingCounts.current})</TabsTrigger>
                <TabsTrigger value="1-30" className="text-amber-600 dark:text-amber-400">
                  1-30 Days ({agingCounts["1-30"]})
                </TabsTrigger>
                <TabsTrigger value="31-60" className="text-orange-600 dark:text-orange-400">
                  31-60 Days ({agingCounts["31-60"]})
                </TabsTrigger>
                <TabsTrigger value="61-90" className="text-red-600 dark:text-red-400">
                  61-90 Days ({agingCounts["61-90"]})
                </TabsTrigger>
                <TabsTrigger value="90+" className="text-red-700 dark:text-red-400">
                  90+ Days ({agingCounts["90+"]})
                </TabsTrigger>
              </TabsList>
            </div>

            <CardContent className="p-0">
              {loading ? (
                <div className="p-8 text-center">
                  <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
                  <p className="mt-4 text-muted-foreground">Loading invoices...</p>
                </div>
              ) : filteredInvoices.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Issue Date</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInvoices.map((invoice) => (
                      <TableRow key={invoice.id}>
                        <TableCell>
                          <Link
                            href={`/invoices/${invoice.id}`}
                            className="font-medium hover:text-primary"
                          >
                            {invoice.invoice_number}
                          </Link>
                        </TableCell>
                        <TableCell>{invoice.client_name}</TableCell>
                        <TableCell>{formatDate(invoice.issue_date)}</TableCell>
                        <TableCell>
                          <span
                            className={
                              getAgingBucket(invoice) !== "current" && invoice.status !== "paid"
                                ? "text-red-600 dark:text-red-400 font-medium"
                                : ""
                            }
                          >
                            {formatDate(invoice.due_date)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(invoice.total_amount)}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {invoice.balance_due > 0 ? (
                            <span className="text-amber-600 dark:text-amber-400">
                              {formatCurrency(invoice.balance_due)}
                            </span>
                          ) : (
                            <span className="text-green-600 dark:text-green-400">{formatCurrency(0)}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge className={getStatusColor(invoice.status)}>{invoice.status}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild>
                                <Link href={`/invoices/${invoice.id}`}>
                                  <Eye className="h-4 w-4 mr-2" />
                                  View Details
                                </Link>
                              </DropdownMenuItem>
                              {invoice.status === "draft" && (
                                <>
                                  <DropdownMenuItem asChild>
                                    <Link href={`/invoices/${invoice.id}/edit`}>
                                      <Pencil className="h-4 w-4 mr-2" />
                                      Edit
                                    </Link>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => handleStatusChange(invoice.id, "sent")}
                                  >
                                    <Send className="h-4 w-4 mr-2" />
                                    Mark as Sent
                                  </DropdownMenuItem>
                                </>
                              )}
                              {invoice.balance_due > 0 && invoice.status !== "draft" && (
                                <DropdownMenuItem asChild>
                                  <Link href={`/invoices/${invoice.id}?payment=true`}>
                                    <CreditCard className="h-4 w-4 mr-2" />
                                    Record Payment
                                  </Link>
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => handleDelete(invoice.id)}
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
                  <Receipt className="h-12 w-12 mx-auto text-blue-600 dark:text-blue-400 mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No invoices found</h3>
                  <p className="text-muted-foreground mb-4">
                    {searchTerm
                      ? "Try adjusting your search"
                      : "Get started by creating your first invoice"}
                  </p>
                  <Link href="/invoices/new">
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Invoice
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}
