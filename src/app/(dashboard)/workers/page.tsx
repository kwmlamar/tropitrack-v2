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
import { formatCurrency, formatDate, getWorkerStatusColor } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import {
  Plus,
  Search,
  MoreHorizontal,
  Eye,
  Pencil,
  Trash2,
  Users,
  Filter,
} from "lucide-react";
import type { Worker } from "@/types";

export default function WorkersPage() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const supabase = createClient();
  const { toast } = useToast();
  const { profile } = useAuth();

  useEffect(() => {
    if (profile?.company_id) {
      fetchWorkers();
    }
  }, [statusFilter, profile?.company_id]);

  const fetchWorkers = async () => {
    if (!profile?.company_id) return;
    
    setLoading(true);
    try {
      let query = supabase
        .from("workers")
        .select("*")
        .eq("company_id", profile.company_id)
        .order("last_name", { ascending: true });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;

      if (error) throw error;
      setWorkers(data || []);
    } catch (error) {
      console.error("Error fetching workers:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this worker? This action cannot be undone.")) return;

    try {
      // Check user permissions first
      const isAdmin = profile?.role === "admin" || profile?.role === "project_manager";
      if (!isAdmin) {
        toast({
          title: "Permission denied",
          description: "Only administrators and project managers can delete workers.",
          variant: "destructive",
        });
        return;
      }

      // Check if worker has time entries
      const { count: timeEntriesCount } = await supabase
        .from("time_entries")
        .select("*", { count: "exact", head: true })
        .eq("worker_id", id);

      if (timeEntriesCount && timeEntriesCount > 0) {
        toast({
          title: "Cannot delete worker",
          description: `This worker has ${timeEntriesCount} time entry/entries. Consider marking them as inactive or terminated instead.`,
          variant: "destructive",
        });
        return;
      }

      // Check if worker has payroll entries
      const { count: payrollCount } = await supabase
        .from("payroll_entries")
        .select("*", { count: "exact", head: true })
        .eq("worker_id", id);

      if (payrollCount && payrollCount > 0) {
        toast({
          title: "Cannot delete worker",
          description: `This worker has ${payrollCount} payroll entry/entries. Consider marking them as inactive or terminated instead.`,
          variant: "destructive",
        });
        return;
      }

      // Attempt to delete
      const { data, error } = await supabase
        .from("workers")
        .delete()
        .eq("id", id)
        .select();
      
      if (error) {
        console.error("Error deleting worker:", error);
        toast({
          title: "Error deleting worker",
          description: error.message || "An error occurred while deleting the worker.",
          variant: "destructive",
        });
        return;
      }

      // Check if anything was actually deleted
      // If RLS blocks the delete, data will be null or empty
      if (!data || data.length === 0) {
        toast({
          title: "Cannot delete worker",
          description: "The worker could not be deleted. This may be due to database permissions. Please ensure the RLS policy allows deletion for your role.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Worker deleted",
        description: "The worker has been successfully deleted.",
        variant: "success",
      });

      // Refresh the workers list
      fetchWorkers();
    } catch (error) {
      console.error("Error deleting worker:", error);
      const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
      toast({
        title: "Error deleting worker",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const filteredWorkers = workers.filter((worker) =>
    `${worker.first_name} ${worker.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (worker.email?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
    (worker.phone || "").includes(searchTerm)
  );

  const statusOptions = [
    { value: "all", label: "All Status" },
    { value: "active", label: "Active" },
    { value: "inactive", label: "Inactive" },
    { value: "terminated", label: "Terminated" },
  ];

  return (
    <div className="flex flex-col min-h-screen">
      <Header title="Workers" description="Manage your workforce">
        <Link href="/workers/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Add Worker
          </Button>
        </Link>
      </Header>

      <div className="flex-1 p-6 space-y-6">
        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="p-2 rounded-lg bg-green-100 dark:bg-green-950/50">
                  <Users className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Active Workers</p>
                  <p className="text-2xl font-bold">
                    {workers.filter((w) => w.status === "active").length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-950/50">
                  <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Hourly Workers</p>
                  <p className="text-2xl font-bold">
                    {workers.filter((w) => w.worker_type === "hourly").length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-950/50">
                  <Users className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Salaried Workers</p>
                  <p className="text-2xl font-bold">
                    {workers.filter((w) => w.worker_type === "salary").length}
                  </p>
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
                  placeholder="Search workers..."
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

        {/* Workers Table */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 text-center">
                <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
                <p className="mt-4 text-muted-foreground">Loading workers...</p>
              </div>
            ) : filteredWorkers.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Rate</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Hire Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredWorkers.map((worker) => (
                    <TableRow key={worker.id}>
                      <TableCell>
                        <Link
                          href={`/workers/${worker.id}`}
                          className="font-medium hover:text-primary"
                        >
                          {worker.first_name} {worker.last_name}
                        </Link>
                        {worker.email && (
                          <p className="text-sm text-muted-foreground">{worker.email}</p>
                        )}
                      </TableCell>
                      <TableCell className="capitalize">{worker.worker_type}</TableCell>
                      <TableCell>
                        {worker.worker_type === "hourly" && worker.hourly_rate
                          ? `${formatCurrency(worker.hourly_rate)}/hr`
                          : worker.salary_amount
                          ? `${formatCurrency(worker.salary_amount)}/yr`
                          : "-"}
                      </TableCell>
                      <TableCell>{worker.phone || "-"}</TableCell>
                      <TableCell>
                        <Badge className={getWorkerStatusColor(worker.status)}>
                          {worker.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDate(worker.hire_date)}</TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={`/workers/${worker.id}`}>
                                <Eye className="h-4 w-4 mr-2" />
                                View Details
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/workers/${worker.id}/edit`}>
                                <Pencil className="h-4 w-4 mr-2" />
                                Edit
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => handleDelete(worker.id)}
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
                <Users className="h-12 w-12 mx-auto text-green-600 dark:text-green-400 mb-4" />
                <h3 className="text-lg font-semibold mb-2">No workers found</h3>
                <p className="text-muted-foreground mb-4">
                  {searchTerm || statusFilter !== "all"
                    ? "Try adjusting your search or filter"
                    : "Get started by adding your first worker"}
                </p>
                <Link href="/workers/new">
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Worker
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
