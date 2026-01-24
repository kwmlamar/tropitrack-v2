"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Clock, Plus, Check, Loader2, Wifi, WifiOff, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Project, Worker } from "@/types";
import { useOfflineQueue } from "@/hooks/use-offline-queue";

interface QuickEntry {
  worker_id: string;
  hours: number;
}

export function MobileTimeEntry() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const supabase = createClient();
  const { addToQueue, isOnline } = useOfflineQueue();

  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [selectedProject, setSelectedProject] = useState("");
  const [entries, setEntries] = useState<QuickEntry[]>([]);
  const [selectedWorker, setSelectedWorker] = useState("");
  const [hours, setHours] = useState("8");

  useEffect(() => {
    if (open) {
      fetchData();
    }
  }, [open]);

  const fetchData = async () => {
    setLoading(true);
    try {
      let projectsQuery = supabase
        .from("projects")
        .select("*")
        .in("status", ["active", "planning"]);

      let workersQuery = supabase
        .from("workers")
        .select("*")
        .eq("status", "active");

      if (profile?.company_id) {
        projectsQuery = projectsQuery.eq("company_id", profile.company_id);
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

  const handleAddWorker = () => {
    if (!selectedWorker || !hours) return;

    const existing = entries.find((e) => e.worker_id === selectedWorker);
    if (existing) {
      toast({
        title: "Already added",
        description: "This worker is already in the list.",
        variant: "destructive",
      });
      return;
    }

    setEntries([...entries, { worker_id: selectedWorker, hours: parseFloat(hours) }]);
    setSelectedWorker("");
    setHours("8");
  };

  const handleRemoveWorker = (workerId: string) => {
    setEntries(entries.filter((e) => e.worker_id !== workerId));
  };

  const handleSave = async () => {
    if (!user || !profile?.company_id || !selectedProject || entries.length === 0) {
      toast({
        title: "Missing information",
        description: "Please select a project and add at least one worker.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const timeEntries = entries.map((entry) => {
        const worker = workers.find((w) => w.id === entry.worker_id);
        const endHour = 7 + entry.hours + 1;

        return {
          worker_id: entry.worker_id,
          project_id: selectedProject,
          company_id: profile.company_id,
          date: selectedDate,
          start_time: "07:00",
          end_time: `${Math.floor(endHour)
            .toString()
            .padStart(2, "0")}:${Math.round((endHour % 1) * 60)
            .toString()
            .padStart(2, "0")}`,
          break_duration_minutes: 60,
          regular_hours: Math.min(8, entry.hours),
          overtime_hours: Math.max(0, entry.hours - 8),
          created_by: user.id,
        };
      });

      if (isOnline) {
        const { error } = await supabase.from("time_entries").insert(timeEntries);
        if (error) throw error;

        toast({
          title: "Time logged",
          description: `${entries.length} worker(s) logged successfully.`,
          variant: "success",
        });
      } else {
        // Add to offline queue
        await addToQueue({
          type: "time_entry",
          action: "insert",
          data: timeEntries,
          timestamp: Date.now(),
        });

        toast({
          title: "Queued for sync",
          description: "Entries will be synced when you're back online.",
          variant: "default",
        });
      }

      // Reset form
      setEntries([]);
      setSelectedProject("");
      setOpen(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const getWorkerName = (workerId: string) => {
    const worker = workers.find((w) => w.id === workerId);
    return worker ? `${worker.first_name} ${worker.last_name}` : "Unknown";
  };

  const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="lg" className="w-full">
          <Clock className="h-5 w-5 mr-2" />
          Quick Time Entry
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="h-[90vh] flex flex-col p-0">
        <SheetHeader className="px-6 py-4 border-b">
          <div className="flex items-center justify-between">
            <div>
              <SheetTitle className="text-xl">Quick Time Entry</SheetTitle>
              <SheetDescription>Fast time logging for your crew</SheetDescription>
            </div>
            <Badge variant={isOnline ? "success" : "secondary"} className="gap-1">
              {isOnline ? (
                <>
                  <Wifi className="h-3 w-3" />
                  Online
                </>
              ) : (
                <>
                  <WifiOff className="h-3 w-3" />
                  Offline
                </>
              )}
            </Badge>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Date & Project */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="date" className="text-base">
                    Date
                  </Label>
                  <Input
                    id="date"
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="h-12 text-base"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="project" className="text-base">
                    Project
                  </Label>
                  <Select value={selectedProject} onValueChange={setSelectedProject}>
                    <SelectTrigger id="project" className="h-12 text-base">
                      <SelectValue placeholder="Select project" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Add Worker */}
              <Card className="border-2 border-dashed">
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Plus className="h-4 w-4" />
                    Add Worker
                  </div>

                  <div className="space-y-3">
                    <Select
                      value={selectedWorker}
                      onValueChange={setSelectedWorker}
                    >
                      <SelectTrigger className="h-12 text-base">
                        <SelectValue placeholder="Select worker" />
                      </SelectTrigger>
                      <SelectContent>
                        {workers.map((worker) => (
                          <SelectItem key={worker.id} value={worker.id}>
                            {worker.first_name} {worker.last_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <div className="flex gap-2">
                      <div className="flex-1">
                        <Input
                          type="number"
                          min="0"
                          max="24"
                          step="0.5"
                          value={hours}
                          onChange={(e) => setHours(e.target.value)}
                          placeholder="Hours"
                          className="h-12 text-base text-center"
                        />
                      </div>
                      <Button
                        onClick={handleAddWorker}
                        disabled={!selectedWorker || !hours}
                        size="lg"
                      >
                        <Plus className="h-5 w-5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Workers List */}
              {entries.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Users className="h-4 w-4" />
                      Workers ({entries.length})
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {totalHours.toFixed(1)} total hours
                    </span>
                  </div>

                  {entries.map((entry) => (
                    <Card key={entry.worker_id}>
                      <CardContent className="p-4 flex items-center justify-between">
                        <div>
                          <p className="font-medium">
                            {getWorkerName(entry.worker_id)}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {entry.hours} hours
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveWorker(entry.worker_id)}
                          className="text-destructive"
                        >
                          Remove
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="border-t p-6 pb-safe">
          <Button
            onClick={handleSave}
            disabled={saving || !selectedProject || entries.length === 0}
            size="lg"
            className="w-full h-14 text-base"
          >
            {saving ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Check className="h-5 w-5 mr-2" />
                Save {entries.length} {entries.length === 1 ? "Entry" : "Entries"}
              </>
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
