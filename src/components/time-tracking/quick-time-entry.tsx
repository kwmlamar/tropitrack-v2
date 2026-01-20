"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn, formatCurrency } from "@/lib/utils";
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
  Undo2,
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

export function QuickTimeEntry() {
  const { user } = useAuth();
  const { toast } = useToast();
  const supabase = createClient();

  // State
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [globalProject, setGlobalProject] = useState<string>("");
  const [rows, setRows] = useState<TimeEntryRow[]>([
    { ...DEFAULT_ROW, id: generateId() },
  ]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateWarning[]>([]);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [existingEntries, setExistingEntries] = useState<Map<string, number>>(new Map());
  const [lastSavedRows, setLastSavedRows] = useState<TimeEntryRow[]>([]);
  const [autoSaveTimer, setAutoSaveTimer] = useState<NodeJS.Timeout | null>(null);

  // Refs for keyboard navigation
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  // Fetch data
  useEffect(() => {
    fetchData();
  }, []);

  // Check for duplicates when date or rows change
  useEffect(() => {
    checkForDuplicates();
  }, [selectedDate, rows]);

  // Auto-save draft every 30 seconds
  useEffect(() => {
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    const timer = setTimeout(() => {
      saveDraft();
    }, 30000);
    setAutoSaveTimer(timer);
    return () => clearTimeout(timer);
  }, [rows, selectedDate, globalProject]);

  // Load draft on mount
  useEffect(() => {
    loadDraft();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [projectsRes, workersRes] = await Promise.all([
        supabase
          .from("projects")
          .select("*")
          .in("status", ["active", "planning"])
          .order("name"),
        supabase
          .from("workers")
          .select("*")
          .eq("status", "active")
          .order("last_name"),
      ]);

      setProjects(projectsRes.data || []);
      setWorkers(workersRes.data || []);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const checkForDuplicates = async () => {
    if (!selectedDate) return;

    const workerIds = rows
      .filter((r) => r.worker_id)
      .map((r) => r.worker_id);

    if (workerIds.length === 0) {
      setExistingEntries(new Map());
      return;
    }

    const { data } = await supabase
      .from("time_entries")
      .select("worker_id, regular_hours, overtime_hours")
      .eq("date", selectedDate)
      .in("worker_id", workerIds);

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
        // Only restore if saved within the last 24 hours
        const savedTime = new Date(draft.savedAt).getTime();
        const now = Date.now();
        if (now - savedTime < 24 * 60 * 60 * 1000) {
          setSelectedDate(draft.date);
          setGlobalProject(draft.globalProject || "");
          if (draft.rows && draft.rows.length > 0) {
            setRows(draft.rows.map((r: TimeEntryRow) => ({ ...r, status: "new" })));
          }
          toast({
            title: "Draft restored",
            description: "Your unsaved time entries have been restored.",
          });
        }
      }
    } catch (error) {
      console.error("Error loading draft:", error);
    }
  };

  const clearDraft = () => {
    localStorage.removeItem("tropitrack_time_draft");
  };

  // Worker selection with autocomplete
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
          ? {
              ...row,
              has_overtime: checked,
              overtime_hours: checked ? Math.max(0, row.hours - 8) : 0,
            }
          : row
      )
    );
  };

  const handleOvertimeHoursChange = (rowId: string, value: string) => {
    const hours = parseFloat(value) || 0;
    setRows((prev) =>
      prev.map((row) =>
        row.id === rowId ? { ...row, overtime_hours: Math.max(0, hours) } : row
      )
    );
  };

  const handleProjectChange = (rowId: string, projectId: string) => {
    setRows((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, project_id: projectId } : row))
    );
  };

  const handleNotesChange = (rowId: string, value: string) => {
    setRows((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, notes: value } : row))
    );
  };

  const addRow = () => {
    const newRow: TimeEntryRow = {
      ...DEFAULT_ROW,
      id: generateId(),
      project_id: globalProject,
    };
    setRows((prev) => [...prev, newRow]);
  };

  const removeRow = (rowId: string) => {
    if (rows.length === 1) {
      // Reset the last row instead of removing
      setRows([{ ...DEFAULT_ROW, id: generateId(), project_id: globalProject }]);
    } else {
      setRows((prev) => prev.filter((row) => row.id !== rowId));
    }
  };

  const duplicateRow = (rowId: string) => {
    const rowToDuplicate = rows.find((r) => r.id === rowId);
    if (!rowToDuplicate) return;

    const newRow: TimeEntryRow = {
      ...rowToDuplicate,
      id: generateId(),
      status: "new",
      worker_id: "",
      worker_name: "",
    };
    setRows((prev) => {
      const index = prev.findIndex((r) => r.id === rowId);
      const newRows = [...prev];
      newRows.splice(index + 1, 0, newRow);
      return newRows;
    });
  };

  // Copy from previous day
  const copyYesterday = async () => {
    const yesterday = new Date(selectedDate);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];

    const { data, error } = await supabase
      .from("time_entries")
      .select(`
        worker_id,
        project_id,
        regular_hours,
        overtime_hours,
        notes,
        workers(first_name, last_name, hourly_rate)
      `)
      .eq("date", yesterdayStr);

    if (error || !data || data.length === 0) {
      toast({
        title: "No entries found",
        description: `No time entries found for ${yesterdayStr}`,
        variant: "destructive",
      });
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
    toast({
      title: "Copied from yesterday",
      description: `${newRows.length} entries copied. Adjust hours as needed.`,
    });
  };

  // Copy from same day last week
  const copyLastWeek = async () => {
    const lastWeek = new Date(selectedDate);
    lastWeek.setDate(lastWeek.getDate() - 7);
    const lastWeekStr = lastWeek.toISOString().split("T")[0];

    const { data, error } = await supabase
      .from("time_entries")
      .select(`
        worker_id,
        project_id,
        regular_hours,
        overtime_hours,
        notes,
        workers(first_name, last_name, hourly_rate)
      `)
      .eq("date", lastWeekStr);

    if (error || !data || data.length === 0) {
      toast({
        title: "No entries found",
        description: `No time entries found for ${lastWeekStr}`,
        variant: "destructive",
      });
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
    toast({
      title: "Copied from last week",
      description: `${newRows.length} entries copied. Adjust hours as needed.`,
    });
  };

  const clearAll = () => {
    setRows([{ ...DEFAULT_ROW, id: generateId(), project_id: globalProject }]);
    toast({
      title: "Cleared",
      description: "All entries have been cleared.",
    });
  };

  // Batch save all entries
  const saveAll = async () => {
    if (!user) return;

    // Validate rows
    const validRows = rows.filter((row) => row.worker_id && row.hours > 0);
    if (validRows.length === 0) {
      toast({
        title: "Nothing to save",
        description: "Add at least one worker with hours to save.",
        variant: "destructive",
      });
      return;
    }

    // Check for missing projects
    const rowsWithoutProject = validRows.filter(
      (row) => !row.project_id && !globalProject
    );
    if (rowsWithoutProject.length > 0) {
      toast({
        title: "Missing project",
        description: "All entries must have a project assigned.",
        variant: "destructive",
      });
      return;
    }

    // Check for duplicates
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

    await performSave(validRows);
  };

  const performSave = async (rowsToSave: TimeEntryRow[]) => {
    setSaving(true);
    setLastSavedRows([...rows]);

    // Mark rows as saving
    setRows((prev) =>
      prev.map((row) =>
        rowsToSave.find((r) => r.id === row.id)
          ? { ...row, status: "saving" as const }
          : row
      )
    );

    try {
      const entries = rowsToSave.map((row) => {
        const regularHours = row.has_overtime ? Math.min(8, row.hours) : row.hours;
        const overtimeHours = row.has_overtime ? row.overtime_hours : 0;

        return {
          worker_id: row.worker_id,
          project_id: row.project_id || globalProject,
          date: selectedDate,
          start_time: "07:00",
          end_time: calculateEndTime(regularHours + overtimeHours),
          break_duration_minutes: 60,
          regular_hours: regularHours,
          overtime_hours: overtimeHours,
          notes: row.notes || null,
          created_by: user!.id,
        };
      });

      const { error } = await supabase.from("time_entries").insert(entries);

      if (error) throw error;

      // Mark rows as saved
      setRows((prev) =>
        prev.map((row) =>
          rowsToSave.find((r) => r.id === row.id)
            ? { ...row, status: "saved" as const }
            : row
        )
      );

      clearDraft();

      toast({
        title: "Time entries saved",
        description: `${rowsToSave.length} entries saved successfully.`,
        variant: "success",
      });

      // Refresh duplicate check
      checkForDuplicates();
    } catch (error: any) {
      console.error("Error saving entries:", error);

      // Mark rows as error
      setRows((prev) =>
        prev.map((row) =>
          rowsToSave.find((r) => r.id === row.id)
            ? { ...row, status: "error" as const, error_message: error.message }
            : row
        )
      );

      toast({
        title: "Error saving entries",
        description: error.message || "An error occurred while saving.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const calculateEndTime = (totalHours: number): string => {
    const startHour = 7;
    const breakHours = 1;
    const endHour = startHour + totalHours + breakHours;
    const hours = Math.floor(endHour);
    const minutes = Math.round((endHour - hours) * 60);
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
  };

  // Keyboard navigation
  const handleKeyDown = (
    e: React.KeyboardEvent,
    rowId: string,
    field: string
  ) => {
    const rowIndex = rows.findIndex((r) => r.id === rowId);

    if (e.key === "Enter" && field === "hours") {
      e.preventDefault();
      // Add new row and focus on worker field
      addRow();
      setTimeout(() => {
        const newRowId = rows[rows.length - 1]?.id;
        if (newRowId) {
          const input = inputRefs.current.get(`${newRowId}-worker`);
          input?.focus();
        }
      }, 50);
    }

    if (e.key === "Tab" && !e.shiftKey && field === "notes") {
      if (rowIndex === rows.length - 1) {
        e.preventDefault();
        addRow();
      }
    }

    // Ctrl/Cmd + D to duplicate row
    if ((e.ctrlKey || e.metaKey) && e.key === "d") {
      e.preventDefault();
      duplicateRow(rowId);
    }

    // Ctrl/Cmd + S to save
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      saveAll();
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
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
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
              <Select value={globalProject} onValueChange={setGlobalProject}>
                <SelectTrigger>
                  <SelectValue placeholder="Select project or set per worker" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Per worker</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2">
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
                <Clock className="h-5 w-5" />
                Quick Time Entry
              </CardTitle>
              <CardDescription>
                {validRowCount} worker{validRowCount !== 1 ? "s" : ""} • {totals.regular.toFixed(1)} regular hrs • {totals.overtime.toFixed(1)} OT hrs • {formatCurrency(totals.cost)}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Keyboard className="h-4 w-4" />
              <span>Tab to navigate • Enter to add row • ⌘S to save</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-y bg-muted/50">
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 w-[250px]">
                    Worker
                  </th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 w-[100px]">
                    Hours
                  </th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 w-[80px]">
                    Rate
                  </th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 w-[150px]">
                    Overtime
                  </th>
                  {!globalProject && (
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 w-[200px]">
                      Project
                    </th>
                  )}
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">
                    Notes
                  </th>
                  <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3 w-[100px]">
                    Status
                  </th>
                  <th className="w-[80px]"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr
                    key={row.id}
                    className={cn(
                      "border-b transition-colors",
                      row.status === "saved" && "bg-green-50",
                      row.status === "error" && "bg-red-50",
                      existingEntries.has(row.worker_id) && "bg-amber-50"
                    )}
                  >
                    {/* Worker Selection */}
                    <td className="px-4 py-2">
                      <WorkerCombobox
                        workers={workers}
                        value={row.worker_id}
                        onSelect={(workerId) => handleWorkerSelect(row.id, workerId)}
                        inputRef={(el) => {
                          if (el) inputRefs.current.set(`${row.id}-worker`, el);
                        }}
                      />
                      {existingEntries.has(row.worker_id) && (
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
                        ref={(el) => {
                          if (el) inputRefs.current.set(`${row.id}-hours`, el);
                        }}
                      />
                    </td>

                    {/* Rate */}
                    <td className="px-4 py-2">
                      <span className="text-sm text-muted-foreground">
                        ${row.hourly_rate}/hr
                      </span>
                    </td>

                    {/* Overtime */}
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={row.has_overtime}
                          onCheckedChange={(checked) =>
                            handleOvertimeToggle(row.id, checked as boolean)
                          }
                        />
                        {row.has_overtime && (
                          <Input
                            type="number"
                            min="0"
                            step="0.5"
                            value={row.overtime_hours || ""}
                            onChange={(e) =>
                              handleOvertimeHoursChange(row.id, e.target.value)
                            }
                            className="w-16 text-center"
                            placeholder="OT"
                          />
                        )}
                      </div>
                    </td>

                    {/* Project (if not global) */}
                    {!globalProject && (
                      <td className="px-4 py-2">
                        <Select
                          value={row.project_id}
                          onValueChange={(value) => handleProjectChange(row.id, value)}
                        >
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
                        ref={(el) => {
                          if (el) inputRefs.current.set(`${row.id}-notes`, el);
                        }}
                      />
                    </td>

                    {/* Status */}
                    <td className="px-4 py-2 text-right">
                      {row.status === "saving" && (
                        <Loader2 className="h-4 w-4 animate-spin ml-auto" />
                      )}
                      {row.status === "saved" && (
                        <Badge variant="success" className="ml-auto">
                          <Check className="h-3 w-3 mr-1" />
                          Saved
                        </Badge>
                      )}
                      {row.status === "error" && (
                        <Badge variant="destructive" className="ml-auto">
                          Error
                        </Badge>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => duplicateRow(row.id)}
                          title="Duplicate row (⌘D)"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => removeRow(row.id)}
                        >
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
              Add Worker
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
            <span>{totals.regular.toFixed(1)} regular + {totals.overtime.toFixed(1)} OT hrs</span>
          </div>
          <Separator orientation="vertical" className="h-4" />
          <span className="font-medium">{formatCurrency(totals.cost)} total</span>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={saveDraft}>
            <FileText className="h-4 w-4 mr-2" />
            Save Draft
          </Button>
          <Button onClick={saveAll} disabled={saving || validRowCount === 0}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save All ({validRowCount})
          </Button>
        </div>
      </div>

      {/* Duplicate Warning Dialog */}
      <AlertDialog open={showDuplicateDialog} onOpenChange={setShowDuplicateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Duplicate Entries Detected</AlertDialogTitle>
            <AlertDialogDescription>
              The following workers already have time logged for {selectedDate}:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="my-4 space-y-2">
            {duplicates.map((dup) => (
              <div
                key={dup.row_id}
                className="flex items-center justify-between p-2 bg-amber-50 rounded"
              >
                <span className="font-medium">{dup.worker_name}</span>
                <span className="text-sm text-muted-foreground">
                  {dup.existing_hours}h already logged
                </span>
              </div>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowDuplicateDialog(false);
                const validRows = rows.filter((r) => r.worker_id && r.hours > 0);
                performSave(validRows);
              }}
            >
              Save Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Worker Combobox Component
interface WorkerComboboxProps {
  workers: Worker[];
  value: string;
  onSelect: (workerId: string) => void;
  inputRef?: (el: HTMLInputElement | null) => void;
}

function WorkerCombobox({ workers, value, onSelect, inputRef }: WorkerComboboxProps) {
  const [open, setOpen] = useState(false);
  const selectedWorker = workers.find((w) => w.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
          ref={inputRef as any}
        >
          {selectedWorker
            ? `${selectedWorker.first_name} ${selectedWorker.last_name}`
            : "Select worker..."}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[250px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search workers..." />
          <CommandList>
            <CommandEmpty>No worker found.</CommandEmpty>
            <CommandGroup>
              {workers.map((worker) => (
                <CommandItem
                  key={worker.id}
                  value={`${worker.first_name} ${worker.last_name}`}
                  onSelect={() => {
                    onSelect(worker.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === worker.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex-1">
                    <div>{worker.first_name} {worker.last_name}</div>
                    <div className="text-xs text-muted-foreground">
                      ${worker.hourly_rate}/hr
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
