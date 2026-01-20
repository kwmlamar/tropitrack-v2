"use client";

import { useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useCalendar } from "@/hooks/use-calendar";
import { CalendarHeader } from "./calendar-header";
import { CalendarMonthGrid } from "./calendar-grid";
import { CalendarWeekView } from "./calendar-week-view";
import { CalendarDayView } from "./calendar-day-view";
import { CalendarAgendaView } from "./calendar-agenda-view";
import { CalendarSidePanel } from "./calendar-side-panel";
import type { CalendarProps, CalendarEvent, CalendarViewMode } from "@/types";

export function ModernCalendar({
  mode = "month",
  selectedDate: initialSelectedDate,
  onDateSelect,
  onEventClick,
  events = [],
  filters,
  highlightToday = true,
  className,
}: CalendarProps) {
  const {
    currentDate,
    selectedDate,
    viewMode,
    sidePanelOpen,
    viewTitle,
    monthDays,
    weekDays,
    agendaItems,
    setViewMode,
    goToNext,
    goToPrevious,
    goToToday,
    goToDate,
    selectDate,
    closeSidePanel,
    getEventsForDate,
  } = useCalendar({
    initialDate: initialSelectedDate,
    initialMode: mode,
    events,
    filters,
  });

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      switch (e.key) {
        case "ArrowLeft":
          goToPrevious();
          break;
        case "ArrowRight":
          goToNext();
          break;
        case "t":
        case "T":
          goToToday();
          break;
        case "Escape":
          closeSidePanel();
          break;
        case "m":
          setViewMode("month");
          break;
        case "w":
          setViewMode("week");
          break;
        case "d":
          setViewMode("day");
          break;
        case "a":
          setViewMode("agenda");
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goToPrevious, goToNext, goToToday, closeSidePanel, setViewMode]);

  const handleDateSelect = useCallback(
    (date: Date) => {
      selectDate(date);
      onDateSelect?.(date);
    },
    [selectDate, onDateSelect]
  );

  const handleEventClick = useCallback(
    (event: CalendarEvent) => {
      onEventClick?.(event);
    },
    [onEventClick]
  );

  const handleViewModeChange = useCallback(
    (newMode: CalendarViewMode) => {
      setViewMode(newMode);
    },
    [setViewMode]
  );

  // Get events for selected date (for side panel)
  const selectedDateEvents = selectedDate ? getEventsForDate(selectedDate) : [];

  return (
    <div className={cn("relative", className)}>
      {/* Header with navigation and view toggles */}
      <CalendarHeader
        title={viewTitle}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        onPrevious={goToPrevious}
        onNext={goToNext}
        onToday={goToToday}
      />

      {/* Calendar content based on view mode */}
      <div className="mt-4">
        {viewMode === "month" && (
          <CalendarMonthGrid
            days={monthDays}
            onDateSelect={handleDateSelect}
            onEventClick={handleEventClick}
          />
        )}

        {viewMode === "week" && (
          <CalendarWeekView
            days={weekDays}
            onDateSelect={handleDateSelect}
            onEventClick={handleEventClick}
          />
        )}

        {viewMode === "day" && (
          <CalendarDayView
            date={currentDate}
            events={getEventsForDate(currentDate)}
            onEventClick={handleEventClick}
          />
        )}

        {viewMode === "agenda" && (
          <CalendarAgendaView
            events={agendaItems}
            onEventClick={handleEventClick}
            onDateSelect={handleDateSelect}
          />
        )}
      </div>

      {/* Side panel for date details */}
      <CalendarSidePanel
        date={selectedDate}
        events={selectedDateEvents}
        isOpen={sidePanelOpen}
        onClose={closeSidePanel}
        onEventClick={handleEventClick}
      />

      {/* Overlay when side panel is open (mobile) */}
      {sidePanelOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 sm:hidden"
          onClick={closeSidePanel}
        />
      )}
    </div>
  );
}
