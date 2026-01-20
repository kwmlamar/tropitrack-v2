"use client";

import { format } from "date-fns";
import { X, Plus, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { EventTypeLabel, CalendarEventItem } from "./calendar-event";
import Link from "next/link";
import type { CalendarEvent, CalendarEventType } from "@/types";

interface CalendarSidePanelProps {
  date: Date | null;
  events: CalendarEvent[];
  isOpen: boolean;
  onClose: () => void;
  onEventClick?: (event: CalendarEvent) => void;
}

const quickActions = [
  { label: "Log Time", href: "/time-tracking", icon: "clock" },
  { label: "Add Material", href: "/materials", icon: "package" },
  { label: "Create Invoice", href: "/invoices/new", icon: "receipt" },
];

export function CalendarSidePanel({
  date,
  events,
  isOpen,
  onClose,
  onEventClick,
}: CalendarSidePanelProps) {
  if (!date || !isOpen) return null;

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
    <div
      className={`
        fixed inset-y-0 right-0 z-50 w-full sm:w-[400px] bg-background border-l shadow-2xl
        transform transition-all duration-300 ease-out
        ${isOpen ? "translate-x-0 opacity-100" : "translate-x-full opacity-0"}
      `}
    >
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b">
        <div className="flex items-center justify-between p-4">
          <div>
            <h2 className="text-lg font-semibold">
              {format(date, "EEEE")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {format(date, "MMMM d, yyyy")}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
            <span className="sr-only">Close</span>
          </Button>
        </div>
      </div>

      <ScrollArea className="h-[calc(100vh-140px)]">
        <div className="p-4 space-y-6">
          {/* Summary */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
            <span className="text-sm font-medium">Total Events</span>
            <span className="text-2xl font-bold">{events.length}</span>
          </div>

          {/* Events by type */}
          {eventTypes.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-muted-foreground">
                No events scheduled for this day
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Click a quick action to add something
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {eventTypes.map((type) => (
                <div key={type} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <EventTypeLabel type={type} />
                    <span className="text-sm text-muted-foreground">
                      ({groupedEvents[type].length})
                    </span>
                  </div>
                  <div className="space-y-2">
                    {groupedEvents[type].map((event) => (
                      <div key={event.id} className="group relative">
                        <CalendarEventItem event={event} onClick={onEventClick} />
                        {event.url && (
                          <Link
                            href={event.url}
                            className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                          </Link>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <Separator />

          {/* Quick Actions */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">
              Quick Actions
            </h3>
            <div className="grid grid-cols-1 gap-2">
              <Link href="/time-tracking">
                <Button variant="outline" className="w-full justify-start">
                  <Plus className="h-4 w-4 mr-2" />
                  Log Time Entry
                </Button>
              </Link>
              <Link href="/invoices/new">
                <Button variant="outline" className="w-full justify-start">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Invoice
                </Button>
              </Link>
              <Link href="/estimates/new">
                <Button variant="outline" className="w-full justify-start">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Estimate
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="sticky bottom-0 p-4 border-t bg-background">
        <Button variant="outline" className="w-full" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}
