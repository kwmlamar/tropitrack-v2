"use client";

import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { CalendarEventItem, EventTypeLabel } from "./calendar-event";
import type { CalendarEvent, CalendarEventType } from "@/types";

interface CalendarDayViewProps {
  date: Date;
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
}

export function CalendarDayView({
  date,
  events,
  onEventClick,
}: CalendarDayViewProps) {
  // Group events by type
  const groupedEvents = events.reduce<Record<CalendarEventType, CalendarEvent[]>>(
    (acc, event) => {
      if (!acc[event.type]) {
        acc[event.type] = [];
      }
      acc[event.type].push(event);
      return acc;
    },
    {} as Record<CalendarEventType, CalendarEvent[]>
  );

  const eventTypes = Object.keys(groupedEvents) as CalendarEventType[];

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      {/* Day header */}
      <div className="p-6 border-b bg-muted/30">
        <div className="text-sm font-medium text-muted-foreground uppercase">
          {format(date, "EEEE")}
        </div>
        <div className="mt-1 text-3xl font-bold">
          {format(date, "MMMM d, yyyy")}
        </div>
        <div className="mt-2 text-sm text-muted-foreground">
          {events.length} event{events.length !== 1 ? "s" : ""} scheduled
        </div>
      </div>

      {/* Events by type */}
      <div className="p-6 space-y-6">
        {eventTypes.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-muted-foreground">No events scheduled for this day</p>
          </div>
        ) : (
          eventTypes.map((type) => (
            <div key={type} className="space-y-3">
              <EventTypeLabel type={type} />
              <div className="space-y-2 pl-7">
                {groupedEvents[type].map((event) => (
                  <CalendarEventItem
                    key={event.id}
                    event={event}
                    onClick={onEventClick}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
