"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { formatCurrency, formatDate, getProjectStatusColor } from "@/lib/utils";
import { MobileTimeEntry } from "@/components/mobile/mobile-time-entry";
import {
  FolderKanban,
  Users,
  Package,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  Clock,
  ArrowRight,
  Plus,
  Zap,
} from "lucide-react";
import Link from "next/link";
import type { Project, Worker, Material } from "@/types";

interface DashboardStats {
  activeProjects: number;
  totalWorkers: number;
  lowStockMaterials: number;
  totalRevenue: number;
  totalExpenses: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    activeProjects: 0,
    totalWorkers: 0,
    lowStockMaterials: 0,
    totalRevenue: 0,
    totalExpenses: 0,
  });
  const [recentProjects, setRecentProjects] = useState<Project[]>([]);
  const [lowStockItems, setLowStockItems] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();
  const { profile } = useAuth();

  useEffect(() => {
    if (profile?.company_id) {
      fetchDashboardData();
    }
  }, [profile?.company_id]);

  const fetchDashboardData = async () => {
    if (!profile?.company_id) return;
    
    setLoading(true);
    try {
      // Fetch active projects count, filtered by company_id
      const { count: projectCount } = await supabase
        .from("projects")
        .select("*", { count: "exact", head: true })
        .eq("company_id", profile.company_id)
        .eq("status", "active");

      // Fetch active workers count
      const { count: workerCount } = await supabase
        .from("workers")
        .select("*", { count: "exact", head: true })
        .eq("company_id", profile.company_id)
        .eq("status", "active");

      // Fetch recent projects, filtered by company_id
      const { data: projects } = await supabase
        .from("projects")
        .select("*")
        .eq("company_id", profile.company_id)
        .order("created_at", { ascending: false })
        .limit(5);

      // Fetch low stock materials, filtered by company_id
      const { data: lowStock, count: lowStockCount } = await supabase
        .from("materials")
        .select("*", { count: "exact" })
        .eq("company_id", profile.company_id)
        .lte("quantity_in_stock", 10) // Simplified for now as RPC might not be available or filtered
        .limit(5);

      // Calculate revenue from contracts, filtered by company_id
      const { data: revenueData } = await supabase
        .from("projects")
        .select("contract_value")
        .eq("company_id", profile.company_id)
        .in("status", ["active", "completed"]);

      const totalRevenue = revenueData?.reduce((sum, p) => sum + (p.contract_value || 0), 0) || 0;

      // Calculate actual expenses by summing all project costs from the view
      const { data: projectCosts } = await supabase
        .from("project_cost_summary")
        .select("labor_cost, material_cost, equipment_cost, overhead_cost");

      let laborCosts = 0;
      let materialCosts = 0;
      let equipmentCosts = 0;
      let overheadCosts = 0;

      if (projectCosts) {
        projectCosts.forEach((project: any) => {
          laborCosts += project.labor_cost || 0;
          materialCosts += project.material_cost || 0;
          equipmentCosts += project.equipment_cost || 0;
          overheadCosts += project.overhead_cost || 0;
        });
      }

      const totalExpenses = laborCosts + materialCosts + equipmentCosts + overheadCosts;

      setStats({
        activeProjects: projectCount || 0,
        totalWorkers: workerCount || 0,
        lowStockMaterials: lowStockCount || 0,
        totalRevenue,
        totalExpenses,
      });

      setRecentProjects(projects || []);
      setLowStockItems(lowStock || []);
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      title: "Active Projects",
      value: stats.activeProjects,
      icon: FolderKanban,
      description: "Currently in progress",
      color: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-100 dark:bg-blue-950/50",
    },
    {
      title: "Active Workers",
      value: stats.totalWorkers,
      icon: Users,
      description: "On payroll",
      color: "text-green-600 dark:text-green-400",
      bgColor: "bg-green-100 dark:bg-green-950/50",
    },
    {
      title: "Low Stock Items",
      value: stats.lowStockMaterials,
      icon: AlertTriangle,
      description: "Need reordering",
      color: "text-orange-600 dark:text-orange-400",
      bgColor: "bg-orange-100 dark:bg-orange-950/50",
    },
    {
      title: "Total Revenue",
      value: formatCurrency(stats.totalRevenue),
      icon: DollarSign,
      description: "From contracts",
      color: "text-emerald-600 dark:text-emerald-400",
      bgColor: "bg-emerald-100 dark:bg-emerald-950/50",
    },
  ];

  return (
    <div className="flex flex-col min-h-screen">
      <Header
        title="Dashboard"
        description="Welcome to TropiTrack - Your construction management hub"
      >
        <div className="flex items-center gap-2">
          <Link href="/time-tracking/quick">
            <Button variant="default">
              <Zap className="h-4 w-4 mr-2" />
              Quick Time Entry
            </Button>
          </Link>
          <Link href="/projects/new">
            <Button variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              New Project
            </Button>
          </Link>
        </div>
      </Header>

      <div className="flex-1 p-6 space-y-6">
        {/* Mobile Quick Time Entry - Only on mobile */}
        <div className="md:hidden">
          <MobileTimeEntry />
        </div>

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {statCards.map((stat) => (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {stat.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Main Content Grid */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Recent Projects */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Recent Projects</CardTitle>
                <CardDescription>Latest construction projects</CardDescription>
              </div>
              <Link href="/projects">
                <Button variant="ghost" size="sm">
                  View All
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
                  ))}
                </div>
              ) : recentProjects.length > 0 ? (
                <div className="space-y-4">
                  {recentProjects.map((project) => (
                    <Link
                      key={project.id}
                      href={`/projects/${project.id}`}
                      className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent transition-colors"
                    >
                      <div className="space-y-1">
                        <p className="font-medium">{project.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {project.client_name} - {project.location}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge className={getProjectStatusColor(project.status)}>
                          {project.status.replace("_", " ")}
                        </Badge>
                        <span className="text-sm font-medium">
                          {formatCurrency(project.budget)}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <FolderKanban className="h-12 w-12 mx-auto text-blue-600 dark:text-blue-400 mb-4" />
                  <p className="text-muted-foreground">No projects yet</p>
                  <Link href="/projects/new">
                    <Button className="mt-4">Create First Project</Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions & Alerts */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
                <CardDescription>Common tasks at your fingertips</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  <Link href="/time-tracking">
                    <Button variant="outline" className="w-full justify-start h-auto py-4">
                      <Clock className="h-5 w-5 mr-3 text-blue-600 dark:text-blue-400" />
                      <div className="text-left">
                        <p className="font-medium">Log Time</p>
                        <p className="text-xs text-muted-foreground">Enter worker hours</p>
                      </div>
                    </Button>
                  </Link>
                  <Link href="/materials">
                    <Button variant="outline" className="w-full justify-start h-auto py-4">
                      <Package className="h-5 w-5 mr-3 text-amber-600 dark:text-amber-400" />
                      <div className="text-left">
                        <p className="font-medium">Materials</p>
                        <p className="text-xs text-muted-foreground">Manage inventory</p>
                      </div>
                    </Button>
                  </Link>
                  <Link href="/workers/new">
                    <Button variant="outline" className="w-full justify-start h-auto py-4">
                      <Users className="h-5 w-5 mr-3 text-green-600 dark:text-green-400" />
                      <div className="text-left">
                        <p className="font-medium">Add Worker</p>
                        <p className="text-xs text-muted-foreground">New team member</p>
                      </div>
                    </Button>
                  </Link>
                  <Link href="/reports">
                    <Button variant="outline" className="w-full justify-start h-auto py-4">
                      <TrendingUp className="h-5 w-5 mr-3 text-purple-600 dark:text-purple-400" />
                      <div className="text-left">
                        <p className="font-medium">Reports</p>
                        <p className="text-xs text-muted-foreground">View analytics</p>
                      </div>
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>

            {/* Low Stock Alerts */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                    Low Stock Alerts
                  </CardTitle>
                  <CardDescription>Materials below minimum level</CardDescription>
                </div>
                <Link href="/materials">
                  <Button variant="ghost" size="sm">
                    View All
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent>
                {lowStockItems.length > 0 ? (
                  <div className="space-y-3">
                    {lowStockItems.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-orange-50 dark:bg-orange-950/50 border border-orange-100 dark:border-orange-900"
                      >
                        <div>
                          <p className="font-medium text-sm">{item.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.quantity_in_stock} {item.unit} remaining
                          </p>
                        </div>
                        <Badge variant="warning">
                          Min: {item.minimum_stock_level}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <Package className="h-10 w-10 mx-auto text-green-600 dark:text-green-400 mb-2" />
                    <p className="text-sm text-muted-foreground">
                      All materials are well stocked
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Financial Overview */}
        <Card>
          <CardHeader>
            <CardTitle>Financial Overview</CardTitle>
            <CardDescription>Revenue vs Expenses snapshot</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-3">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Total Revenue</p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {formatCurrency(stats.totalRevenue)}
                </p>
                <Progress value={100} className="h-2" />
              </div>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Total Expenses</p>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                  {formatCurrency(stats.totalExpenses)}
                </p>
                <Progress
                  value={(stats.totalExpenses / stats.totalRevenue) * 100 || 0}
                  className="h-2"
                />
              </div>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Net Profit</p>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {formatCurrency(stats.totalRevenue - stats.totalExpenses)}
                </p>
                <Progress
                  value={((stats.totalRevenue - stats.totalExpenses) / stats.totalRevenue) * 100 || 0}
                  className="h-2"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
