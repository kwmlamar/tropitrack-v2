"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Check,
  CheckCheck,
  Package,
  Calendar,
  DollarSign,
  AlertTriangle,
  FileText,
  Users,
  Loader2,
  Settings,
  Bell,
} from "lucide-react";
import type { Notification } from "@/types";
import { formatDistanceToNow } from "date-fns";

interface NotificationsPanelProps {
  onClose: () => void;
  onUpdate: () => void;
}

const notificationIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  low_stock: Package,
  milestone_reminder: Calendar,
  payroll_reminder: DollarSign,
  budget_alert: AlertTriangle,
  invoice_overdue: FileText,
  estimate_expiring: FileText,
  team_invitation: Users,
  payment_received: DollarSign,
};

const notificationColors: Record<string, string> = {
  low_stock: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50",
  milestone_reminder: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50",
  payroll_reminder: "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/50",
  budget_alert: "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/50",
  invoice_overdue: "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/50",
  estimate_expiring: "text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/50",
  team_invitation: "text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50",
  payment_received: "text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/50",
};

export function NotificationsPanel({ onClose, onUpdate }: NotificationsPanelProps) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const supabase = createClient();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAllRead, setMarkingAllRead] = useState(false);

  const fetchNotifications = async () => {
    if (!profile?.id) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      setNotifications(data || []);
    } catch (error) {
      console.error("Error fetching notifications:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, [profile?.id]);

  const handleMarkAsRead = async (notificationId: string) => {
    try {
      const { error } = await supabase.rpc("mark_notification_read", {
        p_notification_id: notificationId,
      });

      if (error) throw error;

      // Update local state
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notificationId ? { ...n, read: true, read_at: new Date().toISOString() } : n
        )
      );

      onUpdate();
    } catch (error) {
      console.error("Error marking notification as read:", error);
    }
  };

  const handleMarkAllAsRead = async () => {
    setMarkingAllRead(true);
    try {
      const { error } = await supabase.rpc("mark_all_notifications_read");

      if (error) throw error;

      // Update local state
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, read: true, read_at: new Date().toISOString() }))
      );

      toast({
        title: "All notifications marked as read",
        variant: "success",
      });

      onUpdate();
    } catch (error) {
      console.error("Error marking all as read:", error);
      toast({
        title: "Error",
        description: "Failed to mark notifications as read",
        variant: "destructive",
      });
    } finally {
      setMarkingAllRead(false);
    }
  };

  const handleNotificationClick = async (notification: Notification) => {
    // Mark as read if not already
    if (!notification.read) {
      await handleMarkAsRead(notification.id);
    }

    // Navigate if there's a link
    if (notification.link_url) {
      onClose();
      router.push(notification.link_url);
    }
  };

  const getNotificationIcon = (type: string) => {
    const Icon = notificationIcons[type] || AlertTriangle;
    return Icon;
  };

  const getNotificationColor = (type: string) => {
    return notificationColors[type] || "text-gray-600 bg-gray-50 dark:bg-gray-950";
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="flex flex-col h-[500px]">
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-lg">Notifications</h3>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              onClose();
              router.push("/settings?tab=notifications");
            }}
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
        {unreadCount > 0 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {unreadCount} unread notification{unreadCount !== 1 ? "s" : ""}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAllAsRead}
              disabled={markingAllRead}
            >
              {markingAllRead ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <CheckCheck className="h-3 w-3 mr-1" />
              )}
              Mark all read
            </Button>
          </div>
        )}
      </div>

      {/* Notifications List */}
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center px-4">
            <Bell className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No notifications yet</p>
          </div>
        ) : (
          <div className="divide-y">
            {notifications.map((notification) => {
              const Icon = getNotificationIcon(notification.type);
              const colorClass = getNotificationColor(notification.type);

              return (
                <div
                  key={notification.id}
                  className={`p-4 transition-colors cursor-pointer hover:bg-muted/50 ${
                    !notification.read ? "bg-blue-50/50 dark:bg-blue-950/20" : ""
                  }`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="flex gap-3">
                    <div className={`flex-shrink-0 p-2 rounded-lg ${colorClass}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium text-sm">{notification.title}</p>
                        {!notification.read && (
                          <div className="flex-shrink-0 w-2 h-2 bg-blue-600 rounded-full mt-1" />
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {notification.message}
                      </p>
                      <div className="flex items-center justify-between mt-2">
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(notification.created_at), {
                            addSuffix: true,
                          })}
                        </p>
                        {!notification.read && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMarkAsRead(notification.id);
                            }}
                          >
                            <Check className="h-3 w-3 mr-1" />
                            Mark read
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {/* Footer */}
      {notifications.length > 0 && (
        <>
          <Separator />
          <div className="p-3">
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => {
                onClose();
                router.push("/notifications");
              }}
            >
              View all notifications
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
