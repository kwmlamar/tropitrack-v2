"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import {
  LayoutDashboard,
  FolderKanban,
  Users,
  Clock,
  Package,
  DollarSign,
  Settings,
  LogOut,
  ScanLine,
  Target,
  GanttChartSquare,
  ChevronLeft,
  ChevronRight,
  FileText,
} from "lucide-react";
import { ClaudeIcon } from "@/components/icons/claude-icon";
import { getInitials } from "@/lib/utils";
import { useEffect, useState } from "react";

// Top-level /gantt removed in #5 — Gantt is now an estimate-scoped view (Summary mode on /estimates/[id]).
// Top-level /materials remains as the cross-project catalog browser; per-estimate
// Materials Calc lives at /estimates/[id]/materials.
const NAV_MAIN = [
  { name: "Dashboard",    href: "/dashboard",     icon: LayoutDashboard },
  { name: "Claude",        href: "/assistant",     icon: ClaudeIcon },
  { name: "Jobs",         href: "/projects",      icon: FolderKanban },
  { name: "Estimates",   href: "/estimates",     icon: FileText },
  { name: "Crew",         href: "/workers",       icon: Users },
  { name: "Time",         href: "/time-tracking", icon: Clock },
  { name: "Materials",    href: "/materials",     icon: Package },
  { name: "Receipts",     href: "/receipts",      icon: ScanLine },
  { name: "Payroll",      href: "/payroll",       icon: DollarSign },
  { name: "Goals",        href: "/goals",         icon: Target },
];

const NAV_BOTTOM = [
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { profile, signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  const isOpen = !collapsed;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Control" && !e.repeat) setCollapsed((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col h-screen bg-[#18191b] border-r border-[#34373c] transition-all duration-200 flex-shrink-0",
        isOpen ? "w-[200px]" : "w-[52px]"
      )}
    >
      {/* Wordmark */}
      <div className={cn(
        "flex items-center h-12 border-b border-[#34373c] px-3 flex-shrink-0",
        !isOpen && "justify-center px-0"
      )}>
        {isOpen ? (
          <div className="flex items-center justify-between w-full">
            <span className="font-mono text-[11px] font-semibold tracking-[0.22em] text-[#d0d0d0] uppercase select-none">
              Bedrock
            </span>
            <button
              onClick={() => setCollapsed((v) => !v)}
              className="text-[#555] hover:text-[#999] transition-colors p-1 rounded"
              title="Collapse sidebar"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setCollapsed(false)}
            className="text-[#555] hover:text-[#999] transition-colors"
            title="Expand sidebar"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Main nav */}
      <nav className="flex-1 py-2 overflow-hidden">
        <ul className="space-y-px px-1.5">
          {NAV_MAIN.map((item) => {
            const active = isActive(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  title={!isOpen ? item.name : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded px-2 py-[7px] text-[13px] transition-colors duration-100 group",
                    active
                      ? "bg-[#2d3035] text-[#d8d8d8] border-l-2 border-[#F5A623] pl-[6px]"
                      : "text-[#888] hover:text-[#bcbcbc] hover:bg-[#252729] border-l-2 border-transparent pl-[6px]"
                  )}
                >
                  <item.icon
                    className={cn(
                      "h-4 w-4 flex-shrink-0 transition-colors",
                      active ? "text-[#F5A623]" : "text-[#666] group-hover:text-[#999]"
                    )}
                  />
                  {isOpen && (
                    <span className="truncate font-medium">{item.name}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Bottom nav */}
      <div className="border-t border-[#34373c] py-2 px-1.5">
        <ul className="space-y-px mb-2">
          {NAV_BOTTOM.map((item) => {
            const active = isActive(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  title={!isOpen ? item.name : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded px-2 py-[7px] text-[13px] transition-colors duration-100 group",
                    active
                      ? "bg-[#2d3035] text-[#d8d8d8] border-l-2 border-[#F5A623] pl-[6px]"
                      : "text-[#888] hover:text-[#bcbcbc] hover:bg-[#252729] border-l-2 border-transparent pl-[6px]"
                  )}
                >
                  <item.icon className={cn(
                    "h-4 w-4 flex-shrink-0",
                    active ? "text-[#F5A623]" : "text-[#666] group-hover:text-[#999]"
                  )} />
                  {isOpen && <span className="truncate font-medium">{item.name}</span>}
                </Link>
              </li>
            );
          })}
        </ul>

        {/* User row */}
        <div className={cn(
          "flex items-center gap-2 rounded px-2 py-1.5",
          !isOpen && "justify-center px-0"
        )}>
          <div className="flex-shrink-0 h-6 w-6 rounded-full bg-[#3a3d42] flex items-center justify-center text-[10px] font-mono font-semibold text-[#aaa]">
            {profile?.full_name ? getInitials(profile.full_name) : "—"}
          </div>
          {isOpen && (
            <>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium text-[#888] truncate">
                  {profile?.full_name || profile?.email || "User"}
                </p>
              </div>
              <button
                onClick={() => signOut()}
                className="text-[#555] hover:text-[#999] transition-colors"
                title="Sign out"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
