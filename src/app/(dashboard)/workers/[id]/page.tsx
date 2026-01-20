"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate, getWorkerStatusColor } from "@/lib/utils";
import {
  ArrowLeft,
  Pencil,
  Trash2,
  User,
  Mail,
  Phone,
  MapPin,
  Calendar,
  DollarSign,
  Clock,
  Briefcase,
  Shield,
  Wallet,
  CheckCircle,
  XCircle,
  Loader2,
  FileText,
} from "lucide-react";
import type { Worker, TimeEntry, Project } from "@/types";

interface WorkerStats {
  totalHoursAllTime: number;
  totalHoursThisYear: number;
  totalEarningsAllTime: number;
  activeProjects: number;
}

interface TimeEntryWithProject extends TimeEntry {
  project?: {
    name: string;
  };
}

export default function WorkerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const [worker, setWorker] = useState<Worker | null>(null);
  const [stats, setStats] = useState<WorkerStats | null>(null);
  const [recentTimesheets, setRecentTimesheets] = useState<TimeEntryWithProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const supabase = createClient();

  const workerId = params.id as string;

  useEffect(() => {
    fetchWorkerData();
  }, [workerId]);

  const fetchWorkerData = async () => {
    setLoading(true);
    try {
      // Fetch worker details
      const { data: workerData, error: workerError } = await supabase
        .from("workers")
        .select("*")
        .eq("id", workerId)
        .single();

      if (workerError) throw workerError;
      setWorker(workerData);

      // Fetch time entries for stats
      const currentYear = new Date().getFullYear();
      const yearStart = `${currentYear}-01-01`;

      const { data: allTimeEntries } = await supabase
        .from("time_entries")
        .select("regular_hours, overtime_hours, date")
        .eq("worker_id", workerId);

      const { data: yearTimeEntries } = await supabase
        .from("time_entries")
        .select("regular_hours, overtime_hours")
        .eq("worker_id", workerId)
        .gte("date", yearStart);

      // Fetch recent timesheets with project info
      const { data: recentEntries } = await supabase
        .from("time_entries")
        .select(`
          *,
          project:projects(name)
        `)
        .eq("worker_id", workerId)
        .order("date", { ascending: false })
        .limit(10);

      // Fetch active projects count
      const { data: activeProjects } = await supabase
        .from("time_entries")
        .select("project_id")
        .eq("worker_id", workerId)
        .gte("date", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]);

      // Calculate stats
      const totalHoursAllTime = allTimeEntries?.reduce(
        (sum, e) => sum + (e.regular_hours || 0) + (e.overtime_hours || 0),
        0
      ) || 0;

      const totalHoursThisYear = yearTimeEntries?.reduce(
        (sum, e) => sum + (e.regular_hours || 0) + (e.overtime_hours || 0),
        0
      ) || 0;

      const hourlyRate = workerData.hourly_rate || 0;
      const otMultiplier = workerData.overtime_rate_multiplier || 1.5;
      const totalEarningsAllTime = allTimeEntries?.reduce(
        (sum, e) => sum + ((e.regular_hours || 0) * hourlyRate) + ((e.overtime_hours || 0) * hourlyRate * otMultiplier),
        0
      ) || 0;

      const uniqueProjects = new Set(activeProjects?.map((p) => p.project_id) || []);

      setStats({
        totalHoursAllTime,
        totalHoursThisYear,
        totalEarningsAllTime,
        activeProjects: uniqueProjects.size,
      });

      setRecentTimesheets(recentEntries || []);
    } catch (error) {
      console.error("Error fetching worker:", error);
      toast({
        title: "Error",
        description: "Failed to load worker details",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      // Check if worker has time entries
      const { count } = await supabase
        .from("time_entries")
        .select("*", { count: "exact", head: true })
        .eq("worker_id", workerId);

      if (count && count > 0) {
        toast({
          title: "Cannot delete worker",
          description: `This worker has ${count} time entries. Consider marking them as inactive instead.`,
          variant: "destructive",
        });
        setDeleting(false);
        return;
      }

      const { error } = await supabase.from("workers").delete().eq("id", workerId);

      if (error) throw error;

      toast({
        title: "Worker deleted",
        description: "The worker has been successfully deleted.",
        variant: "success",
      });

      router.push("/workers");
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "An error occurred";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header title="Worker Details" description="Loading...">
          <Link href="/workers">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
        </Header>
        <div className="flex-1 p-6 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
            <p className="mt-4 text-muted-foreground">Loading worker details...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!worker) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header title="Worker Not Found" description="The requested worker could not be found">
          <Link href="/workers">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Workers
            </Button>
          </Link>
        </Header>
        <div className="flex-1 p-6 flex items-center justify-center">
          <div className="text-center">
            <User className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Worker not found</h3>
            <p className="text-muted-foreground mb-4">
              The worker you&apos;re looking for doesn&apos;t exist or has been removed.
            </p>
            <Link href="/workers">
              <Button>Go to Workers</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const overtimeRate = (worker.hourly_rate || 0) * (worker.overtime_rate_multiplier || 1.5);

  return (
    <div className="flex flex-col min-h-screen">
      <Header
        title={`${worker.first_name} ${worker.last_name}`}
        description={`${worker.worker_type.charAt(0).toUpperCase() + worker.worker_type.slice(1)} Worker`}
      >
        <div className="flex gap-2">
          <Link href="/workers">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <Link href={`/workers/${workerId}/edit`}>
            <Button>
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </Button>
          </Link>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Worker</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete {worker.first_name} {worker.last_name}?
                  This action cannot be undone. Workers with time entries cannot be deleted.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  disabled={deleting}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </Header>

      <div className="flex-1 p-6 space-y-6">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Basic Information */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                Basic Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Full Name</p>
                  <p className="font-medium">{worker.first_name} {worker.last_name}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge className={getWorkerStatusColor(worker.status)}>
                    {worker.status}
                  </Badge>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Mail className="h-3.5 w-3.5" /> Email
                  </p>
                  <p className="font-medium">{worker.email || "-"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" /> Phone
                  </p>
                  <p className="font-medium">{worker.phone || "-"}</p>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" /> Address
                  </p>
                  <p className="font-medium">{worker.address || "-"}</p>
                </div>
              </div>

              <Separator />

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Briefcase className="h-3.5 w-3.5" /> Worker Type
                  </p>
                  <p className="font-medium capitalize">{worker.worker_type}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" /> Hire Date
                  </p>
                  <p className="font-medium">{formatDate(worker.hire_date)}</p>
                </div>
                {worker.worker_type === "hourly" && (
                  <>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <DollarSign className="h-3.5 w-3.5" /> Hourly Rate
                      </p>
                      <p className="font-medium">{formatCurrency(worker.hourly_rate || 0)}/hr</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" /> Overtime Rate
                      </p>
                      <p className="font-medium">
                        {formatCurrency(overtimeRate)}/hr ({worker.overtime_rate_multiplier}x)
                      </p>
                    </div>
                  </>
                )}
                {worker.worker_type === "salary" && (
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <DollarSign className="h-3.5 w-3.5" /> Annual Salary
                    </p>
                    <p className="font-medium">{formatCurrency(worker.salary_amount || 0)}/yr</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Work Statistics */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                Work Statistics
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Total Hours (All Time)</span>
                  <span className="font-bold text-lg">{stats?.totalHoursAllTime.toFixed(1)} hrs</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Total Hours (This Year)</span>
                  <span className="font-bold text-lg">{stats?.totalHoursThisYear.toFixed(1)} hrs</span>
                </div>
                <Separator />
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Total Earnings</span>
                  <span className="font-bold text-lg text-green-600">
                    {formatCurrency(stats?.totalEarningsAllTime || 0)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Active Projects (30 days)</span>
                  <span className="font-bold text-lg">{stats?.activeProjects || 0}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* NIB & Compliance */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-primary" />
                NIB & Compliance
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm">NIB Deductions</span>
                {worker.nib_enabled !== false ? (
                  <Badge variant="success" className="flex items-center gap-1">
                    <CheckCircle className="h-3 w-3" />
                    Enabled
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <XCircle className="h-3 w-3" />
                    Disabled
                  </Badge>
                )}
              </div>
              {worker.nib_number && (
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">NIB Number</p>
                  <p className="font-medium">{worker.nib_number}</p>
                </div>
              )}
              {worker.national_insurance_number && (
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">National Insurance #</p>
                  <p className="font-medium">{worker.national_insurance_number}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Emergency Contact */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                Emergency Contact
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {worker.emergency_contact_name || worker.emergency_contact_phone ? (
                <>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Contact Name</p>
                    <p className="font-medium">{worker.emergency_contact_name || "-"}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Contact Phone</p>
                    <p className="font-medium">{worker.emergency_contact_phone || "-"}</p>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No emergency contact on file</p>
              )}
            </CardContent>
          </Card>

          {/* Notes */}
          {worker.notes && (
            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  Notes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap">{worker.notes}</p>
              </CardContent>
            </Card>
          )}

          {/* Recent Timesheets */}
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                Recent Timesheets
              </CardTitle>
              <CardDescription>
                Last 10 time entries for this worker
              </CardDescription>
            </CardHeader>
            <CardContent>
              {recentTimesheets.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>Regular Hours</TableHead>
                      <TableHead>Overtime Hours</TableHead>
                      <TableHead>Total Hours</TableHead>
                      <TableHead className="text-right">Earnings</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentTimesheets.map((entry) => {
                      const regularPay = (entry.regular_hours || 0) * (worker.hourly_rate || 0);
                      const otPay = (entry.overtime_hours || 0) * overtimeRate;
                      const totalPay = regularPay + otPay;
                      return (
                        <TableRow key={entry.id}>
                          <TableCell>{formatDate(entry.date)}</TableCell>
                          <TableCell>{entry.project?.name || "-"}</TableCell>
                          <TableCell>{entry.regular_hours?.toFixed(1) || 0}</TableCell>
                          <TableCell>{entry.overtime_hours?.toFixed(1) || 0}</TableCell>
                          <TableCell className="font-medium">
                            {((entry.regular_hours || 0) + (entry.overtime_hours || 0)).toFixed(1)}
                          </TableCell>
                          <TableCell className="text-right font-medium text-green-600">
                            {formatCurrency(totalPay)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No timesheets recorded yet</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
