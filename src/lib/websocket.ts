type MessageHandler = (data: unknown) => void;

export class WebSocketClient {
  private url: string;
  private ws: WebSocket | null = null;
  private handlers: Map<string, Set<MessageHandler>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private intentionallyClosed = false;

  constructor(path: string) {
    const protocol = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = typeof window !== "undefined" ? window.location.host : "localhost:3000";
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    this.url = `${protocol}//${host}${path}?token=${token || ""}`;
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    this.intentionallyClosed = false;

    try {
      this.ws = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.emit("_connected", null);
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const type = data.type || "_message";
        this.emit(type, data);
        this.emit("_message", data);
      } catch {
        /* ignore unparseable */
      }
    };

    this.ws.onclose = () => {
      this.emit("_disconnected", null);
      if (!this.intentionallyClosed) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  disconnect(): void {
    this.intentionallyClosed = true;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  send(data: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  on(event: string, handler: MessageHandler): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
    return () => {
      this.handlers.get(event)?.delete(handler);
    };
  }

  private emit(event: string, data: unknown): void {
    this.handlers.get(event)?.forEach((handler) => handler(data));
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;
    this.reconnectTimeout = setTimeout(() => this.connect(), delay);
  }
}
