"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Search,
  MoreHorizontal,
  Eye,
  Pencil,
  Trash2,
  FileText,
  Filter,
  Send,
  CheckCircle,
  XCircle,
  ArrowRightCircle,
  DollarSign,
  Clock,
} from "lucide-react";
import type { Estimate, EstimateStatus } from "@/types";

export default function EstimatesPage() {
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const supabase = createClient();
  const { toast } = useToast();

  useEffect(() => {
    fetchEstimates();
  }, [statusFilter]);

  const fetchEstimates = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("estimates")
        .select("*")
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;

      if (error) throw error;
      setEstimates(data || []);
    } catch (error) {
      console.error("Error fetching estimates:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this estimate?")) return;

    try {
      const { error } = await supabase.from("estimates").delete().eq("id", id);
      if (error) throw error;
      setEstimates(estimates.filter((e) => e.id !== id));
      toast({
        title: "Estimate deleted",
        description: "The estimate has been removed.",
      });
    } catch (error: any) {
      console.error("Error deleting estimate:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete estimate",
        variant: "destructive",
      });
    }
  };

  const handleStatusChange = async (id: string, newStatus: EstimateStatus) => {
    try {
      const updateData: Partial<Estimate> = { status: newStatus };

      // Set timestamps based on status
      if (newStatus === "sent") updateData.sent_at = new Date().toISOString();
      if (newStatus === "approved") updateData.approved_at = new Date().toISOString();
      if (newStatus === "rejected") updateData.rejected_at = new Date().toISOString();

      const { error } = await supabase
        .from("estimates")
        .update(updateData)
        .eq("id", id);

      if (error) throw error;

      setEstimates(
        estimates.map((e) =>
          e.id === id ? { ...e, ...updateData } : e
        )
      );

      toast({
        title: "Status updated",
        description: `Estimate marked as ${newStatus}.`,
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

  const filteredEstimates = estimates.filter(
    (estimate) =>
      estimate.estimate_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      estimate.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      estimate.client_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case "draft":
        return "bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-300";
      case "sent":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
      case "approved":
        return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
      case "rejected":
        return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
      case "converted":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300";
      case "expired":
        return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
      default:
        return "bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-300";
    }
  };

  const statusOptions = [
    { value: "all", label: "All Status" },
    { value: "draft", label: "Draft" },
    { value: "sent", label: "Sent" },
    { value: "approved", label: "Approved" },
    { value: "rejected", label: "Rejected" },
    { value: "converted", label: "Converted" },
    { value: "expired", label: "Expired" },
  ];

  // Calculate stats
  const stats = {
    total: estimates.length,
    draft: estimates.filter((e) => e.status === "draft").length,
    sent: estimates.filter((e) => e.status === "sent").length,
    approved: estimates.filter((e) => e.status === "approved").length,
    totalValue: estimates
      .filter((e) => ["sent", "approved"].includes(e.status))
      .reduce((sum, e) => sum + e.total_amount, 0),
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Header title="Estimates" description="Create and manage project estimates">
        <Link href="/estimates/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Estimate
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
                  <FileText className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Estimates</p>
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
                  <p className="text-sm text-muted-foreground">Pending Review</p>
                  <p className="text-2xl font-bold">{stats.sent}</p>
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
                  <p className="text-sm text-muted-foreground">Approved</p>
                  <p className="text-2xl font-bold">{stats.approved}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-purple-100 dark:bg-purple-950/50 rounded-lg">
                  <DollarSign className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Pipeline Value</p>
                  <p className="text-2xl font-bold">{formatCurrency(stats.totalValue)}</p>
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
                  placeholder="Search estimates..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Estimates Table */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 text-center">
                <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
                <p className="mt-4 text-muted-foreground">Loading estimates...</p>
              </div>
            ) : filteredEstimates.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Estimate #</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEstimates.map((estimate) => (
                    <TableRow key={estimate.id}>
                      <TableCell>
                        <Link
                          href={`/estimates/${estimate.id}`}
                          className="font-medium hover:text-primary"
                        >
                          {estimate.estimate_number}
                        </Link>
                      </TableCell>
                      <TableCell>{estimate.title}</TableCell>
                      <TableCell>{estimate.client_name}</TableCell>
                      <TableCell>{formatDate(estimate.issue_date)}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(estimate.total_amount)}
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(estimate.status)}>
                          {estimate.status}
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
                            <DropdownMenuItem asChild>
                              <Link href={`/estimates/${estimate.id}`}>
                                <Eye className="h-4 w-4 mr-2" />
                                View Details
                              </Link>
                            </DropdownMenuItem>
                            {estimate.status === "draft" && (
                              <DropdownMenuItem asChild>
                                <Link href={`/estimates/${estimate.id}/edit`}>
                                  <Pencil className="h-4 w-4 mr-2" />
                                  Edit
                                </Link>
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            {estimate.status === "draft" && (
                              <DropdownMenuItem
                                onClick={() => handleStatusChange(estimate.id, "sent")}
                              >
                                <Send className="h-4 w-4 mr-2" />
                                Mark as Sent
                              </DropdownMenuItem>
                            )}
                            {estimate.status === "sent" && (
                              <>
                                <DropdownMenuItem
                                  onClick={() => handleStatusChange(estimate.id, "approved")}
                                >
                                  <CheckCircle className="h-4 w-4 mr-2" />
                                  Mark Approved
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleStatusChange(estimate.id, "rejected")}
                                >
                                  <XCircle className="h-4 w-4 mr-2" />
                                  Mark Rejected
                                </DropdownMenuItem>
                              </>
                            )}
                            {estimate.status === "approved" && !estimate.project_id && (
                              <DropdownMenuItem asChild>
                                <Link href={`/estimates/${estimate.id}?convert=true`}>
                                  <ArrowRightCircle className="h-4 w-4 mr-2" />
                                  Convert to Project
                                </Link>
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => handleDelete(estimate.id)}
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
                <FileText className="h-12 w-12 mx-auto text-blue-600 dark:text-blue-400 mb-4" />
                <h3 className="text-lg font-semibold mb-2">No estimates found</h3>
                <p className="text-muted-foreground mb-4">
                  {searchTerm || statusFilter !== "all"
                    ? "Try adjusting your search or filter"
                    : "Get started by creating your first estimate"}
                </p>
                <Link href="/estimates/new">
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Estimate
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
