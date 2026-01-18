"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { formatDate, formatTime, formatCurrency, calculateHours, calculateOvertimeHours } from "@/lib/utils";
import {
  Plus,
  Clock,
  Calendar,
  Users,
  Loader2,
  Trash2,
} from "lucide-react";
import type { Project, Worker, TimeEntry } from "@/types";

interface TimeEntryWithRelations extends TimeEntry {
  workers: {
    first_name: string;
    last_name: string;
    hourly_rate: number;
  };
  projects: {
    name: string;
  };
}

export default function TimeTrackingPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [entries, setEntries] = useState<TimeEntryWithRelations[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [selectedProject, setSelectedProject] = useState<string>("all");
  const supabase = createClient();

  // Form state
  const [formData, setFormData] = useState({
    worker_id: "",
    project_id: "",
    date: new Date().toISOString().split("T")[0],
    start_time: "07:00",
    end_time: "16:00",
    break_duration_minutes: 60,
    notes: "",
  });

  useEffect(() => {
    fetchData();
  }, [selectedDate, selectedProject]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/219dfdb1-3353-46ca-9c1b-4d9e8cfab01b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'time-tracking/page.tsx:89',message:'fetchData entry',data:{selectedProject,selectedDate},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      // Fetch projects
      const { data: projectsData } = await supabase
        .from("projects")
        .select("*")
        .in("status", ["active", "planning"])
        .order("name");
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/219dfdb1-3353-46ca-9c1b-4d9e8cfab01b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'time-tracking/page.tsx:98',message:'projects fetched',data:{projectsCount:projectsData?.length||0,projectIds:projectsData?.map(p=>p.id)||[],hasEmptyIds:projectsData?.some(p=>!p.id||p.id==='')||false},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      setProjects(projectsData || []);

      // Fetch active workers
      const { data: workersData } = await supabase
        .from("workers")
        .select("*")
        .eq("status", "active")
        .order("last_name");
      setWorkers(workersData || []);

      // Fetch time entries
      let query = supabase
        .from("time_entries")
        .select(`
          *,
          workers(first_name, last_name, hourly_rate),
          projects(name)
        `)
        .eq("date", selectedDate)
        .order("created_at", { ascending: false });

      if (selectedProject && selectedProject !== "all") {
        query = query.eq("project_id", selectedProject);
      }

      const { data: entriesData } = await query;
      setEntries((entriesData || []) as TimeEntryWithRelations[]);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setSubmitting(true);
    try {
      const totalHours = calculateHours(
        formData.start_time,
        formData.end_time,
        formData.break_duration_minutes
      );
      const { regular, overtime } = calculateOvertimeHours(totalHours);

      const { error } = await supabase.from("time_entries").insert({
        ...formData,
        regular_hours: regular,
        overtime_hours: overtime,
        created_by: user.id,
      });

      if (error) throw error;

      toast({
        title: "Time entry added",
        description: "The time entry has been successfully recorded.",
        variant: "success",
      });

      setDialogOpen(false);
      setFormData({
        worker_id: "",
        project_id: formData.project_id,
        date: formData.date,
        start_time: "07:00",
        end_time: "16:00",
        break_duration_minutes: 60,
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
    if (!confirm("Are you sure you want to delete this time entry?")) return;

    try {
      const { error } = await supabase.from("time_entries").delete().eq("id", id);
      if (error) throw error;
      setEntries(entries.filter((e) => e.id !== id));
      toast({
        title: "Entry deleted",
        description: "The time entry has been removed.",
      });
    } catch (error) {
      console.error("Error deleting entry:", error);
    }
  };

  const totalRegularHours = entries.reduce((sum, e) => sum + e.regular_hours, 0);
  const totalOvertimeHours = entries.reduce((sum, e) => sum + e.overtime_hours, 0);
  const totalLabor = entries.reduce((sum, e) => {
    const rate = e.workers?.hourly_rate || 0;
    return sum + (e.regular_hours * rate) + (e.overtime_hours * rate * 1.5);
  }, 0);

  return (
    <div className="flex flex-col min-h-screen">
      <Header title="Time Tracking" description="Log and manage worker hours">
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Log Time
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Log Time Entry</DialogTitle>
              <DialogDescription>
                Record worker hours for a project
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="project_id">Project *</Label>
                  <Select
                    value={formData.project_id}
                    onValueChange={(value) =>
                      setFormData({ ...formData, project_id: value })
                    }
                  >
                    {/* #region agent log */}
                    {(()=>{fetch('http://127.0.0.1:7242/ingest/219dfdb1-3353-46ca-9c1b-4d9e8cfab01b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'time-tracking/page.tsx:227',message:'Form Select render',data:{formDataProjectId:formData.project_id,formDataProjectIdType:typeof formData.project_id,formDataProjectIdLength:formData.project_id?.length,projectsCount:projects.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});return null})()}
                    {/* #endregion */}
                    <SelectTrigger>
                      <SelectValue placeholder="Select project" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((project) => {
                        // #region agent log
                        fetch('http://127.0.0.1:7242/ingest/219dfdb1-3353-46ca-9c1b-4d9e8cfab01b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'time-tracking/page.tsx:238',message:'Form SelectItem render',data:{projectId:project.id,isEmpty:!project.id||project.id===''},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
                        // #endregion
                        return (
                          <SelectItem key={project.id} value={project.id}>
                            {project.name}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="worker_id">Worker *</Label>
                  <Select
                    value={formData.worker_id}
                    onValueChange={(value) =>
                      setFormData({ ...formData, worker_id: value })
                    }
                  >
                    {/* #region agent log */}
                    {(()=>{fetch('http://127.0.0.1:7242/ingest/219dfdb1-3353-46ca-9c1b-4d9e8cfab01b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'time-tracking/page.tsx:248',message:'Worker Select render',data:{formDataWorkerId:formData.worker_id,formDataWorkerIdType:typeof formData.worker_id,workersCount:workers.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});return null})()}
                    {/* #endregion */}
                    <SelectTrigger>
                      <SelectValue placeholder="Select worker" />
                    </SelectTrigger>
                    <SelectContent>
                      {workers.map((worker) => {
                        // #region agent log
                        fetch('http://127.0.0.1:7242/ingest/219dfdb1-3353-46ca-9c1b-4d9e8cfab01b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'time-tracking/page.tsx:259',message:'Worker SelectItem render',data:{workerId:worker.id,isEmpty:!worker.id||worker.id===''},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
                        // #endregion
                        return (
                          <SelectItem key={worker.id} value={worker.id}>
                            {worker.first_name} {worker.last_name}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="date">Date *</Label>
                  <Input
                    id="date"
                    type="date"
                    value={formData.date}
                    onChange={(e) =>
                      setFormData({ ...formData, date: e.target.value })
                    }
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="start_time">Start Time *</Label>
                    <Input
                      id="start_time"
                      type="time"
                      value={formData.start_time}
                      onChange={(e) =>
                        setFormData({ ...formData, start_time: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="end_time">End Time *</Label>
                    <Input
                      id="end_time"
                      type="time"
                      value={formData.end_time}
                      onChange={(e) =>
                        setFormData({ ...formData, end_time: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="break_duration">Break Duration (minutes)</Label>
                  <Input
                    id="break_duration"
                    type="number"
                    min="0"
                    value={formData.break_duration_minutes}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        break_duration_minutes: parseInt(e.target.value) || 0,
                      })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    placeholder="Any additional notes..."
                    rows={2}
                    value={formData.notes}
                    onChange={(e) =>
                      setFormData({ ...formData, notes: e.target.value })
                    }
                  />
                </div>

                {formData.start_time && formData.end_time && (
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-sm font-medium">Calculated Hours:</p>
                    <p className="text-lg font-bold">
                      {calculateHours(
                        formData.start_time,
                        formData.end_time,
                        formData.break_duration_minutes
                      ).toFixed(2)}{" "}
                      hours
                    </p>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting || !formData.worker_id || !formData.project_id}>
                  {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Save Entry
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </Header>

      <div className="flex-1 p-6 space-y-6">
        {/* Filters */}
        <Card>
          <CardContent className="py-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="space-y-2 sm:space-y-0 sm:flex sm:items-center sm:gap-2">
                <Label htmlFor="filter-date" className="sm:sr-only">Date</Label>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <Input
                    id="filter-date"
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-auto"
                  />
                </div>
              </div>
              <div className="flex-1">
                {/* #region agent log */}
                {(()=>{fetch('http://127.0.0.1:7242/ingest/219dfdb1-3353-46ca-9c1b-4d9e8cfab01b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'time-tracking/page.tsx:384',message:'Select render',data:{selectedProject,selectedProjectType:typeof selectedProject,selectedProjectLength:selectedProject?.length,projectsCount:projects.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});return null})()}
                {/* #endregion */}
                <Select value={selectedProject} onValueChange={setSelectedProject}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Projects" />
                  </SelectTrigger>
                  <SelectContent>
                    {/* #region agent log */}
                    {(()=>{fetch('http://127.0.0.1:7242/ingest/219dfdb1-3353-46ca-9c1b-4d9e8cfab01b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'time-tracking/page.tsx:389',message:'SelectItem with all value rendered',data:{value:'all',hasEmptyValue:false},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'A'})}).catch(()=>{});return null})()}
                    {/* #endregion */}
                    <SelectItem value="all">All Projects</SelectItem>
                    {projects.map((project) => {
                      // #region agent log
                      fetch('http://127.0.0.1:7242/ingest/219dfdb1-3353-46ca-9c1b-4d9e8cfab01b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'time-tracking/page.tsx:391',message:'SelectItem render',data:{projectId:project.id,projectIdType:typeof project.id,projectIdLength:project.id?.length,isEmpty:!project.id||project.id===''},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                      // #endregion
                      return (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="p-2 rounded-lg bg-blue-100">
                  <Clock className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Regular Hours</p>
                  <p className="text-2xl font-bold">{totalRegularHours.toFixed(1)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="p-2 rounded-lg bg-orange-100">
                  <Clock className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Overtime Hours</p>
                  <p className="text-2xl font-bold">{totalOvertimeHours.toFixed(1)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="p-2 rounded-lg bg-green-100">
                  <Users className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Labor Cost</p>
                  <p className="text-2xl font-bold">{formatCurrency(totalLabor)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Time Entries Table */}
        <Card>
          <CardHeader>
            <CardTitle>Time Entries for {formatDate(selectedDate)}</CardTitle>
            <CardDescription>
              {entries.length} {entries.length === 1 ? "entry" : "entries"} recorded
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 text-center">
                <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
                <p className="mt-4 text-muted-foreground">Loading entries...</p>
              </div>
            ) : entries.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Worker</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Break</TableHead>
                    <TableHead>Regular</TableHead>
                    <TableHead>OT</TableHead>
                    <TableHead>Cost</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => {
                    const rate = entry.workers?.hourly_rate || 0;
                    const cost = (entry.regular_hours * rate) + (entry.overtime_hours * rate * 1.5);
                    return (
                      <TableRow key={entry.id}>
                        <TableCell className="font-medium">
                          {entry.workers?.first_name} {entry.workers?.last_name}
                        </TableCell>
                        <TableCell>{entry.projects?.name}</TableCell>
                        <TableCell>
                          {formatTime(entry.start_time)} - {formatTime(entry.end_time)}
                        </TableCell>
                        <TableCell>{entry.break_duration_minutes} min</TableCell>
                        <TableCell>{entry.regular_hours.toFixed(1)}h</TableCell>
                        <TableCell>
                          {entry.overtime_hours > 0 ? (
                            <Badge variant="warning">{entry.overtime_hours.toFixed(1)}h</Badge>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell>{formatCurrency(cost)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(entry.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <div className="p-12 text-center">
                <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No time entries</h3>
                <p className="text-muted-foreground mb-4">
                  No hours logged for {formatDate(selectedDate)}
                </p>
                <Button onClick={() => setDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Log Time
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
