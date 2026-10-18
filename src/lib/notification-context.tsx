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

const NOTICES_EVENT = "digix:notices";

/** Reload what is on screen when a notification about it arrives - a
 *  budget sent up, a PO decided - so the page does not wait for a refresh. */
export function useReloadOnNotice(about: (n: Notification) => boolean, reload: () => void) {
  const latest = useRef({ about, reload });
  latest.current = { about, reload };
  useEffect(() => {
    // One decision saves several things; reload once for the burst.
    let wait: ReturnType<typeof setTimeout> | null = null;
    const on = (e: Event) => {
      if (!(e as CustomEvent<Notification[]>).detail.some((n) => latest.current.about(n))) return;
      if (wait) clearTimeout(wait);
      wait = setTimeout(() => latest.current.reload(), 400);
    };
    window.addEventListener(NOTICES_EVENT, on);
    return () => {
      window.removeEventListener(NOTICES_EVENT, on);
      if (wait) clearTimeout(wait);
    };
  }, []);
}

/** A notification whose link lands on this section - or word that
 *  something on it changed. */
export const linksTo = (path: string) => (n: Notification) =>
  (n.link ?? "").startsWith(path) || n.data?.section === path;

/** A notification about this project: a budget, a quantity increase, a procurement on it. */
export const aboutProject = (id: string) => (n: Notification) =>
  (n.link ?? "").includes(id) || n.data?.project === id;

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

  // Every id this page has already shown, so a fetch can tell what is new.
  const seenRef = useRef<Set<string> | null>(null);

  /** Show what arrived: a card at the top right, unless the panel is open;
   *  and tell the page, which reloads if it is about what is on screen. */
  const announce = useCallback((fresh: Notification[]) => {
    if (fresh.length) window.dispatchEvent(new CustomEvent(NOTICES_EVENT, { detail: fresh }));
    const shown = fresh.filter((n) => n.notification_type !== "digest");
    if (shown.length === 0 || panelRef.current) return;
    setIncoming((prev) => [...shown, ...prev.filter((p) => !shown.some((n) => n.id === p.id))].slice(0, 3));
  }, []);

  // The bar holds what is not acknowledged yet; the Alerts page keeps the rest.
  const fetchNotifications = useCallback(async () => {
    try {
      const [listRes, countRes] = await Promise.all([
        api.get("/notifications/notifications/", { params: { page_size: 50, ordering: "-created_at", is_read: false } }),
        api.get("/notifications/notifications/unread_count/"),
      ]);
      const list: Notification[] = listRes.data.results ?? [];
      setNotifications(list);
      setUnreadCount(countRes.data.count ?? 0);
      // Anything the socket missed (it was down, or the token had lapsed)
      // still gets its card - but not the backlog on first load.
      if (seenRef.current) announce(list.filter((n) => !seenRef.current!.has(n.id)));
      seenRef.current = new Set([...(seenRef.current ?? []), ...list.map((n) => n.id)]);
    } catch {
      /* silently fail */
    }
  }, [announce]);

  useEffect(() => {
    fetchNotifications();

    const ws = new WebSocketClient("/ws/notifications/");
    wsRef.current = ws;

    ws.on("_message", (data) => {
      const raw = data as Record<string, unknown>;

      if (raw.type === "chat_message") return;

      // Something on a project moved: whoever has it open reloads it.
      if (raw.type === "changed") {
        window.dispatchEvent(new CustomEvent(NOTICES_EVENT, { detail: [raw as unknown as Notification] }));
        return;
      }

      // Someone answered a request this person was also asked: it leaves the
      // bar, and the page showing it reloads.
      if (raw.type === "resolved") {
        window.dispatchEvent(new CustomEvent(NOTICES_EVENT, { detail: [raw as unknown as Notification] }));
        setIncoming((prev) => prev.filter((n) => n.id !== raw.id));
        fetchNotifications();
        return;
      }

      const notification = raw as unknown as Notification;
      if (!notification.id || seenRef.current?.has(notification.id)) return;
      seenRef.current?.add(notification.id);

      setNotifications((prev) => [notification, ...prev.filter((n) => n.id !== notification.id)].slice(0, 50));
      setUnreadCount((prev) => prev + 1);
      announce([notification]);
    });
    // Dropped: fetching renews a lapsed login, so the reconnect gets in, and
    // catches up on what came while the socket was down.
    ws.on("_disconnected", () => { fetchNotifications(); });

    ws.connect();

    // Belt and braces: look again every minute, and on coming back to the tab.
    const poll = setInterval(() => { if (document.visibilityState === "visible") fetchNotifications(); }, 60000);
    const onVisible = () => { if (document.visibilityState === "visible") fetchNotifications(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      ws.disconnect();
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [fetchNotifications, announce]);

  /** Acknowledged: it leaves the bar (the Alerts page still lists it). */
  const markRead = useCallback(async (id: string) => {
    try {
      await api.post(`/notifications/notifications/${id}/mark_read/`);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      setIncoming((prev) => prev.filter((n) => n.id !== id));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      /* silently fail */
    }
  }, []);

  const markAllRead = useCallback(async () => {
    try {
      await api.post("/notifications/notifications/mark_all_read/");
      setNotifications([]);
      setIncoming([]);
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
