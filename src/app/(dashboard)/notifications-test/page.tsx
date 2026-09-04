"use client";

import { useState } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Bell } from "lucide-react";
import type { NotificationType, NotificationPriority } from "@/types";

export default function NotificationsTestPage() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const supabase = createClient();

  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    type: "low_stock" as NotificationType,
    title: "Test Notification",
    message: "This is a test notification from the TropiTrack system.",
    priority: "normal" as NotificationPriority,
  });

  const handleSendTestNotification = async () => {
    if (!profile?.id) {
      toast({
        title: "Error",
        description: "You must be logged in to send notifications",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("create_notification", {
        p_user_id: profile.id,
        p_company_id: profile.company_id || null,
        p_type: formData.type,
        p_title: formData.title,
        p_message: formData.message,
        p_priority: formData.priority,
      });

      if (error) throw error;

      toast({
        title: "Test notification sent!",
        description: "Check the notifications bell in the header",
        variant: "success",
      });

      // Reset form
      setFormData({
        type: "low_stock",
        title: "Test Notification",
        message: "This is a test notification from the TropiTrack system.",
        priority: "normal",
      });
    } catch (error) {
      console.error("Error sending test notification:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to send notification",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSendPredefinedNotifications = async () => {
    if (!profile?.id) return;

    setLoading(true);
    try {
      const testNotifications = [
        {
          type: "low_stock",
          title: "Low Stock Alert",
          message: "Portland Cement is running low (5 bags remaining). Minimum stock level is 10 bags.",
          priority: "high",
        },
        {
          type: "milestone_reminder",
          title: "Project Milestone Due",
          message: "Beach Resort foundation work is due tomorrow. Please review progress.",
          priority: "normal",
        },
        {
          type: "payroll_reminder",
          title: "Payroll Processing Due",
          message: "Weekly payroll for 15 workers needs to be processed by Friday.",
          priority: "normal",
        },
        {
          type: "budget_alert",
          title: "Budget Threshold Reached",
          message: "Commercial Plaza project has reached 85% of allocated budget.",
          priority: "high",
        },
        {
          type: "invoice_overdue",
          title: "Invoice Overdue",
          message: "Invoice #INV-2024-001 is now 7 days overdue. Total: $15,000.00",
          priority: "urgent",
        },
      ];

      for (const notification of testNotifications) {
        await supabase.rpc("create_notification", {
          p_user_id: profile.id,
          p_company_id: profile.company_id || null,
          p_type: notification.type,
          p_title: notification.title,
          p_message: notification.message,
          p_priority: notification.priority,
        });
      }

      toast({
        title: "Sample notifications created!",
        description: `${testNotifications.length} notifications have been added`,
        variant: "success",
      });
    } catch (error) {
      console.error("Error creating sample notifications:", error);
      toast({
        title: "Error",
        description: "Failed to create sample notifications",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Header title="Notifications Test" description="Test the notifications system" />

      <div className="flex-1 p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-info" />
                Send Test Notification
              </CardTitle>
              <CardDescription>
                Create a custom test notification to see how it appears
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="type">Notification Type</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value: NotificationType) =>
                    setFormData({ ...formData, type: value })
                  }
                >
                  <SelectTrigger id="type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low_stock">Low Stock Alert</SelectItem>
                    <SelectItem value="milestone_reminder">Milestone Reminder</SelectItem>
                    <SelectItem value="payroll_reminder">Payroll Reminder</SelectItem>
                    <SelectItem value="budget_alert">Budget Alert</SelectItem>
                    <SelectItem value="invoice_overdue">Invoice Overdue</SelectItem>
                    <SelectItem value="estimate_expiring">Estimate Expiring</SelectItem>
                    <SelectItem value="team_invitation">Team Invitation</SelectItem>
                    <SelectItem value="payment_received">Payment Received</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="priority">Priority</Label>
                <Select
                  value={formData.priority}
                  onValueChange={(value: NotificationPriority) =>
                    setFormData({ ...formData, priority: value })
                  }
                >
                  <SelectTrigger id="priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  placeholder="Notification title"
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="message">Message</Label>
                <Textarea
                  id="message"
                  placeholder="Notification message"
                  value={formData.message}
                  onChange={(e) =>
                    setFormData({ ...formData, message: e.target.value })
                  }
                  rows={4}
                />
              </div>

              <Button
                onClick={handleSendTestNotification}
                disabled={loading}
                className="w-full"
              >
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Send Test Notification
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick Sample Notifications</CardTitle>
              <CardDescription>
                Generate multiple sample notifications to test the system
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={handleSendPredefinedNotifications}
                disabled={loading}
                variant="outline"
                className="w-full"
              >
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create 5 Sample Notifications
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
