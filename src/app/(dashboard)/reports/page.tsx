"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { formatCurrency, formatDate, getProjectStatusColor, calculatePercentage } from "@/lib/utils";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Users,
  Package,
  FolderKanban,
  Download,
  Calendar,
  PieChart,
} from "lucide-react";
import type { Project } from "@/types";

interface ProjectCostData {
  project_id: string;
  project_name: string;
  budget: number;
  contract_value: number;
  labor_cost: number;
  material_cost: number;
  equipment_cost: number;
  overhead_cost: number;
  total_cost: number;
  budget_variance: number;
  profit_margin_percent: number;
}

interface WorkerHoursData {
  worker_id: string;
  first_name: string;
  last_name: string;
  total_regular_hours: number;
  total_overtime_hours: number;
  total_earnings: number;
}

export default function ReportsPage() {
  const { profile, loading: authLoading } = useAuth();
  const [projectCosts, setProjectCosts] = useState<ProjectCostData[]>([]);
  const [workerHours, setWorkerHours] = useState<WorkerHoursData[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState<string>("all");
  const [dateRange, setDateRange] = useState<string>("this_month");
  const supabase = createClient();

  useEffect(() => {
    // Wait for auth to finish loading
    if (authLoading) return;
    
    // If profile exists but no company_id, stop loading
    if (profile && !profile.company_id) {
      setLoading(false);
      return;
    }
    
    // If profile has company_id, fetch data
    if (profile?.company_id) {
      fetchData();
    } else if (profile === null) {
      setLoading(false);
    }
  }, [selectedProject, dateRange, profile?.company_id, profile, authLoading]);

  const fetchData = async () => {
    if (!profile?.company_id) return;
    
    setLoading(true);
    try {
      // Fetch projects (filtered by company_id)
      const { data: projectsData } = await supabase
        .from("projects")
        .select("*")
        .eq("company_id", profile.company_id)
        .order("name");
      setProjects(projectsData || []);

      // Fetch project cost summary (filtered by company_id via projects join if needed, but for now we'll filter the result or assume the view includes company_id)
      // Actually, let's filter by the projects we just fetched
      const projectIds = projectsData?.map(p => p.id) || [];
      
      const { data: costData } = await supabase
        .from("project_cost_summary")
        .select("*")
        .in("project_id", projectIds);
      setProjectCosts(costData || []);

      // Fetch worker hours aggregated (filtered by company_id)
      const { data: workersData } = await supabase
        .from("workers")
        .select(`
          id,
          first_name,
          last_name,
          hourly_rate
        `)
        .eq("company_id", profile.company_id)
        .eq("status", "active");

      // Get time entries for each worker
      if (workersData) {
        const workerHoursData: WorkerHoursData[] = [];

        for (const worker of workersData) {
          let query = supabase
            .from("time_entries")
            .select("regular_hours, overtime_hours")
            .eq("worker_id", worker.id);

          if (selectedProject !== "all") {
            query = query.eq("project_id", selectedProject);
          }

          const { data: entries } = await query;

          const totalRegular = entries?.reduce((sum, e) => sum + e.regular_hours, 0) || 0;
          const totalOT = entries?.reduce((sum, e) => sum + e.overtime_hours, 0) || 0;
          const earnings = (totalRegular * (worker.hourly_rate || 0)) +
            (totalOT * (worker.hourly_rate || 0) * 1.5);

          if (totalRegular > 0 || totalOT > 0) {
            workerHoursData.push({
              worker_id: worker.id,
              first_name: worker.first_name,
              last_name: worker.last_name,
              total_regular_hours: totalRegular,
              total_overtime_hours: totalOT,
              total_earnings: earnings,
            });
          }
        }

        setWorkerHours(workerHoursData.sort((a, b) => b.total_earnings - a.total_earnings));
      }
    } catch (error) {
      console.error("Error fetching report data:", error);
    } finally {
      setLoading(false);
    }
  };

  // Calculate totals
  const totalRevenue = projectCosts.reduce((sum, p) => sum + p.contract_value, 0);
  const totalCosts = projectCosts.reduce((sum, p) => sum + p.total_cost, 0);
  const totalProfit = totalRevenue - totalCosts;
  const avgProfitMargin = projectCosts.length > 0
    ? projectCosts.reduce((sum, p) => sum + p.profit_margin_percent, 0) / projectCosts.length
    : 0;

  const totalLaborCost = projectCosts.reduce((sum, p) => sum + p.labor_cost, 0);
  const totalMaterialCost = projectCosts.reduce((sum, p) => sum + p.material_cost, 0);
  const totalEquipmentCost = projectCosts.reduce((sum, p) => sum + p.equipment_cost, 0);
  const totalOverheadCost = projectCosts.reduce((sum, p) => sum + p.overhead_cost, 0);

  const totalWorkerHours = workerHours.reduce((sum, w) => sum + w.total_regular_hours + w.total_overtime_hours, 0);
  const totalWorkerEarnings = workerHours.reduce((sum, w) => sum + w.total_earnings, 0);

  return (
    <div className="flex flex-col min-h-screen">
      <Header title="Reports" description="Analytics and business intelligence">
        <Button variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
      </Header>

      <div className="flex-1 p-6 space-y-6">
        {/* Filters */}
        <Card>
          <CardContent className="py-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <Select value={selectedProject} onValueChange={setSelectedProject}>
                <SelectTrigger className="w-full sm:w-[250px]">
                  <FolderKanban className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="All Projects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Projects</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <Calendar className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="this_week">This Week</SelectItem>
                  <SelectItem value="this_month">This Month</SelectItem>
                  <SelectItem value="this_quarter">This Quarter</SelectItem>
                  <SelectItem value="this_year">This Year</SelectItem>
                  <SelectItem value="all_time">All Time</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Key Metrics */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Revenue
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-success" />
                <span className="text-2xl font-bold">{formatCurrency(totalRevenue)}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                From {projectCosts.length} projects
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Costs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-destructive" />
                <span className="text-2xl font-bold">{formatCurrency(totalCosts)}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Labor, materials, overhead
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Net Profit
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <TrendingUp className={`h-4 w-4 ${totalProfit >= 0 ? "text-success" : "text-destructive"}`} />
                <span className={`text-2xl font-bold ${totalProfit >= 0 ? "text-success" : "text-destructive"}`}>
                  {formatCurrency(totalProfit)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Avg margin: {avgProfitMargin.toFixed(1)}%
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Labor Hours
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-info" />
                <span className="text-2xl font-bold">{totalWorkerHours.toFixed(0)}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {workerHours.length} workers
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Detailed Reports Tabs */}
        <Tabs defaultValue="project-costs" className="space-y-4">
          <TabsList>
            <TabsTrigger value="project-costs">Project Costs</TabsTrigger>
            <TabsTrigger value="cost-breakdown">Cost Breakdown</TabsTrigger>
            <TabsTrigger value="worker-hours">Worker Hours</TabsTrigger>
          </TabsList>

          <TabsContent value="project-costs" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Project Profitability</CardTitle>
                <CardDescription>Cost analysis by project</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {loading ? (
                  <div className="p-8 text-center">
                    <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
                  </div>
                ) : projectCosts.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Project</TableHead>
                        <TableHead>Contract Value</TableHead>
                        <TableHead>Total Cost</TableHead>
                        <TableHead>Budget Variance</TableHead>
                        <TableHead>Profit Margin</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {projectCosts.map((project) => (
                        <TableRow key={project.project_id}>
                          <TableCell className="font-medium">{project.project_name}</TableCell>
                          <TableCell>{formatCurrency(project.contract_value)}</TableCell>
                          <TableCell>{formatCurrency(project.total_cost)}</TableCell>
                          <TableCell>
                            <span className={project.budget_variance >= 0 ? "text-success" : "text-destructive"}>
                              {formatCurrency(project.budget_variance)}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Progress
                                value={Math.max(0, Math.min(100, project.profit_margin_percent))}
                                className="w-16 h-2"
                              />
                              <span className={`text-sm ${project.profit_margin_percent >= 0 ? "text-success" : "text-destructive"}`}>
                                {project.profit_margin_percent.toFixed(1)}%
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={project.profit_margin_percent >= 20 ? "success" : project.profit_margin_percent >= 0 ? "warning" : "destructive"}>
                              {project.profit_margin_percent >= 20 ? "Healthy" : project.profit_margin_percent >= 0 ? "Marginal" : "Loss"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="p-12 text-center">
                    <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">No project data available</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="cost-breakdown" className="space-y-4">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Cost Distribution</CardTitle>
                  <CardDescription>Breakdown by category</CardDescription>
                </CardHeader>
                <CardContent>
                  {/* Cost-breakdown legend: a 4-way chart series, not a status
                      indicator. Labor/Materials line up with the info/success
                      tokens; Equipment/Overhead have no status-token
                      equivalent, so they keep fixed chart colors (orange/
                      purple) rather than borrowing warning/destructive and
                      implying a severity that isn't there. */}
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded bg-info-solid"></div>
                          Labor
                        </span>
                        <span className="font-medium">{formatCurrency(totalLaborCost)}</span>
                      </div>
                      <Progress
                        value={calculatePercentage(totalLaborCost, totalCosts)}
                        className="h-2"
                      />
                      <p className="text-xs text-muted-foreground text-right">
                        {calculatePercentage(totalLaborCost, totalCosts).toFixed(1)}%
                      </p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded bg-success-solid"></div>
                          Materials
                        </span>
                        <span className="font-medium">{formatCurrency(totalMaterialCost)}</span>
                      </div>
                      <Progress
                        value={calculatePercentage(totalMaterialCost, totalCosts)}
                        className="h-2 [&>div]:bg-success-solid"
                      />
                      <p className="text-xs text-muted-foreground text-right">
                        {calculatePercentage(totalMaterialCost, totalCosts).toFixed(1)}%
                      </p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded bg-warning-solid"></div>
                          Equipment
                        </span>
                        <span className="font-medium">{formatCurrency(totalEquipmentCost)}</span>
                      </div>
                      <Progress
                        value={calculatePercentage(totalEquipmentCost, totalCosts)}
                        className="h-2 [&>div]:bg-warning-solid"
                      />
                      <p className="text-xs text-muted-foreground text-right">
                        {calculatePercentage(totalEquipmentCost, totalCosts).toFixed(1)}%
                      </p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded bg-foreground-lighter"></div>
                          Overhead
                        </span>
                        <span className="font-medium">{formatCurrency(totalOverheadCost)}</span>
                      </div>
                      <Progress
                        value={calculatePercentage(totalOverheadCost, totalCosts)}
                        className="h-2 [&>div]:bg-foreground-lighter"
                      />
                      <p className="text-xs text-muted-foreground text-right">
                        {calculatePercentage(totalOverheadCost, totalCosts).toFixed(1)}%
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Financial Summary</CardTitle>
                  <CardDescription>Overall business health</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    <div className="p-4 rounded-lg bg-muted">
                      <p className="text-sm text-muted-foreground">Total Contract Value</p>
                      <p className="text-3xl font-bold">{formatCurrency(totalRevenue)}</p>
                    </div>
                    <div className="p-4 rounded-lg bg-muted">
                      <p className="text-sm text-muted-foreground">Total Expenses</p>
                      <p className="text-3xl font-bold text-destructive">{formatCurrency(totalCosts)}</p>
                    </div>
                    <div className={`p-4 rounded-lg ${totalProfit >= 0 ? "bg-success-subtle" : "bg-destructive-subtle"}`}>
                      <p className="text-sm text-muted-foreground">Net Profit/Loss</p>
                      <p className={`text-3xl font-bold ${totalProfit >= 0 ? "text-success" : "text-destructive"}`}>
                        {formatCurrency(totalProfit)}
                      </p>
                      <p className="text-sm mt-1">
                        {totalRevenue > 0 ? `${((totalProfit / totalRevenue) * 100).toFixed(1)}% margin` : ""}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="worker-hours" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Worker Hours Summary</CardTitle>
                <CardDescription>Hours and earnings by worker</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {loading ? (
                  <div className="p-8 text-center">
                    <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
                  </div>
                ) : workerHours.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Worker</TableHead>
                        <TableHead>Regular Hours</TableHead>
                        <TableHead>Overtime Hours</TableHead>
                        <TableHead>Total Hours</TableHead>
                        <TableHead>Earnings</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {workerHours.map((worker) => (
                        <TableRow key={worker.worker_id}>
                          <TableCell className="font-medium">
                            {worker.first_name} {worker.last_name}
                          </TableCell>
                          <TableCell>{worker.total_regular_hours.toFixed(1)}</TableCell>
                          <TableCell>
                            {worker.total_overtime_hours > 0 ? (
                              <Badge variant="warning">
                                {worker.total_overtime_hours.toFixed(1)}
                              </Badge>
                            ) : (
                              "0"
                            )}
                          </TableCell>
                          <TableCell>
                            {(worker.total_regular_hours + worker.total_overtime_hours).toFixed(1)}
                          </TableCell>
                          <TableCell className="font-medium">
                            {formatCurrency(worker.total_earnings)}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/50 font-medium">
                        <TableCell>Total</TableCell>
                        <TableCell>
                          {workerHours.reduce((sum, w) => sum + w.total_regular_hours, 0).toFixed(1)}
                        </TableCell>
                        <TableCell>
                          {workerHours.reduce((sum, w) => sum + w.total_overtime_hours, 0).toFixed(1)}
                        </TableCell>
                        <TableCell>{totalWorkerHours.toFixed(1)}</TableCell>
                        <TableCell>{formatCurrency(totalWorkerEarnings)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                ) : (
                  <div className="p-12 text-center">
                    <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">No worker hours data available</p>
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
