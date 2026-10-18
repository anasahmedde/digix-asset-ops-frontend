"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

import api from "@/lib/api";
import { WebSocketClient } from "@/lib/websocket";

export interface Notification {
  id: string;
  notification_type: string;
  title: string;
  message: string;
  alert?: string | null;
  ticket?: string | null;
  /** Where the work is: the page that answers this notification. */
  link?: string;
  /** What it is about, so a decision clears it: "po:<id>", "wo:<id>", … */
  ref?: string;
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
  /** The left panel listing every notification. */
  panelOpen: boolean;
  openPanel: () => void;
  closePanel: () => void;
  /** Just arrived: shown as cards at the top left until they time out. */
  incoming: Notification[];
  dismissIncoming: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextValue>({
  notifications: [],
  unreadCount: 0,
  markRead: async () => {},
  markAllRead: async () => {},
  refresh: () => {},
  panelOpen: false,
  openPanel: () => {},
  closePanel: () => {},
  incoming: [],
  dismissIncoming: () => {},
});

export function useNotifications() {
  return useContext(NotificationContext);
}

function getNotificationRoute(notif: Notification): string {
  // The server says where the work is; the switch below is for the
  // notifications that predate the link.
  if (notif.link) return notif.link;
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
  const [panelOpen, setPanelOpen] = useState(false);
  const [incoming, setIncoming] = useState<Notification[]>([]);
  // Read inside the socket handler, which is set up once.
  const panelRef = useRef(false);

  const openPanel = useCallback(() => {
    panelRef.current = true;
    setPanelOpen(true);
    setIncoming([]);
  }, []);
  const closePanel = useCallback(() => {
    panelRef.current = false;
    setPanelOpen(false);
  }, []);
  const dismissIncoming = useCallback((id: string) => {
    setIncoming((prev) => prev.filter((n) => n.id !== id));
  }, []);

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

      // The newest on top, three at most; the panel, when open, already shows it.
      if (notification.notification_type !== "digest" && !panelRef.current) {
        setIncoming((prev) => [notification, ...prev.filter((n) => n.id !== notification.id)].slice(0, 3));
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
        panelOpen,
        openPanel,
        closePanel,
        incoming,
        dismissIncoming,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}
