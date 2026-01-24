"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import {
  LayoutDashboard,
  FolderKanban,
  Users,
  Users2,
  Clock,
  Package,
  Truck,
  DollarSign,
  BarChart3,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  FileText,
  Receipt,
  CalendarDays,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getInitials } from "@/lib/utils";
import { useState } from "react";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "AI Assistant", href: "/assistant", icon: Sparkles, highlight: true },
  { name: "Schedule", href: "/schedule", icon: CalendarDays },
  { name: "Projects", href: "/projects", icon: FolderKanban },
  { name: "Estimates", href: "/estimates", icon: FileText },
  { name: "Invoices", href: "/invoices", icon: Receipt },
  { name: "Clients", href: "/clients", icon: Users2 },
  { name: "Workers", href: "/workers", icon: Users },
  { name: "Time Tracking", href: "/time-tracking", icon: Clock },
  { name: "Materials", href: "/materials", icon: Package },
  { name: "Vendors", href: "/vendors", icon: Truck },
  { name: "Payroll", href: "/payroll", icon: DollarSign },
  { name: "Reports", href: "/reports", icon: BarChart3 },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { profile, signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      className={cn(
        "hidden md:flex flex-col border-r bg-card transition-all duration-300",
        collapsed ? "w-[70px]" : "w-[250px]"
      )}
    >
      {/* Logo */}
      <div className={cn(
        "flex h-16 items-center border-b",
        collapsed ? "justify-center" : "justify-between"
      )}>
        <Link href="/dashboard" className={cn(
          "flex items-center",
          collapsed ? "justify-center" : "gap-2 px-2"
        )}>
          <div className="h-16 w-16 flex items-center justify-center flex-shrink-0 relative">
            <Image
              src="/logo.png"
              alt="TropiTrack Logo"
              width={64}
              height={64}
              className="object-contain"
              priority
            />
          </div>
          {!collapsed && (
            <span className="font-bold text-lg">TropiTrack</span>
          )}
        </Link>
        {!collapsed && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 mr-2"
            onClick={() => setCollapsed(!collapsed)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 py-4">
        <nav className="space-y-1 px-2">
          {navigation.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const isHighlight = "highlight" in item && item.highlight;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : isHighlight
                    ? "text-primary hover:bg-primary/10"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
                title={collapsed ? item.name : undefined}
              >
                <item.icon className={cn("h-5 w-5 flex-shrink-0", isHighlight && !isActive && "text-primary")} />
                {!collapsed && (
                  <span className="flex items-center gap-2">
                    {item.name}
                    {isHighlight && !isActive && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">
                        NEW
                      </span>
                    )}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </ScrollArea>

      {/* User Profile */}
      <div className="border-t p-4">
        {!collapsed ? (
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9">
              <AvatarImage src={profile?.avatar_url || ""} />
              <AvatarFallback>
                {profile?.full_name ? getInitials(profile.full_name) : "U"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {profile?.full_name || "User"}
              </p>
              <p className="text-xs text-muted-foreground capitalize">
                {profile?.role?.replace("_", " ") || "User"}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 flex-shrink-0"
              onClick={() => signOut()}
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Avatar className="h-9 w-9">
              <AvatarImage src={profile?.avatar_url || ""} />
              <AvatarFallback>
                {profile?.full_name ? getInitials(profile.full_name) : "U"}
              </AvatarFallback>
            </Avatar>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => signOut()}
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
