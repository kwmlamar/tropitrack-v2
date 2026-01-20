"use client";

import { useState, useMemo } from "react";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, isToday, addMonths, subMonths } from "date-fns";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import type { CalendarEvent } from "@/types";

interface CalendarWidgetProps {
  events?: CalendarEvent[];
  onDateSelect?: (date: Date) => void;
  className?: string;
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

export function CalendarWidget({
  events = [],
  onDateSelect,
  className,
}: CalendarWidgetProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // Generate calendar days
  const days = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [currentDate]);

  // Get event dates for quick lookup
  const eventDates = useMemo(() => {
    const dates = new Set<string>();
    events.forEach((event) => {
      dates.add(event.date.split("T")[0]);
    });
    return dates;
  }, [events]);

  const handlePrevMonth = () => setCurrentDate((prev) => subMonths(prev, 1));
  const handleNextMonth = () => setCurrentDate((prev) => addMonths(prev, 1));

  const handleDateClick = (date: Date) => {
    setSelectedDate(date);
    onDateSelect?.(date);
  };

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            Calendar
          </CardTitle>
          <Link href="/schedule">
            <Button variant="ghost" size="sm" className="text-xs">
              Full View
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="pb-4">
        {/* Month navigation */}
        <div className="flex items-center justify-between mb-3">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handlePrevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium">
            {format(currentDate, "MMMM yyyy")}
          </span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleNextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 mb-1">
          {WEEKDAYS.map((day, i) => (
            <div
              key={i}
              className="text-center text-xs font-medium text-muted-foreground py-1"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7 gap-px">
          {days.map((date, i) => {
            const dateStr = format(date, "yyyy-MM-dd");
            const hasEvents = eventDates.has(dateStr);
            const isCurrentMonth = isSameMonth(date, currentDate);
            const isSelectedDay = selectedDate && isSameDay(date, selectedDate);
            const isTodayDate = isToday(date);

            return (
              <button
                key={i}
                onClick={() => handleDateClick(date)}
                className={cn(
                  "relative h-8 w-full text-xs font-medium rounded-md transition-colors",
                  "hover:bg-accent focus:outline-none focus:ring-1 focus:ring-primary",
                  !isCurrentMonth && "text-muted-foreground/50",
                  isSelectedDay && "bg-primary text-primary-foreground hover:bg-primary",
                  isTodayDate && !isSelectedDay && "bg-accent font-bold"
                )}
              >
                {format(date, "d")}
                {hasEvents && !isSelectedDay && (
                  <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
                )}
              </button>
            );
          })}
        </div>

        {/* Today button */}
        <div className="mt-3 flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={() => {
              setCurrentDate(new Date());
              setSelectedDate(new Date());
            }}
          >
            Today
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
