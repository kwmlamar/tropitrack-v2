"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface QueueItem {
  id: string;
  type: "time_entry" | "invoice" | "payment" | "expense";
  action: "insert" | "update" | "delete";
  data: any;
  timestamp: number;
  retries: number;
  error?: string;
}

const QUEUE_STORAGE_KEY = "tropitrack_offline_queue";
const MAX_RETRIES = 3;

export function useOfflineQueue() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [syncing, setSyncing] = useState(false);
  const { toast } = useToast();
  const supabase = createClient();

  // Load queue from localStorage on mount
  useEffect(() => {
    loadQueue();
  }, []);

  // Listen for online/offline events
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast({
        title: "Back online",
        description: "Syncing queued data...",
        variant: "default",
      });
      syncQueue();
    };

    const handleOffline = () => {
      setIsOnline(false);
      toast({
        title: "You're offline",
        description: "Changes will be synced when you're back online.",
        variant: "default",
      });
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnline && queue.length > 0) {
      syncQueue();
    }
  }, [isOnline]);

  const loadQueue = () => {
    try {
      const stored = localStorage.getItem(QUEUE_STORAGE_KEY);
      if (stored) {
        setQueue(JSON.parse(stored));
      }
    } catch (error) {
      console.error("Error loading queue:", error);
    }
  };

  const saveQueue = (items: QueueItem[]) => {
    try {
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(items));
      setQueue(items);
    } catch (error) {
      console.error("Error saving queue:", error);
    }
  };

  const addToQueue = useCallback(
    async (item: Omit<QueueItem, "id" | "retries">) => {
      const queueItem: QueueItem = {
        ...item,
        id: `queue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        retries: 0,
      };

      const updatedQueue = [...queue, queueItem];
      saveQueue(updatedQueue);

      return queueItem.id;
    },
    [queue]
  );

  const removeFromQueue = useCallback(
    (id: string) => {
      const updatedQueue = queue.filter((item) => item.id !== id);
      saveQueue(updatedQueue);
    },
    [queue]
  );

  const syncQueue = useCallback(async () => {
    if (syncing || queue.length === 0 || !isOnline) return;

    setSyncing(true);
    const itemsToSync = [...queue];
    const failedItems: QueueItem[] = [];

    for (const item of itemsToSync) {
      try {
        await processQueueItem(item);
        // Successfully synced, remove from queue
        removeFromQueue(item.id);
      } catch (error: any) {
        console.error(`Error syncing queue item ${item.id}:`, error);

        // Increment retry count
        const updatedItem = {
          ...item,
          retries: item.retries + 1,
          error: error.message,
        };

        if (updatedItem.retries >= MAX_RETRIES) {
          // Max retries reached, notify user
          toast({
            title: "Sync failed",
            description: `Failed to sync ${item.type} after ${MAX_RETRIES} attempts.`,
            variant: "destructive",
          });
          // Remove from queue after max retries
          removeFromQueue(item.id);
        } else {
          failedItems.push(updatedItem);
        }
      }
    }

    // Update queue with failed items
    if (failedItems.length > 0) {
      saveQueue(failedItems);
    }

    setSyncing(false);

    if (queue.length > 0 && failedItems.length === 0) {
      toast({
        title: "Sync complete",
        description: `${queue.length} item(s) synced successfully.`,
        variant: "success",
      });
    }
  }, [queue, syncing, isOnline, toast]);

  const processQueueItem = async (item: QueueItem) => {
    const table = getTableName(item.type);

    switch (item.action) {
      case "insert":
        const { error: insertError } = await supabase.from(table).insert(item.data);
        if (insertError) throw insertError;
        break;

      case "update":
        const { id, ...updateData } = item.data;
        const { error: updateError } = await supabase
          .from(table)
          .update(updateData)
          .eq("id", id);
        if (updateError) throw updateError;
        break;

      case "delete":
        const { error: deleteError } = await supabase
          .from(table)
          .delete()
          .eq("id", item.data.id);
        if (deleteError) throw deleteError;
        break;

      default:
        throw new Error(`Unknown action: ${item.action}`);
    }
  };

  const getTableName = (type: QueueItem["type"]): string => {
    switch (type) {
      case "time_entry":
        return "time_entries";
      case "invoice":
        return "invoices";
      case "payment":
        return "payments";
      case "expense":
        return "expenses";
      default:
        throw new Error(`Unknown type: ${type}`);
    }
  };

  const clearQueue = useCallback(() => {
    saveQueue([]);
    toast({
      title: "Queue cleared",
      description: "All queued items have been removed.",
    });
  }, [toast]);

  return {
    isOnline,
    queue,
    queueSize: queue.length,
    syncing,
    addToQueue,
    removeFromQueue,
    syncQueue,
    clearQueue,
  };
}
