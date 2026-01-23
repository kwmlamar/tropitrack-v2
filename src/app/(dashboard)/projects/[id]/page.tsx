"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  formatCurrency,
  formatDate,
  getProjectStatusColor,
  calculatePercentage,
} from "@/lib/utils";
import {
  Pencil,
  Trash2,
  Calendar,
  MapPin,
  User,
  Mail,
  Phone,
  DollarSign,
  Clock,
  Package,
  FileText,
  CheckCircle2,
  Circle,
  Plus,
} from "lucide-react";
import type { Project, ProjectMilestone, TimeEntry, MaterialAllocation } from "@/types";

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const [project, setProject] = useState<Project | null>(null);
  const [milestones, setMilestones] = useState<ProjectMilestone[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [allocations, setAllocations] = useState<MaterialAllocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [costSummary, setCostSummary] = useState({
    labor: 0,
    materials: 0,
    equipment: 0,
    overhead: 0,
    total: 0,
  });
  const supabase = createClient();

  useEffect(() => {
    if (params.id) {
      fetchProjectData();
    }
  }, [params.id]);

  const fetchProjectData = async () => {
    try {
      // Fetch project
      const { data: projectData, error: projectError } = await supabase
        .from("projects")
        .select("*")
        .eq("id", params.id)
        .single();

      if (projectError) throw projectError;
      setProject(projectData);

      // Fetch milestones
      const { data: milestonesData } = await supabase
        .from("project_milestones")
        .select("*")
        .eq("project_id", params.id)
        .order("order_index");

      setMilestones(milestonesData || []);

      // Fetch recent time entries (filtered by company_id)
      let timeQuery = supabase
        .from("time_entries")
        .select("*, workers(first_name, last_name)")
        .eq("project_id", params.id);
      
      // Note: We get profile from useAuth, but need to check if it's available
      // For now, RLS policies will handle company filtering
      const { data: timeData } = await timeQuery
        .order("date", { ascending: false })
        .limit(10);

      setTimeEntries(timeData || []);

      // Fetch material allocations
      const { data: allocData } = await supabase
        .from("material_allocations")
        .select("*, materials(name, unit, unit_cost)")
        .eq("project_id", params.id)
        .order("allocated_date", { ascending: false });

      setAllocations(allocData || []);

      // Fetch cost summary from view
      const { data: costData } = await supabase
        .from("project_cost_summary")
        .select("*")
        .eq("project_id", params.id)
        .single();

      if (costData) {
        setCostSummary({
          labor: costData.labor_cost || 0,
          materials: costData.material_cost || 0,
          equipment: costData.equipment_cost || 0,
          overhead: costData.overhead_cost || 0,
          total: costData.total_cost || 0,
        });
      }
    } catch (error) {
      console.error("Error fetching project data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this project? This action cannot be undone.")) {
      return;
    }

    try {
      const { data, error } = await supabase
        .from("projects")
        .delete()
        .eq("id", params.id)
        .select();
      
      if (error) {
        console.error("Error deleting project:", error);
        toast({
          title: "Error deleting project",
          description: error.message || "An error occurred while deleting the project.",
          variant: "destructive",
        });
        return;
      }

      // Check if anything was actually deleted
      if (!data || data.length === 0) {
        toast({
          title: "Cannot delete project",
          description: "The project could not be deleted. This may be due to database permissions.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Project deleted",
        description: "The project has been successfully deleted.",
        variant: "success",
      });

      router.push("/projects");
    } catch (error) {
      console.error("Error deleting project:", error);
      const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
      toast({
        title: "Error deleting project",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const completedMilestones = milestones.filter((m) => m.is_completed).length;
  const milestoneProgress = milestones.length > 0
    ? calculatePercentage(completedMilestones, milestones.length)
    : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <h2 className="text-xl font-semibold mb-2">Project not found</h2>
        <Link href="/projects">
          <Button>Back to Projects</Button>
        </Link>
      </div>
    );
  }

  const budgetUsed = calculatePercentage(costSummary.total, project.budget);

  return (
    <div className="flex flex-col min-h-screen">
      <Header title={project.name} description={project.location}>
        <div className="flex gap-2">
          <Link href={`/projects/${project.id}/edit`}>
            <Button variant="outline">
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </Button>
          </Link>
          <Button variant="destructive" onClick={handleDelete}>
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
        </div>
      </Header>

      <div className="flex-1 p-6 space-y-6">
        {/* Overview Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Badge className={`${getProjectStatusColor(project.status)} text-sm`}>
                {project.status.replace("_", " ")}
              </Badge>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Budget
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{formatCurrency(project.budget)}</p>
              <Progress value={budgetUsed} className="mt-2 h-2" />
              <p className="text-xs text-muted-foreground mt-1">
                {budgetUsed.toFixed(1)}% used
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Contract Value
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{formatCurrency(project.contract_value)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Est. Profit: {formatCurrency(project.contract_value - costSummary.total)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Milestones
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {completedMilestones}/{milestones.length}
              </p>
              <Progress value={milestoneProgress} className="mt-2 h-2" />
              <p className="text-xs text-muted-foreground mt-1">
                {milestoneProgress.toFixed(0)}% complete
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="milestones">Milestones</TabsTrigger>
            <TabsTrigger value="costs">Costs</TabsTrigger>
            <TabsTrigger value="time">Time Entries</TabsTrigger>
            <TabsTrigger value="materials">Materials</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Project Info */}
              <Card>
                <CardHeader>
                  <CardTitle>Project Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {project.description && (
                    <div>
                      <p className="text-sm text-muted-foreground">Description</p>
                      <p className="mt-1">{project.description}</p>
                    </div>
                  )}
                  <Separator />
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Location</p>
                        <p className="font-medium">{project.location}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Start Date</p>
                        <p className="font-medium">{formatDate(project.start_date)}</p>
                      </div>
                    </div>
                    {project.estimated_end_date && (
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm text-muted-foreground">Est. End Date</p>
                          <p className="font-medium">{formatDate(project.estimated_end_date)}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Client Info */}
              <Card>
                <CardHeader>
                  <CardTitle>Client Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Client Name</p>
                      <p className="font-medium">{project.client_name}</p>
                    </div>
                  </div>
                  {project.client_email && (
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Email</p>
                        <a href={`mailto:${project.client_email}`} className="font-medium text-primary hover:underline">
                          {project.client_email}
                        </a>
                      </div>
                    </div>
                  )}
                  {project.client_phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Phone</p>
                        <a href={`tel:${project.client_phone}`} className="font-medium text-primary hover:underline">
                          {project.client_phone}
                        </a>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="milestones" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Project Milestones</CardTitle>
                  <CardDescription>Track key project phases and deadlines</CardDescription>
                </div>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Milestone
                </Button>
              </CardHeader>
              <CardContent>
                {milestones.length > 0 ? (
                  <div className="space-y-4">
                    {milestones.map((milestone) => (
                      <div
                        key={milestone.id}
                        className="flex items-center gap-4 p-4 rounded-lg border"
                      >
                        {milestone.is_completed ? (
                          <CheckCircle2 className="h-6 w-6 text-green-500" />
                        ) : (
                          <Circle className="h-6 w-6 text-muted-foreground" />
                        )}
                        <div className="flex-1">
                          <p className="font-medium">{milestone.name}</p>
                          {milestone.description && (
                            <p className="text-sm text-muted-foreground">{milestone.description}</p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">Due Date</p>
                          <p className="font-medium">{formatDate(milestone.due_date)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">No milestones defined yet</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="costs" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Labor Costs
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{formatCurrency(costSummary.labor)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Material Costs
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{formatCurrency(costSummary.materials)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Equipment Costs
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{formatCurrency(costSummary.equipment)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Overhead
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{formatCurrency(costSummary.overhead)}</p>
                </CardContent>
              </Card>
            </div>
            <Card>
              <CardHeader>
                <CardTitle>Total Project Cost</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{formatCurrency(costSummary.total)}</p>
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Labor</span>
                    <span>{calculatePercentage(costSummary.labor, costSummary.total || 1).toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Materials</span>
                    <span>{calculatePercentage(costSummary.materials, costSummary.total || 1).toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Equipment</span>
                    <span>{calculatePercentage(costSummary.equipment, costSummary.total || 1).toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Overhead</span>
                    <span>{calculatePercentage(costSummary.overhead, costSummary.total || 1).toFixed(1)}%</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="time" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Time Entries</CardTitle>
                  <CardDescription>Recent worker hours logged</CardDescription>
                </div>
                <Link href={`/time-tracking?project=${project.id}`}>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Log Time
                  </Button>
                </Link>
              </CardHeader>
              <CardContent>
                {timeEntries.length > 0 ? (
                  <div className="space-y-4">
                    {timeEntries.map((entry: any) => (
                      <div
                        key={entry.id}
                        className="flex items-center justify-between p-3 rounded-lg border"
                      >
                        <div>
                          <p className="font-medium">
                            {entry.workers?.first_name} {entry.workers?.last_name}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {formatDate(entry.date)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">{entry.regular_hours + entry.overtime_hours} hrs</p>
                          {entry.overtime_hours > 0 && (
                            <p className="text-xs text-orange-600">
                              +{entry.overtime_hours} OT
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">No time entries yet</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="materials" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Material Allocations</CardTitle>
                  <CardDescription>Materials used on this project</CardDescription>
                </div>
                <Link href={`/materials?project=${project.id}`}>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Allocate Materials
                  </Button>
                </Link>
              </CardHeader>
              <CardContent>
                {allocations.length > 0 ? (
                  <div className="space-y-4">
                    {allocations.map((alloc: any) => (
                      <div
                        key={alloc.id}
                        className="flex items-center justify-between p-3 rounded-lg border"
                      >
                        <div>
                          <p className="font-medium">{alloc.materials?.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {formatDate(alloc.allocated_date)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">
                            {alloc.quantity} {alloc.materials?.unit}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {formatCurrency(alloc.quantity * (alloc.materials?.unit_cost || 0))}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">No materials allocated yet</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
