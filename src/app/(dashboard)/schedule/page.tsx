"use client";

import { useMemo, useState } from "react";
import { Header } from "@/components/layout/header";
import { ModernCalendar } from "@/components/calendar";
import { useCalendarEvents } from "@/hooks/use-calendar-events";
import { StatusDot, type Tone } from "@/components/ui/status";
import { cn } from "@/lib/utils";
import { Check, Loader2 } from "lucide-react";
import type { CalendarFilters, CalendarEvent } from "@/types";

// Tones mirror eventTypeConfig in components/calendar/calendar-event.tsx, so a
// filter's dot is the same colour as the events it controls on the grid.
const filterOptions: { key: keyof CalendarFilters; label: string; tone: Tone }[] = [
  { key: "showProjects", label: "Projects", tone: "info" },
  { key: "showMilestones", label: "Milestones", tone: "brand" },
  { key: "showInvoices", label: "Invoices due", tone: "danger" },
  { key: "showDeliveries", label: "Deliveries", tone: "warning" },
  { key: "showTimesheets", label: "Timesheets", tone: "info" },
  { key: "showEquipment", label: "Equipment", tone: "warning" },
];

const SHORTCUTS: [string, string][] = [
  ["Today", "T"],
  ["Month view", "M"],
  ["Week view", "W"],
  ["Day view", "D"],
  ["Agenda view", "A"],
  ["Navigate", "← →"],
];

const ALL_ON: CalendarFilters = {
  showProjects: true,
  showMilestones: true,
  showDeliveries: true,
  showInvoices: true,
  showTimesheets: true,
  showEquipment: true,
};
const ALL_OFF: CalendarFilters = {
  showProjects: false,
  showMilestones: false,
  showDeliveries: false,
  showInvoices: false,
  showTimesheets: false,
  showEquipment: false,
};

export default function SchedulePage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [filters, setFilters] = useState<CalendarFilters>({
    ...ALL_ON,
    showTimesheets: false,
    showEquipment: false,
  });

  const { events, loading, error } = useCalendarEvents({ currentDate, filters });

  const handleEventClick = (event: CalendarEvent) => {
    if (event.url) window.location.href = event.url;
  };

  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekFromNow = new Date(today);
    weekFromNow.setDate(weekFromNow.getDate() + 7);

    const upcoming = events.filter((e) => new Date(e.date) >= today).length;
    const overdueInvoices = events.filter(
      (e) => e.type === "invoice_due" && new Date(e.date) < today
    ).length;
    const milestones = events.filter((e) => {
      const d = new Date(e.date);
      return e.type === "milestone" && d >= today && d <= weekFromNow;
    }).length;

    return [
      { label: "Total Events", value: String(events.length) },
      { label: "Upcoming", value: String(upcoming) },
      { label: "Overdue Invoices", value: String(overdueInvoices), danger: overdueInvoices > 0 },
      { label: "Milestones This Week", value: String(milestones), accent: milestones > 0 },
    ];
  }, [events]);

  return (
    <div className="flex flex-col h-full overflow-auto bg-background">
      <Header eyebrow="Planning" title="Schedule" />

      <div className="flex-1 p-6 space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {stats.map((s) => (
            <div key={s.label} className="rounded-lg border border-border bg-surface-100 px-4 py-3.5">
              <p className="text-[11px] font-mono text-foreground-lighter uppercase tracking-wider">
                {s.label}
              </p>
              <p
                className={cn(
                  "text-[22px] font-semibold tabular-nums mt-1 leading-none",
                  s.danger ? "text-destructive" : s.accent ? "text-brand" : "text-foreground"
                )}
              >
                {s.value}
              </p>
            </div>
          ))}
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_240px] items-start">
          {/* Calendar */}
          <div>
            {loading ? (
              <div className="flex items-center justify-center h-96 rounded-lg border border-border bg-surface-100">
                <Loader2 className="h-5 w-5 animate-spin text-foreground-lighter" />
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center h-96 rounded-lg border border-border bg-surface-100 gap-3">
                <p className="text-[13px] text-destructive">{error}</p>
                <button
                  onClick={() => window.location.reload()}
                  className="px-4 py-2 rounded-md bg-surface-300 border border-strong text-[12px] text-brand hover:bg-surface-400 transition-colors"
                >
                  Try again
                </button>
              </div>
            ) : (
              <ModernCalendar
                events={events}
                filters={filters}
                onDateSelect={setCurrentDate}
                onEventClick={handleEventClick}
                highlightToday
              />
            )}
          </div>

          {/* Sidebar — the filter rows double as the legend, so there's no
              separate legend panel repeating the same six labels. */}
          <div className="space-y-5">
            <div className="rounded-lg border border-border bg-surface-100 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
                <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">
                  Show
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setFilters(ALL_ON)}
                    className="text-[11px] text-foreground-lighter hover:text-foreground-light transition-colors"
                  >
                    All
                  </button>
                  <span className="text-border">·</span>
                  <button
                    onClick={() => setFilters(ALL_OFF)}
                    className="text-[11px] text-foreground-lighter hover:text-foreground-light transition-colors"
                  >
                    None
                  </button>
                </div>
              </div>
              <div className="py-1">
                {filterOptions.map((option) => {
                  const checked = filters[option.key] ?? false;
                  return (
                    <button
                      key={option.key}
                      onClick={() => setFilters((prev) => ({ ...prev, [option.key]: !checked }))}
                      className="w-full flex items-center gap-2.5 px-4 py-2 hover:bg-surface-200 transition-colors"
                    >
                      <span
                        className={cn(
                          "flex h-3.5 w-3.5 items-center justify-center rounded-sm border flex-shrink-0",
                          checked ? "bg-brand border-brand" : "border-strong"
                        )}
                      >
                        {checked && <Check className="h-2.5 w-2.5 text-background" />}
                      </span>
                      <StatusDot tone={option.tone} />
                      <span
                        className={cn(
                          "text-[12px] transition-colors",
                          checked ? "text-foreground-light" : "text-foreground-lighter"
                        )}
                      >
                        {option.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-surface-100 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border">
                <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest">
                  Shortcuts
                </p>
              </div>
              <div className="px-4 py-3 space-y-2">
                {SHORTCUTS.map(([label, key]) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-[12px] text-foreground-lighter">{label}</span>
                    <kbd className="px-1.5 py-0.5 rounded-sm bg-surface-300 border border-border text-[10px] font-mono text-foreground-lighter">
                      {key}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
