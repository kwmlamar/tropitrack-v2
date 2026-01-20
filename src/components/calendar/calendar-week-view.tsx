"use client";

import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { CalendarEventItem } from "./calendar-event";
import type { CalendarDayData, CalendarEvent } from "@/types";

interface CalendarWeekViewProps {
  days: CalendarDayData[];
  onDateSelect: (date: Date) => void;
  onEventClick?: (event: CalendarEvent) => void;
}

export function CalendarWeekView({
  days,
  onDateSelect,
  onEventClick,
}: CalendarWeekViewProps) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
      {/* Header row with dates */}
      <div className="grid grid-cols-7 border-b bg-muted/30">
        {days.map((day, index) => (
          <button
            key={index}
            onClick={() => onDateSelect(day.date)}
            className={cn(
              "py-4 text-center transition-colors hover:bg-accent/50",
              index !== 6 && "border-r",
              day.isSelected && "bg-primary/10"
            )}
          >
            <div className="text-xs font-medium text-muted-foreground uppercase">
              {format(day.date, "EEE")}
            </div>
            <div
              className={cn(
                "mt-1 inline-flex items-center justify-center w-8 h-8 rounded-full text-lg font-semibold",
                day.isToday && "bg-primary text-primary-foreground",
                day.isSelected && !day.isToday && "bg-primary/20 text-primary"
              )}
            >
              {format(day.date, "d")}
            </div>
          </button>
        ))}
      </div>

      {/* Events area */}
      <div className="grid grid-cols-7 min-h-[400px]">
        {days.map((day, index) => (
          <div
            key={index}
            className={cn(
              "p-2 border-r last:border-r-0 space-y-1",
              day.isWeekend && "bg-muted/20"
            )}
          >
            {day.events.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <span className="text-xs text-muted-foreground">No events</span>
              </div>
            ) : (
              day.events.map((event) => (
                <CalendarEventItem
                  key={event.id}
                  event={event}
                  onClick={onEventClick}
                />
              ))
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
