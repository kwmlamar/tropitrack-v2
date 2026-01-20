"use client";

import type { CalendarEvent, CalendarEventType } from "@/types";
import {
  FolderKanban,
  Flag,
  Users,
  Truck,
  Receipt,
  Clock,
  Wrench,
} from "lucide-react";

interface CalendarEventProps {
  event: CalendarEvent;
  compact?: boolean;
  onClick?: (event: CalendarEvent) => void;
}

const eventTypeConfig: Record<
  CalendarEventType,
  { icon: typeof FolderKanban; color: string; bgColor: string }
> = {
  project: {
    icon: FolderKanban,
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
  },
  milestone: {
    icon: Flag,
    color: "text-purple-600 dark:text-purple-400",
    bgColor: "bg-purple-100 dark:bg-purple-900/30",
  },
  worker: {
    icon: Users,
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-100 dark:bg-green-900/30",
  },
  material_delivery: {
    icon: Truck,
    color: "text-orange-600 dark:text-orange-400",
    bgColor: "bg-orange-100 dark:bg-orange-900/30",
  },
  invoice_due: {
    icon: Receipt,
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-100 dark:bg-red-900/30",
  },
  timesheet: {
    icon: Clock,
    color: "text-cyan-600 dark:text-cyan-400",
    bgColor: "bg-cyan-100 dark:bg-cyan-900/30",
  },
  equipment: {
    icon: Wrench,
    color: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-100 dark:bg-amber-900/30",
  },
};

export function CalendarEventItem({ event, compact, onClick }: CalendarEventProps) {
  const config = eventTypeConfig[event.type];
  const Icon = config.icon;

  if (compact) {
    // Dot indicator for month view
    return (
      <button
        onClick={() => onClick?.(event)}
        className={`w-2 h-2 rounded-full ${config.bgColor} ${config.color} transition-transform hover:scale-125`}
        title={event.title}
      />
    );
  }

  return (
    <button
      onClick={() => onClick?.(event)}
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-xs transition-all ${config.bgColor} hover:opacity-80`}
    >
      <Icon className={`h-3 w-3 flex-shrink-0 ${config.color}`} />
      <span className={`truncate font-medium ${config.color}`}>
        {event.title}
      </span>
    </button>
  );
}

export function EventDot({ type }: { type: CalendarEventType }) {
  const config = eventTypeConfig[type];
  return (
    <span
      className={`inline-block w-1.5 h-1.5 rounded-full ${config.bgColor.replace("bg-", "bg-").replace("/30", "")}`}
    />
  );
}

export function EventTypeLabel({ type }: { type: CalendarEventType }) {
  const config = eventTypeConfig[type];
  const Icon = config.icon;

  const labels: Record<CalendarEventType, string> = {
    project: "Projects",
    milestone: "Milestones",
    worker: "Workers",
    material_delivery: "Deliveries",
    invoice_due: "Invoices Due",
    timesheet: "Timesheets",
    equipment: "Equipment",
  };

  return (
    <div className="flex items-center gap-2">
      <div className={`p-1 rounded ${config.bgColor}`}>
        <Icon className={`h-3 w-3 ${config.color}`} />
      </div>
      <span className="text-sm font-medium">{labels[type]}</span>
    </div>
  );
}
