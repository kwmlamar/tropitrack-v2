"use client";

import { format, parseISO, isToday, isTomorrow, isThisWeek } from "date-fns";
import { cn } from "@/lib/utils";
import { CalendarEventItem } from "./calendar-event";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { CalendarEvent } from "@/types";

interface CalendarAgendaViewProps {
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
  onDateSelect?: (date: Date) => void;
}

export function CalendarAgendaView({
  events,
  onEventClick,
  onDateSelect,
}: CalendarAgendaViewProps) {
  // Group events by date
  const groupedEvents = events.reduce<Record<string, CalendarEvent[]>>(
    (acc, event) => {
      const dateKey = event.date.split("T")[0];
      if (!acc[dateKey]) {
        acc[dateKey] = [];
      }
      acc[dateKey].push(event);
      return acc;
    },
    {}
  );

  const sortedDates = Object.keys(groupedEvents).sort();

  const getDateLabel = (dateStr: string) => {
    const date = parseISO(dateStr);
    if (isToday(date)) return "Today";
    if (isTomorrow(date)) return "Tomorrow";
    if (isThisWeek(date)) return format(date, "EEEE");
    return format(date, "EEEE, MMMM d");
  };

  if (events.length === 0) {
    return (
      <div className="rounded-xl border bg-card shadow-sm p-12 text-center">
        <p className="text-muted-foreground">No upcoming events in the next 30 days</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      <ScrollArea className="h-[600px]">
        <div className="divide-y">
          {sortedDates.map((dateStr) => {
            const date = parseISO(dateStr);
            const dateEvents = groupedEvents[dateStr];

            return (
              <div key={dateStr} className="flex">
                {/* Date column */}
                <button
                  onClick={() => onDateSelect?.(date)}
                  className={cn(
                    "w-32 flex-shrink-0 p-4 text-left transition-colors hover:bg-accent/50 border-r",
                    isToday(date) && "bg-primary/5"
                  )}
                >
                  <div
                    className={cn(
                      "text-sm font-medium",
                      isToday(date) && "text-primary"
                    )}
                  >
                    {getDateLabel(dateStr)}
                  </div>
                  <div
                    className={cn(
                      "mt-1 text-2xl font-bold",
                      isToday(date) && "text-primary"
                    )}
                  >
                    {format(date, "d")}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {format(date, "MMM yyyy")}
                  </div>
                </button>

                {/* Events column */}
                <div className="flex-1 p-4 space-y-2">
                  {dateEvents.map((event) => (
                    <CalendarEventItem
                      key={event.id}
                      event={event}
                      onClick={onEventClick}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
