"use client";

import { CalendarDay, CalendarDayHeader } from "./calendar-day";
import type { CalendarDayData, CalendarEvent } from "@/types";

interface CalendarGridProps {
  days: CalendarDayData[];
  onDateSelect: (date: Date) => void;
  onEventClick?: (event: CalendarEvent) => void;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function CalendarMonthGrid({
  days,
  onDateSelect,
  onEventClick,
}: CalendarGridProps) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-b">
        {WEEKDAYS.map((day) => (
          <CalendarDayHeader key={day} day={day} />
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7">
        {days.map((day, index) => (
          <CalendarDay
            key={index}
            day={day}
            onSelect={onDateSelect}
            onEventClick={onEventClick}
          />
        ))}
      </div>
    </div>
  );
}

// Compact mobile-friendly grid
export function CalendarMonthGridCompact({
  days,
  onDateSelect,
  onEventClick,
}: CalendarGridProps) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-b">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="py-2 text-center text-xs font-medium text-muted-foreground"
          >
            {day.charAt(0)}
          </div>
        ))}
      </div>

      {/* Days grid - compact */}
      <div className="grid grid-cols-7">
        {days.map((day, index) => (
          <CalendarDay
            key={index}
            day={day}
            onSelect={onDateSelect}
            onEventClick={onEventClick}
            compact
            showEvents={false}
          />
        ))}
      </div>
    </div>
  );
}
