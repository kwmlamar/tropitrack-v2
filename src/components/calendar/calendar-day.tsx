"use client";

import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { CalendarEventItem } from "./calendar-event";
import type { CalendarDayData, CalendarEvent } from "@/types";

interface CalendarDayProps {
  day: CalendarDayData;
  onSelect: (date: Date) => void;
  onEventClick?: (event: CalendarEvent) => void;
  showEvents?: boolean;
  compact?: boolean;
}

export function CalendarDay({
  day,
  onSelect,
  onEventClick,
  showEvents = true,
  compact = false,
}: CalendarDayProps) {
  const { date, isToday, isSelected, isCurrentMonth, isWeekend, events } = day;
  const maxVisibleEvents = compact ? 0 : 2;
  const visibleEvents = events.slice(0, maxVisibleEvents);
  const remainingCount = events.length - maxVisibleEvents;

  return (
    <button
      onClick={() => onSelect(date)}
      className={cn(
        "relative flex flex-col p-2 border-r border-b transition-all duration-200",
        "hover:bg-accent/50 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-inset",
        compact ? "min-h-[60px]" : "min-h-[110px]",
        !isCurrentMonth && "bg-muted/30 text-muted-foreground",
        isWeekend && isCurrentMonth && "bg-muted/10",
        isSelected && "bg-primary/10 ring-2 ring-primary ring-inset",
        "group"
      )}
    >
      {/* Date number */}
      <div className="flex items-start justify-between">
        <span
          className={cn(
            "inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-medium transition-colors",
            isToday && "bg-primary text-primary-foreground",
            isSelected && !isToday && "bg-primary/20 text-primary",
            !isCurrentMonth && "text-muted-foreground"
          )}
        >
          {format(date, "d")}
        </span>

        {/* Event count badge */}
        {events.length > 0 && compact && (
          <span className="flex items-center gap-0.5">
            {events.slice(0, 3).map((event, i) => (
              <span
                key={i}
                className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  event.type === "project" && "bg-blue-500",
                  event.type === "milestone" && "bg-purple-500",
                  event.type === "worker" && "bg-green-500",
                  event.type === "material_delivery" && "bg-orange-500",
                  event.type === "invoice_due" && "bg-red-500",
                  event.type === "timesheet" && "bg-cyan-500",
                  event.type === "equipment" && "bg-amber-500"
                )}
              />
            ))}
            {events.length > 3 && (
              <span className="text-xs text-muted-foreground ml-0.5">
                +{events.length - 3}
              </span>
            )}
          </span>
        )}
      </div>

      {/* Events list */}
      {showEvents && !compact && events.length > 0 && (
        <div className="mt-1.5 space-y-1 flex-1 overflow-hidden">
          {visibleEvents.map((event) => (
            <CalendarEventItem
              key={event.id}
              event={event}
              onClick={onEventClick}
            />
          ))}
          {remainingCount > 0 && (
            <span className="text-xs text-muted-foreground pl-2">
              +{remainingCount} more
            </span>
          )}
        </div>
      )}
    </button>
  );
}

// Compact day cell for week headers
export function CalendarDayHeader({ day }: { day: string }) {
  return (
    <div className="py-3 text-center text-sm font-medium text-muted-foreground border-r border-b bg-muted/30">
      {day}
    </div>
  );
}
