"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn, formatCurrency } from "@/lib/utils";
import Link from "next/link";
import {
  Plus,
  Trash2,
  Copy,
  Loader2,
  Check,
  ChevronsUpDown,
  Clock,
  Users,
  AlertCircle,
  Keyboard,
  FileText,
  CalendarDays,
  ArrowLeft,
  ChevronDown,
  Pencil,
  Zap,
} from "lucide-react";
import type { Project, Worker } from "@/types";

interface TimeEntryRow {
  id: string;
  worker_id: string;
  worker_name: string;
  hours: number;
  overtime_hours: number;
  has_overtime: boolean;
  hourly_rate: number;
  project_id: string;
  notes: string;
  status: "new" | "saving" | "saved" | "error";
  error_message?: string;
}

interface CrewMember {
  worker_id: string;
  worker_name: string;
  default_hours: number;
  hourly_rate: number;
}

interface CrewTemplate {
  id: string;
  name: string;
  project_id?: string;
  project_name?: string;
  members: CrewMember[];
  created_at: string;
  updated_at: string;
}

interface DuplicateWarning {
  row_id: string;
  worker_name: string;
  existing_hours: number;
}

const DEFAULT_ROW: Omit<TimeEntryRow, "id"> = {
  worker_id: "",
  worker_name: "",
  hours: 8,
  overtime_hours: 0,
  has_overtime: false,
  hourly_rate: 0,
  project_id: "",
  notes: "",
  status: "new",
};

