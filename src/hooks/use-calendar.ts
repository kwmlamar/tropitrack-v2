"use client";

import { useState, useMemo, useCallback } from "react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  addDays,
  subDays,
  format,
  isSameMonth,
  isSameDay,
  isToday,
  isWeekend,
  parseISO,
  startOfDay,
  endOfDay,
} from "date-fns";
import type {
  CalendarViewMode,
  CalendarEvent,
  CalendarDayData,
  CalendarFilters,
} from "@/types";

interface UseCalendarOptions {
  initialDate?: Date;
  initialMode?: CalendarViewMode;
  events?: CalendarEvent[];
  filters?: CalendarFilters;
}

export function useCalendar(options: UseCalendarOptions = {}) {
  const {
    initialDate = new Date(),
    initialMode = "month",
    events = [],
    filters = {
      showProjects: true,
      showMilestones: true,
      showWorkers: true,
      showDeliveries: true,
      showInvoices: true,
      showTimesheets: true,
      showEquipment: true,
    },
  } = options;

  const [currentDate, setCurrentDate] = useState(initialDate);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [viewMode, setViewMode] = useState<CalendarViewMode>(initialMode);
  const [sidePanelOpen, setSidePanelOpen] = useState(false);

  // Filter events based on filters
  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      switch (event.type) {
        case "project":
          return filters.showProjects;
        case "milestone":
          return filters.showMilestones;
        case "worker":
          return filters.showWorkers;
        case "material_delivery":
          return filters.showDeliveries;
        case "invoice_due":
          return filters.showInvoices;
        case "timesheet":
          return filters.showTimesheets;
        case "equipment":
          return filters.showEquipment;
        default:
          return true;
      }
    });
  }, [events, filters]);

  // Get events for a specific date
  const getEventsForDate = useCallback(
    (date: Date) => {
      return filteredEvents.filter((event) => {
        const eventDate = parseISO(event.date);
        return isSameDay(eventDate, date);
      });
    },
    [filteredEvents]
  );

  // Generate month view days
  const monthDays = useMemo((): CalendarDayData[] => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

    const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

    return days.map((date) => ({
      date,
      isToday: isToday(date),
      isSelected: selectedDate ? isSameDay(date, selectedDate) : false,
      isCurrentMonth: isSameMonth(date, currentDate),
      isWeekend: isWeekend(date),
      events: getEventsForDate(date),
    }));
  }, [currentDate, selectedDate, getEventsForDate]);

  // Generate week view days
  const weekDays = useMemo((): CalendarDayData[] => {
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
    const weekEnd = endOfWeek(currentDate, { weekStartsOn: 0 });

    const days = eachDayOfInterval({ start: weekStart, end: weekEnd });

    return days.map((date) => ({
      date,
      isToday: isToday(date),
      isSelected: selectedDate ? isSameDay(date, selectedDate) : false,
      isCurrentMonth: isSameMonth(date, currentDate),
      isWeekend: isWeekend(date),
      events: getEventsForDate(date),
    }));
  }, [currentDate, selectedDate, getEventsForDate]);

  // Get agenda items (upcoming events)
  const agendaItems = useMemo(() => {
    const today = startOfDay(new Date());
    const thirtyDaysLater = addDays(today, 30);

    return filteredEvents
      .filter((event) => {
        const eventDate = parseISO(event.date);
        return eventDate >= today && eventDate <= thirtyDaysLater;
      })
      .sort((a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime());
  }, [filteredEvents]);

  // Navigation functions
  const goToNext = useCallback(() => {
    switch (viewMode) {
      case "month":
        setCurrentDate((prev) => addMonths(prev, 1));
        break;
      case "week":
        setCurrentDate((prev) => addWeeks(prev, 1));
        break;
      case "day":
        setCurrentDate((prev) => addDays(prev, 1));
        break;
      case "agenda":
        setCurrentDate((prev) => addMonths(prev, 1));
        break;
    }
  }, [viewMode]);

  const goToPrevious = useCallback(() => {
    switch (viewMode) {
      case "month":
        setCurrentDate((prev) => subMonths(prev, 1));
        break;
      case "week":
        setCurrentDate((prev) => subWeeks(prev, 1));
        break;
      case "day":
        setCurrentDate((prev) => subDays(prev, 1));
        break;
      case "agenda":
        setCurrentDate((prev) => subMonths(prev, 1));
        break;
    }
  }, [viewMode]);

  const goToToday = useCallback(() => {
    setCurrentDate(new Date());
    setSelectedDate(new Date());
  }, []);

  const goToDate = useCallback((date: Date) => {
    setCurrentDate(date);
    setSelectedDate(date);
  }, []);

  const selectDate = useCallback((date: Date) => {
    setSelectedDate(date);
    setSidePanelOpen(true);
  }, []);

  const closeSidePanel = useCallback(() => {
    setSidePanelOpen(false);
  }, []);

  // Get title for current view
  const viewTitle = useMemo(() => {
    switch (viewMode) {
      case "month":
        return format(currentDate, "MMMM yyyy");
      case "week":
        const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
        const weekEnd = endOfWeek(currentDate, { weekStartsOn: 0 });
        if (isSameMonth(weekStart, weekEnd)) {
          return `${format(weekStart, "MMM d")} - ${format(weekEnd, "d, yyyy")}`;
        }
        return `${format(weekStart, "MMM d")} - ${format(weekEnd, "MMM d, yyyy")}`;
      case "day":
        return format(currentDate, "EEEE, MMMM d, yyyy");
      case "agenda":
        return "Upcoming Events";
      default:
        return "";
    }
  }, [viewMode, currentDate]);

  return {
    // State
    currentDate,
    selectedDate,
    viewMode,
    sidePanelOpen,
    viewTitle,

    // Data
    monthDays,
    weekDays,
    agendaItems,
    filteredEvents,

    // Functions
    setViewMode,
    goToNext,
    goToPrevious,
    goToToday,
    goToDate,
    selectDate,
    closeSidePanel,
    getEventsForDate,
  };
}
