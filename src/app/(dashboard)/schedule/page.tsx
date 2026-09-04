"use client";

import { useState, useMemo } from "react";
import { Header } from "@/components/layout/header";
import { ModernCalendar } from "@/components/calendar";
import { useCalendarEvents } from "@/hooks/use-calendar-events";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  FolderKanban,
  Flag,
  Truck,
  Receipt,
  Clock,
  Wrench,
  Filter,
  Loader2,
} from "lucide-react";
import type { CalendarFilters, CalendarEvent } from "@/types";

// Kept in sync with eventTypeConfig in components/calendar/calendar-event.tsx —
// more categories than status tokens, so several share a token by closest
// semantic match rather than by the original hue.
const filterOptions = [
  { key: "showProjects" as keyof CalendarFilters, label: "Projects", icon: FolderKanban, color: "text-info" },
  { key: "showMilestones" as keyof CalendarFilters, label: "Milestones", icon: Flag, color: "text-info" },
  { key: "showInvoices" as keyof CalendarFilters, label: "Invoices Due", icon: Receipt, color: "text-destructive" },
  { key: "showDeliveries" as keyof CalendarFilters, label: "Deliveries", icon: Truck, color: "text-warning" },
  { key: "showTimesheets" as keyof CalendarFilters, label: "Timesheets", icon: Clock, color: "text-info" },
  { key: "showEquipment" as keyof CalendarFilters, label: "Equipment", icon: Wrench, color: "text-warning" },
];

export default function SchedulePage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [filters, setFilters] = useState<CalendarFilters>({
    showProjects: true,
    showMilestones: true,
    showDeliveries: true,
    showInvoices: true,
    showTimesheets: false,
    showEquipment: false,
  });

  const { events, loading, error } = useCalendarEvents({
    currentDate,
    filters,
  });

  const handleFilterChange = (key: keyof CalendarFilters, checked: boolean) => {
    setFilters((prev) => ({ ...prev, [key]: checked }));
  };

  const handleDateSelect = (date: Date) => {
    setCurrentDate(date);
  };

  const handleEventClick = (event: CalendarEvent) => {
    if (event.url) {
      window.location.href = event.url;
    }
  };

  // Calculate summary stats
  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const upcoming = events.filter((e) => new Date(e.date) >= today);
    const overdueInvoices = events.filter(
      (e) => e.type === "invoice_due" && new Date(e.date) < today
    );
    const thisWeekMilestones = events.filter((e) => {
      const eventDate = new Date(e.date);
      const weekFromNow = new Date(today);
      weekFromNow.setDate(weekFromNow.getDate() + 7);
      return e.type === "milestone" && eventDate >= today && eventDate <= weekFromNow;
    });

    return {
      total: events.length,
      upcoming: upcoming.length,
      overdueInvoices: overdueInvoices.length,
      thisWeekMilestones: thisWeekMilestones.length,
    };
  }, [events]);

  return (
    <div className="flex flex-col min-h-screen">
      <Header
        title="Schedule"
        description="View projects, milestones, and important dates"
      />

      <div className="flex-1 p-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
          {/* Main Calendar */}
          <div className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center h-96 rounded-xl border bg-card">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Loading calendar...</span>
                </div>
              </div>
            ) : error ? (
              <div className="flex items-center justify-center h-96 rounded-xl border bg-card">
                <div className="text-center">
                  <p className="text-destructive">{error}</p>
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => window.location.reload()}
                  >
                    Try Again
                  </Button>
                </div>
              </div>
            ) : (
              <ModernCalendar
                events={events}
                filters={filters}
                onDateSelect={handleDateSelect}
                onEventClick={handleEventClick}
                highlightToday
              />
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quick Stats */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Overview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Total Events</span>
                  <span className="font-semibold">{stats.total}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Upcoming</span>
                  <span className="font-semibold">{stats.upcoming}</span>
                </div>
                {stats.overdueInvoices > 0 && (
                  <div className="flex items-center justify-between text-destructive">
                    <span className="text-sm">Overdue Invoices</span>
                    <span className="font-semibold">{stats.overdueInvoices}</span>
                  </div>
                )}
                {stats.thisWeekMilestones > 0 && (
                  <div className="flex items-center justify-between text-info">
                    <span className="text-sm">Milestones This Week</span>
                    <span className="font-semibold">{stats.thisWeekMilestones}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Filters */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  Filters
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {filterOptions.map((option) => {
                  const Icon = option.icon;
                  const isChecked = filters[option.key] ?? false;

                  return (
                    <div key={option.key} className="flex items-center space-x-3">
                      <Checkbox
                        id={option.key}
                        checked={isChecked}
                        onCheckedChange={(checked) =>
                          handleFilterChange(option.key, checked as boolean)
                        }
                      />
                      <Label
                        htmlFor={option.key}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <Icon className={`h-4 w-4 ${option.color}`} />
                        <span className="text-sm">{option.label}</span>
                      </Label>
                    </div>
                  );
                })}

                <Separator />

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() =>
                      setFilters({
                        showProjects: true,
                        showMilestones: true,
                        showDeliveries: true,
                        showInvoices: true,
                        showTimesheets: true,
                        showEquipment: true,
                      })
                    }
                  >
                    All
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() =>
                      setFilters({
                        showProjects: false,
                        showMilestones: false,
                        showDeliveries: false,
                        showInvoices: false,
                        showTimesheets: false,
                        showEquipment: false,
                      })
                    }
                  >
                    None
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Legend */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Legend</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {filterOptions.map((option) => {
                  const Icon = option.icon;
                  return (
                    <div key={option.key} className="flex items-center gap-2">
                      <div className={`p-1 rounded ${option.color.replace("text-", "bg-").replace("-600", "-100")}`}>
                        <Icon className={`h-3 w-3 ${option.color}`} />
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {option.label}
                      </span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Keyboard shortcuts */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Shortcuts</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Today</span>
                  <kbd className="px-2 py-0.5 bg-muted rounded-md text-xs">T</kbd>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Month view</span>
                  <kbd className="px-2 py-0.5 bg-muted rounded-md text-xs">M</kbd>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Week view</span>
                  <kbd className="px-2 py-0.5 bg-muted rounded-md text-xs">W</kbd>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Day view</span>
                  <kbd className="px-2 py-0.5 bg-muted rounded-md text-xs">D</kbd>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Agenda view</span>
                  <kbd className="px-2 py-0.5 bg-muted rounded-md text-xs">A</kbd>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Navigate</span>
                  <span className="flex gap-1">
                    <kbd className="px-2 py-0.5 bg-muted rounded-md text-xs">←</kbd>
                    <kbd className="px-2 py-0.5 bg-muted rounded-md text-xs">→</kbd>
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
