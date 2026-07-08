"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import api from "@/lib/api";
import { WebSocketClient } from "@/lib/websocket";

interface ChatNotification {
  type: "chat_message";
  room_id: string;
  room_name: string;
  sender_id: string;
  sender_name: string;
  content: string;
  message_id: string;
  created_at: string;
}

interface ChatUnreadContextValue {
  totalUnread: number;
  decrementUnread: (count: number) => void;
  refresh: () => void;
}

const ChatUnreadContext = createContext<ChatUnreadContextValue>({
  totalUnread: 0,
  decrementUnread: () => {},
  refresh: () => {},
});

export function useChatUnread() {
  return useContext(ChatUnreadContext);
}

export function ChatUnreadProvider({ children }: { children: React.ReactNode }) {
  const [totalUnread, setTotalUnread] = useState(0);
  const wsRef = useRef<WebSocketClient | null>(null);
  const activeRoomRef = useRef<string | null>(null);

  const fetchUnread = useCallback(async () => {
    try {
      const { data } = await api.get("/chat/rooms/total_unread/");
      setTotalUnread(data.total_unread ?? 0);
    } catch {
      /* silently fail */
    }
  }, []);

  useEffect(() => {
    fetchUnread();

    const ws = new WebSocketClient("/ws/notifications/");
    wsRef.current = ws;

    ws.on("_message", (raw) => {
      const data = raw as Record<string, unknown>;
      if (data.type !== "chat_message") return;

      const notif = data as unknown as ChatNotification;

      if (activeRoomRef.current === notif.room_id) return;

      setTotalUnread((prev) => prev + 1);

      toast(notif.sender_name, {
        description: notif.content.length > 80
          ? notif.content.slice(0, 80) + "..."
          : notif.content,
        action: {
          label: "Open",
          onClick: () => {
            window.location.href = "/chat";
          },
        },
        duration: 5000,
      });
    });

    ws.connect();

    return () => {
      ws.disconnect();
    };
  }, [fetchUnread]);

  const decrementUnread = useCallback((count: number) => {
    setTotalUnread((prev) => Math.max(0, prev - count));
  }, []);

  useEffect(() => {
    function handleRouteChange() {
      const path = window.location.pathname;
      if (path === "/chat") {
        activeRoomRef.current = "__chat_page__";
      } else {
        activeRoomRef.current = null;
      }
    }

    handleRouteChange();
    window.addEventListener("popstate", handleRouteChange);
    return () => window.removeEventListener("popstate", handleRouteChange);
  }, []);

  return (
    <ChatUnreadContext.Provider value={{ totalUnread, decrementUnread, refresh: fetchUnread }}>
      {children}
    </ChatUnreadContext.Provider>
  );
}
