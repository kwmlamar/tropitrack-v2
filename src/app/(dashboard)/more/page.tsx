"use client";

import { Header } from "@/components/layout/header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/lib/auth-context";
import {
  User,
  Settings,
  Building2,
  Users,
  CreditCard,
  Bell,
  HelpCircle,
  LogOut,
  ChevronRight,
  Moon,
  Sun,
  FileText,
  Receipt,
  CalendarDays,
  Clock,
  ScanLine,
  Package,
  Truck,
  BarChart3,
  Target,
  FolderKanban,
} from "lucide-react";
import Link from "next/link";
import { useTheme } from "next-themes";

const menuSections = [
  {
    // Mirrors the desktop sidebar groups — before this, Clients, Vendors,
    // Schedule and Reports had no entry point on either form factor.
    title: "Workspace",
    items: [
      { label: "Jobs", description: "Active projects", icon: FolderKanban, href: "/projects" },
      { label: "Estimates", description: "Price work", icon: FileText, href: "/estimates" },
      { label: "Invoices", description: "Bill clients", icon: Receipt, href: "/invoices" },
      { label: "Clients", description: "Who you work for", icon: Building2, href: "/clients" },
      { label: "Schedule", description: "What is on when", icon: CalendarDays, href: "/schedule" },
      { label: "Time", description: "Crew hours", icon: Clock, href: "/time-tracking" },
      { label: "Crew", description: "Your workers", icon: Users, href: "/workers" },
      { label: "Receipts", description: "Capture spend", icon: ScanLine, href: "/receipts" },
      { label: "Materials", description: "Catalog and prices", icon: Package, href: "/materials" },
      { label: "Vendors", description: "Who you buy from", icon: Truck, href: "/vendors" },
      { label: "Reports", description: "Business reporting", icon: BarChart3, href: "/reports" },
      { label: "Goals", description: "Targets and progress", icon: Target, href: "/goals" },
    ],
  },
  {
    title: "Account",
    items: [
      {
        label: "Profile",
        description: "Manage your profile",
        icon: User,
        href: "/profile",
      },
      {
        label: "Company Settings",
        description: "Company details",
        icon: Building2,
        href: "/settings/company",
      },
    ],
  },
  {
    title: "Management",
    items: [
      {
        label: "Employees",
        description: "Manage team members",
        icon: Users,
        href: "/employees",
      },
      {
        label: "Payroll",
        description: "Process payroll",
        icon: CreditCard,
        href: "/payroll",
      },
    ],
  },
  {
    title: "Preferences",
    items: [
      {
        label: "Settings",
        description: "App preferences",
        icon: Settings,
        href: "/settings",
      },
      {
        label: "Notifications",
        description: "Notification settings",
        icon: Bell,
        href: "/settings/notifications",
      },
    ],
  },
  {
    title: "Support",
    items: [
      {
        label: "Help & Support",
        description: "Get help",
        icon: HelpCircle,
        href: "/help",
      },
    ],
  },
];

export default function MorePage() {
  const { profile, signOut } = useAuth();
  const { theme, setTheme } = useTheme();

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Header title="More" description="Settings and additional options" />

      <div className="flex-1 p-6 pb-24 md:pb-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* User info card */}
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="w-8 h-8 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-lg">
                    {profile?.full_name || "User"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {profile?.email}
                  </p>
                  <p className="text-xs text-muted-foreground capitalize mt-1">
                    {profile?.role?.replace("_", " ")}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Theme toggle */}
          <Card>
            <CardContent className="p-0">
              <button
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="w-full p-4 flex items-center justify-between hover:bg-accent transition-colors"
              >
                <div className="flex items-center gap-3">
                  {theme === "dark" ? (
                    <Moon className="w-5 h-5 text-muted-foreground" />
                  ) : (
                    <Sun className="w-5 h-5 text-muted-foreground" />
                  )}
                  <div className="text-left">
                    <p className="font-medium">Theme</p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {theme === "dark" ? "Dark mode" : "Light mode"}
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </button>
            </CardContent>
          </Card>

          {/* Menu sections */}
          {menuSections.map((section) => (
            <div key={section.title} className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground px-1">
                {section.title}
              </h3>
              <Card>
                <CardContent className="p-0">
                  {section.items.map((item, index) => {
                    const Icon = item.icon;
                    return (
                      <div key={item.href}>
                        {index > 0 && <Separator />}
                        <Link href={item.href}>
                          <div className="p-4 flex items-center justify-between hover:bg-accent transition-colors">
                            <div className="flex items-center gap-3">
                              <Icon className="w-5 h-5 text-muted-foreground" />
                              <div>
                                <p className="font-medium">{item.label}</p>
                                <p className="text-xs text-muted-foreground">
                                  {item.description}
                                </p>
                              </div>
                            </div>
                            <ChevronRight className="w-5 h-5 text-muted-foreground" />
                          </div>
                        </Link>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </div>
          ))}

          {/* Sign out button */}
          <Card>
            <CardContent className="p-0">
              <button
                onClick={handleSignOut}
                className="w-full p-4 flex items-center gap-3 hover:bg-destructive/10 transition-colors text-destructive"
              >
                <LogOut className="w-5 h-5" />
                <span className="font-medium">Sign Out</span>
              </button>
            </CardContent>
          </Card>

          {/* App version */}
          <p className="text-center text-xs text-muted-foreground">
            TropiTrack v2.0.0
          </p>
        </div>
      </div>
    </div>
  );
}
