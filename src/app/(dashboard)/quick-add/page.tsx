"use client";

import { Header } from "@/components/layout/header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Clock,
  FileText,
  Receipt,
  DollarSign,
  Users,
  FolderKanban,
} from "lucide-react";
import Link from "next/link";

// Decorative tile colors, not status indicators — rotated across the status-
// solid tokens (info/success/warning) purely for visual variety, since there
// are more tiles than tokens.
const quickActions = [
  {
    label: "Log Time",
    description: "Quick time entry",
    icon: Clock,
    href: "/time-entries/new",
    color: "bg-info-solid text-info-foreground",
  },
  {
    label: "New Invoice",
    description: "Create invoice",
    icon: FileText,
    href: "/invoices/new",
    color: "bg-success-solid text-success-foreground",
  },
  {
    label: "Scan Receipt",
    description: "Add expense",
    icon: Receipt,
    href: "/expenses/new",
    color: "bg-warning-solid text-warning-foreground",
  },
  {
    label: "Record Payment",
    description: "Log payment",
    icon: DollarSign,
    href: "/payments/new",
    color: "bg-success-solid text-success-foreground",
  },
  {
    label: "Add Employee",
    description: "New team member",
    icon: Users,
    href: "/employees/new",
    color: "bg-warning-solid text-warning-foreground",
  },
  {
    label: "New Project",
    description: "Start project",
    icon: FolderKanban,
    href: "/projects/new",
    color: "bg-info-solid text-info-foreground",
  },
];

export default function QuickAddPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <Header
        title="Quick Add"
        description="Fast access to common actions"
      />

      <div className="flex-1 p-6">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link key={action.href} href={action.href}>
                <Card className="h-full hover:border-primary transition-all hover:shadow-lg active:scale-95">
                  <CardContent className="p-6 flex flex-col items-center text-center gap-3">
                    <div className={`${action.color} p-4 rounded-2xl`}>
                      <Icon className="w-8 h-8" />
                    </div>
                    <div>
                      <p className="font-semibold text-base">{action.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {action.description}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
