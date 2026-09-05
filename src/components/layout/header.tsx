"use client";

import { SearchModal } from "@/components/search/search-modal";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationsBell } from "@/components/notifications/notifications-bell";

interface HeaderProps {
  /** Small mono kicker above the title — usually the section name. */
  eyebrow?: string;
  title: string;
  description?: string;
  children?: React.ReactNode;
}

/**
 * Page top bar. Matches the geometry the register-style pages set by hand
 * (px-6 py-4, a border-bottom, a 16px title over an optional mono eyebrow) so
 * every page reads the same, while keeping the global search / notifications /
 * theme controls that those hand-rolled bars don't carry.
 */
export function Header({ eyebrow, title, description, children }: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex-shrink-0">
      <div className="flex items-center justify-between gap-4 px-6 py-4">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-[11px] font-mono text-foreground-lighter uppercase tracking-widest">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="text-[16px] font-semibold text-foreground mt-0.5 truncate">{title}</h1>
          {description && !eyebrow && (
            <p className="text-[12px] text-foreground-lighter mt-0.5 truncate">{description}</p>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {children}
          <SearchModal />
          <NotificationsBell />
          <ThemeToggle variant="toggle" />
        </div>
      </div>
    </header>
  );
}
