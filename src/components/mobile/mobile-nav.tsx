"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Home, FolderKanban, Plus, Menu } from "lucide-react";
import { ClaudeIcon } from "@/components/icons/claude-icon";
import { cn } from "@/lib/utils";

/**
 * On a phone this app was Home / Projects / Quick Add / Invoices / More, and the
 * assistant appeared in neither the bar nor /more — the feature simply did not
 * exist on mobile, which is where site work happens.
 *
 * Claude takes the Invoices slot rather than becoming a sixth item: five is what
 * fits on a 375px bar without crowding, and billing a client is a desk task
 * while asking what a job has cost is not. Invoices is still one tap away under
 * More → Workspace. Swapping them back is a one-line change.
 */
interface NavItem {
  label: string;
  href: string;
  /** Lucide icons and the Claude mark are both plain className-taking components. */
  icon: React.ComponentType<{ className?: string }>;
  isCenter?: boolean;
}

const navItems: NavItem[] = [
  {
    label: "Home",
    href: "/",
    icon: Home,
  },
  {
    label: "Projects",
    href: "/projects",
    icon: FolderKanban,
  },
  {
    label: "Quick Add",
    href: "/quick-add",
    icon: Plus,
    isCenter: true,
  },
  {
    label: "Claude",
    href: "/assistant",
    icon: ClaudeIcon,
  },
  {
    label: "More",
    href: "/more",
    icon: Menu,
  },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <>
      {/* Bottom navigation - fixed at bottom with safe area handling */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="safe-area-inset-bottom">
          <div className="flex items-center justify-around h-16 px-2">
            {navItems.map((item) => {
              const isActive = pathname === item.href ||
                (item.href !== "/" && pathname.startsWith(item.href));
              const Icon = item.icon;

              if (item.isCenter) {
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex flex-col items-center justify-center relative"
                  >
                    {/* Elevated center button with liquid glass effect */}
                    <div className="absolute -top-6">
                      <div className="relative">
                        {/* Glow effect */}
                        <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl" />

                        {/* Button */}
                        <button className="relative flex items-center justify-center w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-2xl shadow-primary/30 hover:scale-105 active:scale-95 transition-transform">
                          <Icon className="w-6 h-6" />
                        </button>
                      </div>
                    </div>
                    <span className="text-[10px] font-medium text-muted-foreground mt-1">
                      {item.label}
                    </span>
                  </Link>
                );
              }

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex flex-col items-center justify-center min-w-[56px] h-full px-3 py-2 rounded-lg transition-colors",
                    "hover:bg-accent active:scale-95",
                    isActive
                      ? "text-primary"
                      : "text-muted-foreground"
                  )}
                >
                  <Icon className={cn("w-6 h-6 mb-1", isActive && "stroke-[2.5]")} />
                  <span className={cn(
                    "text-[10px] font-medium",
                    isActive && "font-semibold"
                  )}>
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Spacer to prevent content from being hidden behind bottom nav */}
      <div className="h-16 md:hidden" />
    </>
  );
}
