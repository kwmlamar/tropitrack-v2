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
  ChevronLeft,
  ChevronRight,
  FileText,
  Receipt,
  Building2,
  Truck,
  CalendarDays,
  BarChart3,
} from "lucide-react";
import { BedrockIcon } from "@/components/icons/bedrock-icon";
import { getInitials } from "@/lib/utils";
import { useEffect, useState } from "react";

// Supabase Studio's sidebar metrics: 13rem expanded, 3rem icon rail, 3rem header.
const WIDTH_EXPANDED = "w-[13rem]";
const WIDTH_COLLAPSED = "w-[3rem]";
// Supabase runs nav icons at a 1.5 stroke — lighter than lucide's 2.0 default.
const ICON_STROKE = 1.5;

type NavItem = {
  name: string;
  href: string;
  // Wide enough for both lucide icons (strokeWidth: string | number) and the
  // local BedrockIcon, which takes className only.
  icon: React.ComponentType<{ className?: string; strokeWidth?: string | number }>;
};

/**
 * Grouped navigation. Invoices, Clients, Vendors, Schedule and Reports were all
 * fully built pages with no desktop entry point — reachable only from the mobile
 * bottom nav, or not at all. The office manager works on desktop, which is the
 * likeliest reason the invoice records drifted from the separate spreadsheet.
 *
 * Goals is deliberately absent from primary nav: /goals and the business_goals
 * rows both stay and remain reachable, but two manually incremented progress
 * bars are not navigation.
 */
const NAV_GROUPS: { label: string | null; items: NavItem[] }[] = [
  {
    label: null,
    items: [
      { name: "Today", href: "/dashboard", icon: LayoutDashboard },
      { name: "Bedrock AI", href: "/assistant", icon: BedrockIcon },
    ],
  },
  {
    label: "Money",
    items: [
      { name: "Estimates", href: "/estimates", icon: FileText },
      { name: "Invoices", href: "/invoices", icon: Receipt },
      { name: "Clients", href: "/clients", icon: Building2 },
    ],
  },
  {
    label: "Work",
    items: [
      { name: "Jobs", href: "/projects", icon: FolderKanban },
      { name: "Schedule", href: "/schedule", icon: CalendarDays },
      { name: "Time", href: "/time-tracking", icon: Clock },
    ],
  },
  {
    label: "Crew",
    items: [
      { name: "Crew", href: "/workers", icon: Users },
      { name: "Payroll", href: "/payroll", icon: DollarSign },
    ],
  },
  {
    label: "Buying",
    items: [
      { name: "Receipts", href: "/receipts", icon: ScanLine },
      { name: "Materials", href: "/materials", icon: Package },
      { name: "Vendors", href: "/vendors", icon: Truck },
    ],
  },
  {
    label: null,
    items: [{ name: "Reports", href: "/reports", icon: BarChart3 }],
  },
];

const NAV_BOTTOM: NavItem[] = [{ name: "Settings", href: "/settings", icon: Settings }];

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

  const navItem = (item: NavItem) => {
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
      <nav className="flex-1 overflow-y-auto py-2">
        {NAV_GROUPS.map((group, i) => (
          <div key={group.label ?? `group-${i}`}>
            {/* Section labels are meaningless on the icon rail; a rule keeps the
                groups from running together there instead. */}
            {group.label && isOpen && (
              <p className="px-2 pt-3 pb-1 font-mono text-[10px] uppercase tracking-widest text-foreground-lighter">
                {group.label}
              </p>
            )}
            {group.label && !isOpen && (
              <div className="mx-2 my-2 border-t border-border" />
            )}
            <ul className="space-y-0.5 px-1.5">{group.items.map(navItem)}</ul>
          </div>
        ))}
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
