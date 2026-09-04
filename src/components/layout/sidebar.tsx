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
  ChevronLeft,
  ChevronRight,
  FileText,
} from "lucide-react";
import { ClaudeIcon } from "@/components/icons/claude-icon";
import { getInitials } from "@/lib/utils";
import { useEffect, useState } from "react";

// Supabase Studio's sidebar metrics: 13rem expanded, 3rem icon rail, 3rem header.
const WIDTH_EXPANDED = "w-[13rem]";
const WIDTH_COLLAPSED = "w-[3rem]";
// Supabase runs nav icons at a 1.5 stroke — lighter than lucide's 2.0 default.
const ICON_STROKE = 1.5;

// Top-level /gantt removed in #5 — Gantt is now an estimate-scoped view (Summary mode on /estimates/[id]).
// Top-level /materials remains as the cross-project catalog browser; per-estimate
// Materials Calc lives at /estimates/[id]/materials.
const NAV_MAIN = [
  { name: "Dashboard",    href: "/dashboard",     icon: LayoutDashboard },
  { name: "Claude",       href: "/assistant",     icon: ClaudeIcon },
  { name: "Jobs",         href: "/projects",      icon: FolderKanban },
  { name: "Estimates",    href: "/estimates",     icon: FileText },
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

  const navItem = (item: (typeof NAV_MAIN)[number]) => {
    const active = isActive(item.href);
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          title={!isOpen ? item.name : undefined}
          aria-current={active ? "page" : undefined}
          className={cn(
            "group flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
            !isOpen && "justify-center px-0",
            active
              ? "bg-surface-300 font-medium text-foreground"
              : "text-foreground-lighter hover:bg-surface-200 hover:text-foreground"
          )}
        >
          <item.icon
            strokeWidth={ICON_STROKE}
            className={cn(
              "h-4 w-4 flex-shrink-0 transition-colors",
              active ? "text-brand" : "text-foreground-lighter group-hover:text-foreground"
            )}
          />
          {isOpen && <span className="truncate">{item.name}</span>}
        </Link>
      </li>
    );
  };

  return (
    <aside
      className={cn(
        // Supabase's sidebar shares the page canvas — it reads as part of the
        // background, not as a separate panel. Only the right rule separates it.
        "hidden md:flex flex-col h-screen flex-shrink-0 bg-background border-r border-border transition-all duration-200",
        isOpen ? WIDTH_EXPANDED : WIDTH_COLLAPSED
      )}
    >
      {/* Wordmark — 3rem to match Supabase's header height */}
      <div
        className={cn(
          "flex h-12 flex-shrink-0 items-center border-b border-border px-3",
          !isOpen && "justify-center px-0"
        )}
      >
        {isOpen ? (
          <div className="flex w-full items-center justify-between">
            <span className="select-none font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-foreground">
              Bedrock
            </span>
            <button
              onClick={() => setCollapsed(true)}
              className="rounded-md p-1 text-foreground-lighter transition-colors hover:bg-surface-200 hover:text-foreground"
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
            >
              <ChevronLeft className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setCollapsed(false)}
            className="rounded-md p-1 text-foreground-lighter transition-colors hover:bg-surface-200 hover:text-foreground"
            title="Expand sidebar"
            aria-label="Expand sidebar"
          >
            <ChevronRight className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} />
          </button>
        )}
      </div>

      {/* Main nav */}
      <nav className="flex-1 overflow-hidden py-2">
        <ul className="space-y-0.5 px-1.5">{NAV_MAIN.map(navItem)}</ul>
      </nav>

      {/* Bottom nav */}
      <div className="border-t border-border px-1.5 py-2">
        <ul className="mb-2 space-y-0.5">{NAV_BOTTOM.map(navItem)}</ul>

        {/* User row */}
        <div
          className={cn(
            "flex items-center gap-2 rounded-md px-2 py-1.5",
            !isOpen && "justify-center px-0"
          )}
        >
          <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-surface-400 text-[10px] font-semibold text-foreground-light">
            {profile?.full_name ? getInitials(profile.full_name) : "—"}
          </div>
          {isOpen && (
            <>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-foreground-light">
                  {profile?.full_name || profile?.email || "User"}
                </p>
              </div>
              <button
                onClick={() => signOut()}
                className="rounded-md p-1 text-foreground-lighter transition-colors hover:bg-surface-200 hover:text-foreground"
                title="Sign out"
                aria-label="Sign out"
              >
                <LogOut className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} />
              </button>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