function generateId() {
  return `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export default function QuickTimeEntryPage() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const supabase = createClient();

  // State
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [globalProject, setGlobalProject] = useState<string>("");
  const [rows, setRows] = useState<TimeEntryRow[]>([{ ...DEFAULT_ROW, id: generateId() }]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateWarning[]>([]);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [existingEntries, setExistingEntries] = useState<Map<string, number>>(new Map());
  const [templates, setTemplates] = useState<CrewTemplate[]>([]);

  // Template dialog state
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateProject, setTemplateProject] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);

  // Refs for keyboard navigation
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  // Fetch data
  useEffect(() => {
    fetchData();
    loadTemplates();
    loadDraft();
  }, []);

  // Check for duplicates when date or rows change
  useEffect(() => {
    checkForDuplicates();
  }, [selectedDate, rows]);

  // Auto-save draft
  useEffect(() => {
    const timer = setTimeout(() => saveDraft(), 30000);
    return () => clearTimeout(timer);
  }, [rows, selectedDate, globalProject]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        saveAll();
      }
    };
    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => document.removeEventListener("keydown", handleGlobalKeyDown);
  }, [rows, globalProject, selectedDate]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch projects (filtered by company_id)
      let projectsQuery = supabase
        .from("projects")
        .select("*")
        .in("status", ["active", "planning"]);
      
      if (profile?.company_id) {
        projectsQuery = projectsQuery.eq("company_id", profile.company_id);
      }
      
      // Fetch workers (filtered by company_id)
      let workersQuery = supabase
        .from("workers")
        .select("*")
        .eq("status", "active");
      
      if (profile?.company_id) {
        workersQuery = workersQuery.eq("company_id", profile.company_id);
      }
      
      const [projectsRes, workersRes] = await Promise.all([
        projectsQuery.order("name"),
        workersQuery.order("last_name"),
      ]);
      setProjects(projectsRes.data || []);
      setWorkers(workersRes.data || []);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadTemplates = () => {
    try {
      const saved = localStorage.getItem("tropitrack_crew_templates");
      if (saved) setTemplates(JSON.parse(saved));
    } catch (error) {
      console.error("Error loading templates:", error);
    }
  };

  const checkForDuplicates = async () => {
    if (!selectedDate) return;
    const workerIds = rows.filter((r) => r.worker_id).map((r) => r.worker_id);
    if (workerIds.length === 0) {
      setExistingEntries(new Map());
      return;
    }

    let query = supabase
      .from("time_entries")
      .select("worker_id, regular_hours, overtime_hours")
      .eq("date", selectedDate)
      .in("worker_id", workerIds);
    
    if (profile?.company_id) {
      query = query.eq("company_id", profile.company_id);
    }
    
    const { data } = await query;

    const entries = new Map<string, number>();
    data?.forEach((entry) => {
      const current = entries.get(entry.worker_id) || 0;
      entries.set(entry.worker_id, current + entry.regular_hours + entry.overtime_hours);
    });
    setExistingEntries(entries);
  };

  const saveDraft = () => {
    const draft = {
      date: selectedDate,
      globalProject,
      rows: rows.filter((r) => r.worker_id),
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem("tropitrack_time_draft", JSON.stringify(draft));
  };

  const loadDraft = () => {
    try {
      const saved = localStorage.getItem("tropitrack_time_draft");
      if (saved) {
        const draft = JSON.parse(saved);
        const savedTime = new Date(draft.savedAt).getTime();
        if (Date.now() - savedTime < 24 * 60 * 60 * 1000) {
          setSelectedDate(draft.date);
          setGlobalProject(draft.globalProject || "");
          if (draft.rows?.length > 0) {
            setRows(draft.rows.map((r: TimeEntryRow) => ({ ...r, status: "new" })));
            toast({ title: "Draft restored", description: "Your unsaved entries have been restored." });
          }
        }
      }
    } catch (error) {
      console.error("Error loading draft:", error);
    }
  };

  const clearDraft = () => localStorage.removeItem("tropitrack_time_draft");

  // Row handlers
  const handleWorkerSelect = (rowId: string, workerId: string) => {
    const worker = workers.find((w) => w.id === workerId);
    if (!worker) return;
    setRows((prev) =>
      prev.map((row) =>
        row.id === rowId
          ? {
              ...row,
              worker_id: workerId,
              worker_name: `${worker.first_name} ${worker.last_name}`,
              hourly_rate: worker.hourly_rate || 0,
            }
          : row
      )
    );
  };

  const handleHoursChange = (rowId: string, value: string) => {
    const hours = parseFloat(value) || 0;
    setRows((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, hours: Math.max(0, Math.min(24, hours)) } : row))
    );
  };

  const handleOvertimeToggle = (rowId: string, checked: boolean) => {
    setRows((prev) =>
      prev.map((row) =>
        row.id === rowId
          ? { ...row, has_overtime: checked, overtime_hours: checked ? Math.max(0, row.hours - 8) : 0 }
          : row
      )
    );
  };

  const handleOvertimeHoursChange = (rowId: string, value: string) => {
    const hours = parseFloat(value) || 0;
    setRows((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, overtime_hours: Math.max(0, hours) } : row))
    );
  };

  const handleProjectChange = (rowId: string, projectId: string) => {
    setRows((prev) => prev.map((row) => (row.id === rowId ? { ...row, project_id: projectId } : row)));
  };

  const handleNotesChange = (rowId: string, value: string) => {
    setRows((prev) => prev.map((row) => (row.id === rowId ? { ...row, notes: value } : row)));
  };

  const addRow = () => {
    setRows((prev) => [...prev, { ...DEFAULT_ROW, id: generateId(), project_id: globalProject }]);
  };

  const removeRow = (rowId: string) => {
    if (rows.length === 1) {
      setRows([{ ...DEFAULT_ROW, id: generateId(), project_id: globalProject }]);
    } else {
      setRows((prev) => prev.filter((row) => row.id !== rowId));
    }
  };

  const duplicateRow = (rowId: string) => {
    const rowToDuplicate = rows.find((r) => r.id === rowId);
    if (!rowToDuplicate) return;
    const newRow: TimeEntryRow = { ...rowToDuplicate, id: generateId(), status: "new", worker_id: "", worker_name: "" };
    setRows((prev) => {
      const index = prev.findIndex((r) => r.id === rowId);
      const newRows = [...prev];
      newRows.splice(index + 1, 0, newRow);
      return newRows;
    });
  };

  // Copy functions
  const copyYesterday = async () => {
    const yesterday = new Date(selectedDate);
    yesterday.setDate(yesterday.getDate() - 1);
    let query = supabase
      .from("time_entries")
      .select("worker_id, project_id, regular_hours, overtime_hours, workers(first_name, last_name, hourly_rate)")
      .eq("date", yesterday.toISOString().split("T")[0]);
    
    if (profile?.company_id) {
      query = query.eq("company_id", profile.company_id);
    }
    
    const { data, error } = await query;

    if (error || !data?.length) {
      toast({ title: "No entries found", description: "No time entries found for yesterday.", variant: "destructive" });
      return;
    }

    const newRows: TimeEntryRow[] = data.map((entry: any) => ({
      id: generateId(),
      worker_id: entry.worker_id,
      worker_name: `${entry.workers?.first_name || ""} ${entry.workers?.last_name || ""}`.trim(),
      hours: entry.regular_hours,
      overtime_hours: entry.overtime_hours,
      has_overtime: entry.overtime_hours > 0,
      hourly_rate: entry.workers?.hourly_rate || 0,
      project_id: entry.project_id,
      notes: "",
      status: "new" as const,
    }));
    setRows(newRows);
    toast({ title: "Copied from yesterday", description: `${newRows.length} entries copied.` });
  };

  const copyLastWeek = async () => {
    const lastWeek = new Date(selectedDate);
    lastWeek.setDate(lastWeek.getDate() - 7);
    let query = supabase
      .from("time_entries")
      .select("worker_id, project_id, regular_hours, overtime_hours, workers(first_name, last_name, hourly_rate)")
      .eq("date", lastWeek.toISOString().split("T")[0]);
    
    if (profile?.company_id) {
      query = query.eq("company_id", profile.company_id);
    }
    
    const { data, error } = await query;

    if (error || !data?.length) {
      toast({ title: "No entries found", description: "No time entries found for last week.", variant: "destructive" });
      return;
    }

    const newRows: TimeEntryRow[] = data.map((entry: any) => ({
      id: generateId(),
      worker_id: entry.worker_id,
      worker_name: `${entry.workers?.first_name || ""} ${entry.workers?.last_name || ""}`.trim(),
      hours: entry.regular_hours,
      overtime_hours: entry.overtime_hours,
      has_overtime: entry.overtime_hours > 0,
      hourly_rate: entry.workers?.hourly_rate || 0,
      project_id: entry.project_id,
      notes: "",
      status: "new" as const,
    }));
    setRows(newRows);
    toast({ title: "Copied from last week", description: `${newRows.length} entries copied.` });
  };

  const clearAll = () => {
    setRows([{ ...DEFAULT_ROW, id: generateId(), project_id: globalProject }]);
    toast({ title: "Cleared", description: "All entries cleared." });
  };

  // Template functions
  const loadTemplate = (template: CrewTemplate) => {
    const newRows: TimeEntryRow[] = template.members.map((member) => ({
      id: generateId(),
      worker_id: member.worker_id,
      worker_name: member.worker_name,
      hours: member.default_hours,
      overtime_hours: 0,
      has_overtime: false,
      hourly_rate: member.hourly_rate,
      project_id: template.project_id || globalProject,
      notes: "",
      status: "new" as const,
    }));
    setRows(newRows);
    if (template.project_id) setGlobalProject(template.project_id);
    toast({ title: "Template loaded", description: `${template.name} - ${newRows.length} workers.` });
  };

  const saveAsTemplate = async () => {
    if (!templateName.trim()) {
      toast({ title: "Name required", description: "Please enter a template name.", variant: "destructive" });
      return;
    }

    const members: CrewMember[] = rows
      .filter((r) => r.worker_id)
      .map((r) => ({
        worker_id: r.worker_id,
        worker_name: r.worker_name,
        default_hours: r.hours,
        hourly_rate: r.hourly_rate,
      }));

    if (members.length === 0) {
      toast({ title: "No workers", description: "Add workers first.", variant: "destructive" });
      return;
    }

    setSavingTemplate(true);
    try {
      const project = projects.find((p) => p.id === templateProject);
      const template: CrewTemplate = {
        id: `template-${Date.now()}`,
        name: templateName,
        project_id: templateProject || undefined,
        project_name: project?.name,
        members,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const updatedTemplates = [...templates, template];
      localStorage.setItem("tropitrack_crew_templates", JSON.stringify(updatedTemplates));
      setTemplates(updatedTemplates);

      toast({ title: "Template saved", description: `"${templateName}" has been saved.`, variant: "success" });
      setShowTemplateDialog(false);
      setTemplateName("");
      setTemplateProject("");
    } catch (error) {
      console.error("Error saving template:", error);
    } finally {
      setSavingTemplate(false);
    }
  };

  const deleteTemplate = (templateId: string) => {
    const updatedTemplates = templates.filter((t) => t.id !== templateId);
    localStorage.setItem("tropitrack_crew_templates", JSON.stringify(updatedTemplates));
    setTemplates(updatedTemplates);
    toast({ title: "Template deleted" });
  };

  // Save all entries
  const saveAll = async () => {
    if (!user || !profile?.company_id) {
      toast({ title: "Error", description: "Unable to save. Please ensure you're logged in and associated with a company.", variant: "destructive" });
      return;
    }

    const validRows = rows.filter((row) => row.worker_id && row.hours > 0);
    if (validRows.length === 0) {
      toast({ title: "Nothing to save", description: "Add at least one worker with hours.", variant: "destructive" });
      return;
    }

    const rowsWithoutProject = validRows.filter((row) => !row.project_id && !globalProject);
    if (rowsWithoutProject.length > 0) {
      toast({ title: "Missing project", description: "All entries must have a project.", variant: "destructive" });
      return;
    }

    const duplicateRows = validRows.filter((row) => existingEntries.has(row.worker_id));
    if (duplicateRows.length > 0) {
      setDuplicates(
        duplicateRows.map((row) => ({
          row_id: row.id,
          worker_name: row.worker_name,
          existing_hours: existingEntries.get(row.worker_id) || 0,
        }))
      );
      setShowDuplicateDialog(true);
      return;
    }

    // Prevent same worker twice in this batch (same project + date)
    const projectKey = (row: TimeEntryRow) => `${row.worker_id}:${row.project_id || globalProject}`;
    const seen = new Set<string>();
    const inBatchDuplicates: string[] = [];
    for (const row of validRows) {
      const key = projectKey(row);
      if (seen.has(key)) {
        inBatchDuplicates.push(row.worker_name);
      }
      seen.add(key);
    }
    if (inBatchDuplicates.length > 0) {
      const names = [...new Set(inBatchDuplicates)].join(", ");
      toast({
        title: "Duplicate worker",
        description: `${names} appear(s) more than once for the same project on this date. Remove the duplicate row or assign a different project.`,
        variant: "destructive",
      });
      return;
    }

    await performSave(validRows);
  };

  const performSave = async (rowsToSave: TimeEntryRow[]) => {
    if (!profile?.company_id) {
      toast({
        title: "Error",
        description: "Company information not available. Please refresh the page.",
        variant: "destructive",
      });
      setSaving(false);
      return;
    }

    setSaving(true);
    setRows((prev) => prev.map((row) => (rowsToSave.find((r) => r.id === row.id) ? { ...row, status: "saving" as const } : row)));

    try {
      const entries = rowsToSave.map((row) => {
        const regularHours = row.has_overtime ? Math.min(8, row.hours) : row.hours;
        const overtimeHours = row.has_overtime ? row.overtime_hours : 0;
        const totalHours = regularHours + overtimeHours;
        const endHour = 7 + totalHours + 1;

        return {
          worker_id: row.worker_id,
          project_id: row.project_id || globalProject,
          company_id: profile.company_id,
          date: selectedDate,
          start_time: "07:00",
          end_time: `${Math.floor(endHour).toString().padStart(2, "0")}:${Math.round((endHour % 1) * 60).toString().padStart(2, "0")}`,
          break_duration_minutes: 60,
          regular_hours: regularHours,
          overtime_hours: overtimeHours,
          notes: row.notes || null,
          created_by: user!.id,
        };
      });

      const { error } = await supabase.from("time_entries").insert(entries);
      if (error) throw error;

      setRows((prev) => prev.map((row) => (rowsToSave.find((r) => r.id === row.id) ? { ...row, status: "saved" as const } : row)));
      clearDraft();
      toast({ title: "Time entries saved", description: `${rowsToSave.length} entries saved.`, variant: "success" });
      checkForDuplicates();
    } catch (error: any) {
      setRows((prev) =>
        prev.map((row) => (rowsToSave.find((r) => r.id === row.id) ? { ...row, status: "error" as const, error_message: error.message } : row))
      );
      toast({ title: "Error saving", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent, rowId: string, field: string) => {
    if (e.key === "Enter" && field === "hours") {
      e.preventDefault();
      addRow();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "d") {
      e.preventDefault();
      duplicateRow(rowId);
    }
  };

  // Calculate totals
  const totals = useMemo(() => {
    let totalRegular = 0;
    let totalOvertime = 0;
    let totalCost = 0;

    rows.forEach((row) => {
      if (row.worker_id && row.hours > 0) {
        const regular = row.has_overtime ? Math.min(8, row.hours) : row.hours;
        const overtime = row.has_overtime ? row.overtime_hours : 0;
        totalRegular += regular;
        totalOvertime += overtime;
        totalCost += regular * row.hourly_rate + overtime * row.hourly_rate * 1.5;
      }
    });

    return { regular: totalRegular, overtime: totalOvertime, cost: totalCost };
  }, [rows]);

  const validRowCount = rows.filter((r) => r.worker_id && r.hours > 0).length;

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header title="Quick Time Entry" description="Loading...">
          <Link href="/time-tracking">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
        </Header>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header title="Quick Time Entry" description="Fast batch entry for multiple workers">
        <div className="flex items-center gap-2">
          <Link href="/time-tracking">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
        </div>
      </Header>

      <div className="flex-1 p-6 space-y-6">
        {/* Header Controls */}
        <Card>
          <CardContent className="py-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-2">
                <Label>Date</Label>
                <DatePicker
                  value={selectedDate}
                  onChange={(value) => setSelectedDate(value || new Date().toISOString().split("T")[0])}
                  className="w-[200px]"
                />
              </div>

              <div className="space-y-2 flex-1 min-w-[200px]">
                <Label>Project (applies to all)</Label>
                <Select value={globalProject || "none"} onValueChange={(value) => setGlobalProject(value === "none" ? "" : value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select project or set per worker" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Per worker</SelectItem>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2 flex-wrap">
                {/* Load Template */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Users className="h-4 w-4 mr-2" />
                      Templates
                      <ChevronDown className="h-4 w-4 ml-2" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-[250px]">
                    {templates.length === 0 ? (
                      <div className="p-4 text-center text-sm text-muted-foreground">No templates saved</div>
                    ) : (
                      templates.map((template) => (
                        <DropdownMenuItem key={template.id} className="flex justify-between" onSelect={(e) => e.preventDefault()}>
                          <button className="flex-1 text-left" onClick={() => loadTemplate(template)}>
                            <div className="font-medium">{template.name}</div>
                            <div className="text-xs text-muted-foreground">{template.members.length} workers</div>
                          </button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteTemplate(template.id);
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </DropdownMenuItem>
                      ))
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => setShowTemplateDialog(true)}>
                      Save Current as Template
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button variant="outline" size="sm" onClick={copyYesterday}>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Yesterday
                </Button>
                <Button variant="outline" size="sm" onClick={copyLastWeek}>
                  <CalendarDays className="h-4 w-4 mr-2" />
                  Copy Last Week
                </Button>
                <Button variant="outline" size="sm" onClick={clearAll}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Time Entry Grid */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-amber-500" />
                  Quick Entry Grid
                </CardTitle>
                <CardDescription>
                  {validRowCount} worker{validRowCount !== 1 ? "s" : ""} • {totals.regular.toFixed(1)} regular + {totals.overtime.toFixed(1)} OT hrs •{" "}
                  {formatCurrency(totals.cost)}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Keyboard className="h-4 w-4" />
                <span>Tab: next • Enter: add row • ⌘S: save • ⌘D: duplicate</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-y bg-muted/50">
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 w-[250px]">Worker</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 w-[100px]">Hours</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 w-[80px]">Rate</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 w-[150px]">Overtime</th>
                    {!globalProject && (
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 w-[200px]">Project</th>
                    )}
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Notes</th>
                    <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3 w-[100px]">Status</th>
                    <th className="w-[80px]"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className={cn(
                        "border-b transition-colors",
                        row.status === "saved" && "bg-green-50",
                        row.status === "error" && "bg-red-50",
                        existingEntries.has(row.worker_id) && row.status === "new" && "bg-amber-50"
                      )}
                    >
                      {/* Worker Selection */}
                      <td className="px-4 py-2">
                        <WorkerCombobox workers={workers} value={row.worker_id} onSelect={(workerId) => handleWorkerSelect(row.id, workerId)} />
                        {existingEntries.has(row.worker_id) && row.status === "new" && (
                          <div className="flex items-center gap-1 mt-1 text-xs text-amber-600">
                            <AlertCircle className="h-3 w-3" />
                            <span>Has {existingEntries.get(row.worker_id)}h logged</span>
                          </div>
                        )}
                      </td>

                      {/* Hours */}
                      <td className="px-4 py-2">
                        <Input
                          type="number"
                          min="0"
                          max="24"
                          step="0.5"
                          value={row.hours || ""}
                          onChange={(e) => handleHoursChange(row.id, e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, row.id, "hours")}
                          className="w-20 text-center"
                        />
                      </td>

                      {/* Rate */}
                      <td className="px-4 py-2">
                        <span className="text-sm text-muted-foreground">${row.hourly_rate}/hr</span>
                      </td>

                      {/* Overtime */}
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={row.has_overtime}
                            onCheckedChange={(checked) => handleOvertimeToggle(row.id, checked as boolean)}
                          />
                          {row.has_overtime && (
                            <Input
                              type="number"
                              min="0"
                              step="0.5"
                              value={row.overtime_hours || ""}
                              onChange={(e) => handleOvertimeHoursChange(row.id, e.target.value)}
                              className="w-16 text-center"
                              placeholder="OT"
                            />
                          )}
                        </div>
                      </td>

                      {/* Project (if not global) */}
                      {!globalProject && (
                        <td className="px-4 py-2">
                          <Select value={row.project_id} onValueChange={(value) => handleProjectChange(row.id, value)}>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                            <SelectContent>
                              {projects.map((project) => (
                                <SelectItem key={project.id} value={project.id}>
                                  {project.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                      )}

                      {/* Notes */}
                      <td className="px-4 py-2">
                        <Input
                          value={row.notes}
                          onChange={(e) => handleNotesChange(row.id, e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, row.id, "notes")}
                          placeholder="Optional notes..."
                          className="w-full"
                        />
                      </td>

                      {/* Status */}
                      <td className="px-4 py-2 text-right">
                        {row.status === "saving" && <Loader2 className="h-4 w-4 animate-spin ml-auto" />}
                        {row.status === "saved" && (
                          <Badge variant="success" className="ml-auto">
                            <Check className="h-3 w-3 mr-1" />
                            Saved
                          </Badge>
                        )}
                        {row.status === "error" && <Badge variant="destructive">Error</Badge>}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => duplicateRow(row.id)} title="Duplicate (⌘D)">
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeRow(row.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Add Row Button */}
            <div className="p-4 border-t">
              <Button variant="outline" onClick={addRow} className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Add Worker (or press Enter)
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Save Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span>{validRowCount} workers</span>
            </div>
            <Separator orientation="vertical" className="h-4" />
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              <span>
                {totals.regular.toFixed(1)} + {totals.overtime.toFixed(1)} OT hrs
              </span>
            </div>
            <Separator orientation="vertical" className="h-4" />
            <span className="font-medium">{formatCurrency(totals.cost)}</span>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={saveDraft}>
              <FileText className="h-4 w-4 mr-2" />
              Save Draft
            </Button>
            <Button onClick={saveAll} disabled={saving || validRowCount === 0} size="lg">
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save All ({validRowCount})
            </Button>
          </div>
        </div>
      </div>

      {/* Duplicate Warning Dialog */}
      <AlertDialog open={showDuplicateDialog} onOpenChange={setShowDuplicateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Duplicate Entries Detected</AlertDialogTitle>
            <AlertDialogDescription>These workers already have time logged for {selectedDate}:</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="my-4 space-y-2">
            {duplicates.map((dup) => (
              <div key={dup.row_id} className="flex items-center justify-between p-2 bg-amber-50 rounded">
                <span className="font-medium">{dup.worker_name}</span>
                <span className="text-sm text-muted-foreground">{dup.existing_hours}h already logged</span>
              </div>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowDuplicateDialog(false);
                performSave(rows.filter((r) => r.worker_id && r.hours > 0));
              }}
            >
              Save Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Save Template Dialog */}
      <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save as Template</DialogTitle>
            <DialogDescription>Save this crew configuration for quick reuse</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Template Name *</Label>
              <Input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="e.g., Harbor Bay Crew" />
            </div>
            <div className="space-y-2">
              <Label>Default Project (optional)</Label>
              <Select value={templateProject || "none"} onValueChange={(value) => setTemplateProject(value === "none" ? "" : value)}>
                <SelectTrigger>
                  <SelectValue placeholder="No default" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No default</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="p-3 bg-muted rounded-md">
              <p className="text-sm font-medium mb-2">Workers to save:</p>
              <div className="space-y-1">
                {rows
                  .filter((r) => r.worker_id)
                  .map((r) => (
                    <div key={r.id} className="text-sm flex justify-between">
                      <span>{r.worker_name}</span>
                      <span className="text-muted-foreground">{r.hours}h</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTemplateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={saveAsTemplate} disabled={savingTemplate}>
              {savingTemplate && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Worker Combobox Component
function WorkerCombobox({
  workers,
  value,
  onSelect,
}: {
  workers: Worker[];
  value: string;
  onSelect: (workerId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedWorker = workers.find((w) => w.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
          {selectedWorker ? `${selectedWorker.first_name} ${selectedWorker.last_name}` : "Select worker..."}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[250px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search workers..." />
          <CommandList>
            <CommandEmpty>No worker found.</CommandEmpty>
            <CommandGroup>
              {workers.map((worker) => {
                const displayName = `${worker.first_name} ${worker.last_name}`;
                const handleSelect = () => {
                  onSelect(worker.id);
                  setOpen(false);
                };

                return (
                  <CommandItem
                    key={worker.id}
                    value={worker.id}
                    onSelect={handleSelect}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelect();
                    }}
                  >
                    <Check className={cn("mr-2 h-4 w-4", value === worker.id ? "opacity-100" : "opacity-0")} />
                    <div className="flex-1">
                      <div>{displayName}</div>
                      <div className="text-xs text-muted-foreground">${worker.hourly_rate}/hr</div>
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
