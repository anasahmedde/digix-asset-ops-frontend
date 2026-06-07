"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import api from "@/lib/api";
import { WebSocketClient } from "@/lib/websocket";

export interface Notification {
  id: string;
  notification_type: string;
  title: string;
  message: string;
  alert?: string | null;
  ticket?: string | null;
  data: Record<string, unknown>;
  is_read: boolean;
  read_at: string | null;
  is_actionable: boolean;
  is_resolved: boolean;
  resolved_at: string | null;
  created_at: string;
}

interface NotificationContextValue {
  notifications: Notification[];
  unreadCount: number;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  refresh: () => void;
}

const NotificationContext = createContext<NotificationContextValue>({
  notifications: [],
  unreadCount: 0,
  markRead: async () => {},
  markAllRead: async () => {},
  refresh: () => {},
});

export function useNotifications() {
  return useContext(NotificationContext);
}

function getNotificationRoute(notif: Notification): string {
  const d = notif.data;

  switch (notif.notification_type) {
    case "ticket_assigned":
    case "ticket_update":
    case "ticket_review":
      if (d.ticket_id) return `/tickets?open=${d.ticket_id}`;
      return "/tickets";

    case "alert": {
      const category = d.category as string | undefined;
      if (category === "device_status" && d.device_id) return `/assets?device=${d.device_id}`;
      if (category === "maintenance_due") return "/maintenance";
      if (category === "warranty_expiry") return "/warranties";
      if (category === "inventory_low") return "/inventory";
      if (category === "ticket_overdue") return "/tickets";
      if (d.site_id) return `/sites`;
      return "/alerts";
    }

    case "maintenance_reminder":
      return "/maintenance";

    default:
      return "/alerts";
  }
}

export { getNotificationRoute };

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const wsRef = useRef<WebSocketClient | null>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const [listRes, countRes] = await Promise.all([
        api.get("/notifications/notifications/", { params: { page_size: 30, ordering: "-created_at" } }),
        api.get("/notifications/notifications/unread_count/"),
      ]);
      setNotifications(listRes.data.results ?? []);
      setUnreadCount(countRes.data.count ?? 0);
    } catch {
      /* silently fail */
    }
  }, []);

  useEffect(() => {
    fetchNotifications();

    const ws = new WebSocketClient("/ws/notifications/");
    wsRef.current = ws;

    ws.on("_message", (data) => {
      const raw = data as Record<string, unknown>;

      if (raw.type === "chat_message") return;

      const notification = raw as unknown as Notification;
      if (!notification.id) return;

      setNotifications((prev) => [notification, ...prev].slice(0, 30));
      setUnreadCount((prev) => prev + 1);

      const nType = notification.notification_type;
      if (nType === "ticket_assigned" || nType === "ticket_update" || nType === "ticket_review") {
        const route = getNotificationRoute(notification);
        const label = nType === "ticket_review" ? "Review Now" : "View Ticket";
        toast(notification.title, {
          description: notification.message,
          action: {
            label,
            onClick: () => {
              window.location.href = route;
            },
          },
          duration: 8000,
        });
      } else if (nType === "alert") {
        const severity = (notification.data?.severity as string) || "info";
        const method = severity === "critical" || severity === "error" ? toast.error : toast.warning;
        const route = getNotificationRoute(notification);
        method(notification.title, {
          description: notification.message,
          action: {
            label: "View",
            onClick: () => {
              window.location.href = route;
            },
          },
          duration: 6000,
        });
      }
    });

    ws.connect();

    return () => {
      ws.disconnect();
    };
  }, [fetchNotifications]);

  const markRead = useCallback(async (id: string) => {
    try {
      await api.post(`/notifications/notifications/${id}/mark_read/`);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      /* silently fail */
    }
  }, []);

  const markAllRead = useCallback(async () => {
    try {
      await api.post("/notifications/notifications/mark_all_read/");
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true, read_at: new Date().toISOString() })));
      setUnreadCount(0);
    } catch {
      /* silently fail */
    }
  }, []);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        markRead,
        markAllRead,
        refresh: fetchNotifications,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}
