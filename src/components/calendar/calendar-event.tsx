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

// Event types outnumber the status token set (success/destructive/warning/
// info), so several types share a token, grouped by closest semantic match
// (schedule items -> info, logistics/caution -> warning, staffing -> success,
// money-due -> destructive) rather than by the original hue.
const eventTypeConfig: Record<
  CalendarEventType,
  { icon: typeof FolderKanban; color: string; bgColor: string; borderColor: string; dotColor: string }
> = {
  project: {
    icon: FolderKanban,
    color: "text-info",
    bgColor: "bg-info-subtle",
    borderColor: "border-info-border",
    dotColor: "bg-info-solid",
  },
  milestone: {
    icon: Flag,
    color: "text-brand",
    bgColor: "bg-brand-subtle",
    borderColor: "border-brand-border",
    dotColor: "bg-primary",
  },
  worker: {
    icon: Users,
    color: "text-success",
    bgColor: "bg-success-subtle",
    borderColor: "border-success-border",
    dotColor: "bg-success-solid",
  },
  material_delivery: {
    icon: Truck,
    color: "text-warning",
    bgColor: "bg-warning-subtle",
    borderColor: "border-warning-border",
    dotColor: "bg-warning-solid",
  },
  invoice_due: {
    icon: Receipt,
    color: "text-destructive",
    bgColor: "bg-destructive-subtle",
    borderColor: "border-destructive-border",
    dotColor: "bg-destructive-solid",
  },
  timesheet: {
    icon: Clock,
    color: "text-info",
    bgColor: "bg-info-subtle",
    borderColor: "border-info-border",
    dotColor: "bg-info-solid",
  },
  equipment: {
    icon: Wrench,
    color: "text-warning",
    bgColor: "bg-warning-subtle",
    borderColor: "border-warning-border",
    dotColor: "bg-warning-solid",
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
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md border text-left text-xs transition-all ${config.bgColor} ${config.borderColor} hover:opacity-80`}
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
      className={`inline-block w-1.5 h-1.5 rounded-full ${config.dotColor}`}
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
      <div className={`p-1 rounded-md ${config.bgColor}`}>
        <Icon className={`h-3 w-3 ${config.color}`} />
      </div>
      <span className="text-sm font-medium">{labels[type]}</span>
    </div>
  );
}
