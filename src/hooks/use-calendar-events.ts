"use client";

import { useState, useEffect, useCallback } from "react";
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import type { CalendarEvent, CalendarFilters } from "@/types";

interface UseCalendarEventsOptions {
  currentDate: Date;
  filters?: CalendarFilters;
}

export function useCalendarEvents({
  currentDate,
  filters = {
    showProjects: true,
    showMilestones: true,
    showWorkers: false,
    showDeliveries: true,
    showInvoices: true,
    showTimesheets: false,
    showEquipment: false,
  },
}: UseCalendarEventsOptions) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Get date range (current month + 1 month before and after)
      const rangeStart = format(subMonths(startOfMonth(currentDate), 1), "yyyy-MM-dd");
      const rangeEnd = format(addMonths(endOfMonth(currentDate), 1), "yyyy-MM-dd");

      const allEvents: CalendarEvent[] = [];

      // Fetch projects (start dates and end dates)
      if (filters.showProjects) {
        const { data: projects } = await supabase
          .from("projects")
          .select("id, name, client_name, start_date, estimated_end_date, status")
          .or(`start_date.gte.${rangeStart},estimated_end_date.lte.${rangeEnd}`)
          .in("status", ["planning", "active"]);

        projects?.forEach((project) => {
          if (project.start_date) {
            allEvents.push({
              id: `project-start-${project.id}`,
              type: "project",
              title: project.name,
              subtitle: `Start - ${project.client_name}`,
              date: project.start_date,
              url: `/projects/${project.id}`,
              metadata: { projectId: project.id, eventKind: "start" },
            });
          }
          if (project.estimated_end_date) {
            allEvents.push({
              id: `project-end-${project.id}`,
              type: "project",
              title: project.name,
              subtitle: `End - ${project.client_name}`,
              date: project.estimated_end_date,
              url: `/projects/${project.id}`,
              metadata: { projectId: project.id, eventKind: "end" },
            });
          }
        });
      }

      // Fetch milestones
      if (filters.showMilestones) {
        const { data: milestones } = await supabase
          .from("project_milestones")
          .select("id, name, due_date, is_completed, project_id, projects(name)")
          .gte("due_date", rangeStart)
          .lte("due_date", rangeEnd)
          .eq("is_completed", false);

        milestones?.forEach((milestone: any) => {
          allEvents.push({
            id: `milestone-${milestone.id}`,
            type: "milestone",
            title: milestone.name,
            subtitle: milestone.projects?.name,
            date: milestone.due_date,
            url: `/projects/${milestone.project_id}`,
            metadata: { milestoneId: milestone.id, projectId: milestone.project_id },
          });
        });
      }

      // Fetch invoice due dates
      if (filters.showInvoices) {
        const { data: invoices } = await supabase
          .from("invoices")
          .select("id, invoice_number, client_name, due_date, balance_due, status")
          .gte("due_date", rangeStart)
          .lte("due_date", rangeEnd)
          .in("status", ["sent", "viewed", "partial", "overdue"]);

        invoices?.forEach((invoice) => {
          allEvents.push({
            id: `invoice-${invoice.id}`,
            type: "invoice_due",
            title: `Invoice ${invoice.invoice_number}`,
            subtitle: `${invoice.client_name} - $${invoice.balance_due.toLocaleString()}`,
            date: invoice.due_date,
            url: `/invoices/${invoice.id}`,
            metadata: { invoiceId: invoice.id, amount: invoice.balance_due },
          });
        });
      }

      // Fetch material deliveries (expected delivery dates from POs)
      if (filters.showDeliveries) {
        const { data: purchaseOrders } = await supabase
          .from("purchase_orders")
          .select("id, po_number, expected_delivery_date, vendor_id, vendors(name)")
          .gte("expected_delivery_date", rangeStart)
          .lte("expected_delivery_date", rangeEnd)
          .in("status", ["ordered", "partial_received"]);

        purchaseOrders?.forEach((po: any) => {
          if (po.expected_delivery_date) {
            allEvents.push({
              id: `delivery-${po.id}`,
              type: "material_delivery",
              title: `PO ${po.po_number}`,
              subtitle: po.vendors?.name || "Delivery expected",
              date: po.expected_delivery_date,
              url: `/vendors`,
              metadata: { purchaseOrderId: po.id },
            });
          }
        });
      }

      // Fetch time entries (if showing timesheets)
      if (filters.showTimesheets) {
        const { data: timeEntries } = await supabase
          .from("time_entries")
          .select("id, date, worker_id, project_id, regular_hours, workers(first_name, last_name), projects(name)")
          .gte("date", rangeStart)
          .lte("date", rangeEnd);

        // Group by date and count
        const entriesByDate: Record<string, { count: number; hours: number }> = {};
        timeEntries?.forEach((entry: any) => {
          const dateKey = entry.date;
          if (!entriesByDate[dateKey]) {
            entriesByDate[dateKey] = { count: 0, hours: 0 };
          }
          entriesByDate[dateKey].count += 1;
          entriesByDate[dateKey].hours += entry.regular_hours || 0;
        });

        Object.entries(entriesByDate).forEach(([date, data]) => {
          allEvents.push({
            id: `timesheet-${date}`,
            type: "timesheet",
            title: `${data.count} Time Entries`,
            subtitle: `${data.hours} hours logged`,
            date,
            url: `/time-tracking`,
            metadata: { count: data.count, hours: data.hours },
          });
        });
      }

      // Fetch equipment usage
      if (filters.showEquipment) {
        const { data: equipmentUsage } = await supabase
          .from("equipment_usage")
          .select("id, start_date, end_date, equipment_id, project_id, equipment(name), projects(name)")
          .or(`start_date.gte.${rangeStart},end_date.lte.${rangeEnd}`);

        equipmentUsage?.forEach((usage: any) => {
          allEvents.push({
            id: `equipment-${usage.id}`,
            type: "equipment",
            title: usage.equipment?.name || "Equipment",
            subtitle: usage.projects?.name,
            date: usage.start_date,
            endDate: usage.end_date,
            url: `/projects/${usage.project_id}`,
            metadata: { equipmentId: usage.equipment_id },
          });
        });
      }

      setEvents(allEvents);
    } catch (err) {
      console.error("Error fetching calendar events:", err);
      setError("Failed to load calendar events");
    } finally {
      setLoading(false);
    }
  }, [currentDate, filters, supabase]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  return {
    events,
    loading,
    error,
    refresh: fetchEvents,
  };
}
