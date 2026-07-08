"use client";

import { MessageSquare, Plus, Search, Send, Users } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { useChatUnread } from "@/lib/chat-context";
import { WebSocketClient } from "@/lib/websocket";
import { Avatar } from "@/components/ui/avatar";
import { formatDateTime } from "@/lib/utils";

interface ChatMessage {
  id: string;
  room: string;
  sender: string;
  sender_name: string;
  sender_avatar: string | null;
  content: string;
  message_type: string;
  file_url: string;
  created_at: string;
}

interface ChatRoom {
  id: string;
  name: string;
  room_type: "direct" | "group";
  participants: string[];
  participant_names: string[];
  last_message: ChatMessage | null;
  unread_count: number;
  is_active: boolean;
  created_at: string;
}

interface TeamUser {
  id: string;
  username: string;
  full_name: string;
  first_name: string;
  last_name: string;
  role: string;
  avatar: string | null;
}

export default function ChatPage() {
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [activeRoom, setActiveRoom] = useState<ChatRoom | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [roomSearch, setRoomSearch] = useState("");
  const [showNewChat, setShowNewChat] = useState(false);
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const { refresh: refreshUnread } = useChatUnread();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocketClient | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentUserId = typeof window !== "undefined" ? (() => {
    try {
      const token = localStorage.getItem("access_token");
      if (!token) return null;
      const payload = JSON.parse(atob(token.split(".")[1]));
      return payload.user_id;
    } catch { return null; }
  })() : null;

  const fetchRooms = useCallback(async () => {
    try {
      const { data } = await api.get("/chat/rooms/", { params: { page_size: 100 } });
      setRooms(data.results ?? data ?? []);
    } catch (err: unknown) {
      toast.error(getApiError(err, "Failed to load chat rooms"));
    } finally {
      setLoadingRooms(false);
    }
  }, []);

  const fetchMessages = useCallback(async (roomId: string) => {
    setLoadingMessages(true);
    try {
      const { data } = await api.get(`/chat/rooms/${roomId}/messages/`, { params: { page_size: 100 } });
      setMessages(data.results ?? data ?? []);
    } catch (err: unknown) {
      toast.error(getApiError(err, "Failed to load messages"));
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!activeRoom) return;

    fetchMessages(activeRoom.id);

    const ws = new WebSocketClient(`/ws/chat/${activeRoom.id}/`);
    wsRef.current = ws;

    ws.on("_connected", () => {
      ws.send({ type: "read" });
      refreshUnread();
    });

    ws.on("message", (data) => {
      const msgData = data as { message: ChatMessage };
      if (msgData.message) {
        setMessages((prev) => [...prev, msgData.message]);
        ws.send({ type: "read" });

        setRooms((prev) =>
          prev.map((r) =>
            r.id === activeRoom.id
              ? { ...r, last_message: msgData.message, unread_count: 0 }
              : r
          )
        );
      }
    });

    ws.on("typing", (data) => {
      const typingData = data as { user_name: string };
      setTypingUser(typingData.user_name);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => setTypingUser(null), 3000);
    });

    ws.connect();

    setRooms((prev) =>
      prev.map((r) =>
        r.id === activeRoom.id ? { ...r, unread_count: 0 } : r
      )
    );

    return () => {
      ws.disconnect();
      wsRef.current = null;
      setTypingUser(null);
    };
  }, [activeRoom, fetchMessages, refreshUnread]);

  function handleSend() {
    const text = newMessage.trim();
    if (!text || !wsRef.current) return;

    wsRef.current.send({
      type: "message",
      content: text,
      message_type: "text",
    });

    setNewMessage("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    } else {
      wsRef.current?.send({ type: "typing" });
    }
  }

  async function handleNewChat(userId: string) {
    try {
      const { data } = await api.post("/chat/rooms/", { participant_ids: [userId] });
      setShowNewChat(false);
      setUserSearch("");
      await fetchRooms();
      setActiveRoom(data);
    } catch (err: unknown) {
      const msg = getApiError(err, "Failed to create chat");
      if (msg.includes("already exists")) {
        const existing = rooms.find((r) =>
          r.room_type === "direct" && r.participants.includes(userId)
        );
        if (existing) {
          setActiveRoom(existing);
          setShowNewChat(false);
          return;
        }
      }
      toast.error(msg);
    }
  }

  async function openNewChatDialog() {
    setShowNewChat(true);
    try {
      const { data } = await api.get("/accounts/users/", { params: { page_size: 100, is_active: true } });
      setUsers((data.results ?? data ?? []).filter((u: TeamUser) => u.id !== currentUserId));
    } catch {
      toast.error("Failed to load users");
    }
  }

  function getRoomDisplayName(room: ChatRoom): string {
    if (room.name) return room.name;
    if (room.room_type === "direct") {
      const other = room.participant_names.find(
        (_, i) => room.participants[i] !== currentUserId
      );
      return other || room.participant_names[0] || "Direct Chat";
    }
    return room.participant_names.join(", ") || "Group Chat";
  }

  const filteredRooms = rooms.filter((room) => {
    if (!roomSearch) return true;
    const q = roomSearch.toLowerCase();
    return (
      getRoomDisplayName(room).toLowerCase().includes(q) ||
      room.participant_names.some((n) => n.toLowerCase().includes(q))
    );
  });

  const filteredUsers = users.filter((u) => {
    if (!userSearch) return true;
    const q = userSearch.toLowerCase();
    return (
      (u.full_name || "").toLowerCase().includes(q) ||
      u.username.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex h-[calc(100vh-7rem)] overflow-hidden rounded-xl border border-border bg-card">
      {/* Room List */}
      <div className="flex w-80 shrink-0 flex-col border-r border-border">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Messages</h2>
          </div>
          <button
            onClick={openNewChatDialog}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            title="New Chat"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="px-3 py-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={roomSearch}
              onChange={(e) => setRoomSearch(e.target.value)}
              placeholder="Search conversations..."
              className="h-8 w-full rounded-lg border border-border bg-background pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingRooms ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
            </div>
          ) : filteredRooms.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <MessageSquare className="mx-auto h-8 w-8 text-muted-foreground/30" />
              <p className="mt-2 text-xs text-muted-foreground">
                {rooms.length === 0 ? "No conversations yet" : "No results"}
              </p>
              {rooms.length === 0 && (
                <button
                  onClick={openNewChatDialog}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white"
                >
                  <Plus className="h-3 w-3" /> Start a chat
                </button>
              )}
            </div>
          ) : (
            filteredRooms.map((room) => (
              <button
                key={room.id}
                onClick={() => setActiveRoom(room)}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/50 ${
                  activeRoom?.id === room.id ? "bg-primary/5 border-l-2 border-primary" : ""
                }`}
              >
                <div className="relative">
                  {room.room_type === "group" ? (
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                      <Users className="h-4 w-4 text-primary" />
                    </div>
                  ) : (
                    <Avatar name={getRoomDisplayName(room)} size="md" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <p className="truncate text-[13px] font-medium text-foreground">
                      {getRoomDisplayName(room)}
                    </p>
                    {room.last_message && (
                      <span className="ml-2 shrink-0 text-[10px] text-muted-foreground">
                        {new Date(room.last_message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="truncate text-[11px] text-muted-foreground">
                      {room.last_message?.content || "No messages yet"}
                    </p>
                    {room.unread_count > 0 && (
                      <span className="ml-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
                        {room.unread_count}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex flex-1 flex-col">
        {!activeRoom ? (
          <div className="flex flex-1 flex-col items-center justify-center">
            <MessageSquare className="h-16 w-16 text-muted-foreground/20" />
            <h3 className="mt-4 text-lg font-semibold text-foreground">Select a conversation</h3>
            <p className="mt-1 text-sm text-muted-foreground">Choose from the sidebar or start a new chat</p>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div className="flex items-center gap-3 border-b border-border px-5 py-3">
              {activeRoom.room_type === "group" ? (
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                  <Users className="h-4 w-4 text-primary" />
                </div>
              ) : (
                <Avatar name={getRoomDisplayName(activeRoom)} size="md" />
              )}
              <div>
                <p className="text-sm font-semibold text-foreground">{getRoomDisplayName(activeRoom)}</p>
                <p className="text-[11px] text-muted-foreground">
                  {activeRoom.participant_names.join(", ")}
                </p>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {loadingMessages ? (
                <div className="flex items-center justify-center py-12">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <MessageSquare className="h-10 w-10 text-muted-foreground/20" />
                  <p className="mt-2 text-sm text-muted-foreground">No messages yet. Say hello!</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((msg) => {
                    const isMe = msg.sender === currentUserId;
                    return (
                      <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                        <div className={`flex max-w-[70%] items-end gap-2 ${isMe ? "flex-row-reverse" : ""}`}>
                          {!isMe && <Avatar name={msg.sender_name} src={msg.sender_avatar} size="sm" />}
                          <div>
                            {!isMe && (
                              <p className="mb-0.5 ml-1 text-[10px] font-medium text-muted-foreground">
                                {msg.sender_name}
                              </p>
                            )}
                            <div
                              className={`rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed ${
                                isMe
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-secondary text-foreground"
                              }`}
                            >
                              {msg.content}
                            </div>
                            <p className={`mt-0.5 text-[9px] text-muted-foreground ${isMe ? "text-right mr-1" : "ml-1"}`}>
                              {formatDateTime(msg.created_at)}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              )}
              {typingUser && (
                <div className="mt-2 text-[11px] text-muted-foreground italic">
                  {typingUser} is typing...
                </div>
              )}
            </div>

            {/* Input */}
            <div className="border-t border-border px-5 py-3">
              <div className="flex items-center gap-2">
                <input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message..."
                  className="h-10 flex-1 rounded-lg border border-border bg-background px-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
                />
                <button
                  onClick={handleSend}
                  disabled={!newMessage.trim()}
                  className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* New Chat Modal */}
      {showNewChat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h3 className="text-sm font-semibold text-foreground">New Conversation</h3>
              <button
                onClick={() => { setShowNewChat(false); setUserSearch(""); }}
                className="text-muted-foreground hover:text-foreground"
              >
                &times;
              </button>
            </div>
            <div className="px-5 py-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search users..."
                  className="h-9 w-full rounded-lg border border-border bg-background pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
                  autoFocus
                />
              </div>
            </div>
            <div className="max-h-72 overflow-y-auto px-3 pb-3">
              {filteredUsers.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">No users found</p>
              ) : (
                filteredUsers.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => handleNewChat(u.id)}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-secondary/50"
                  >
                    <Avatar name={u.full_name || u.username} src={u.avatar} size="md" />
                    <div>
                      <p className="text-[13px] font-medium text-foreground">{u.full_name || u.username}</p>
                      <p className="text-[11px] capitalize text-muted-foreground">{u.role.replace(/_/g, " ")}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
