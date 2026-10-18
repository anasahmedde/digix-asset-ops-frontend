import { getToken } from "./token-store";
type MessageHandler = (data: unknown) => void;

export class WebSocketClient {
  private path: string;
  private ws: WebSocket | null = null;
  private handlers: Map<string, Set<MessageHandler>> = new Map();
  private reconnectAttempts = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private keepAlive: ReturnType<typeof setInterval> | null = null;
  private intentionallyClosed = false;

  constructor(path: string) {
    this.path = path;
  }

  /** Built on every connect: the login token is renewed every half hour,
   *  and a reconnect carrying the one from page load was turned away. */
  private get url(): string {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}${this.path}?token=${getToken("access_token") || ""}`;
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
      // A quiet socket is cut by the proxy; a ping now and then keeps it open.
      if (this.keepAlive) clearInterval(this.keepAlive);
      this.keepAlive = setInterval(() => this.send({ type: "ping" }), 25000);
      this.emit("_connected", null);
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        // A message without a type is only "_message"; emitting it under
        // both names ran every catch-all handler twice.
        if (data.type) this.emit(data.type, data);
        this.emit("_message", data);
      } catch {
        /* ignore unparseable */
      }
    };

    this.ws.onclose = () => {
      if (this.keepAlive) clearInterval(this.keepAlive);
      this.keepAlive = null;
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
    if (this.keepAlive) clearInterval(this.keepAlive);
    this.keepAlive = null;
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
    // Never gives up: a laptop waking up or a redeploy must not leave the
    // page deaf until it is reloaded. Backs off to every 30 seconds.
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;
    this.reconnectTimeout = setTimeout(() => this.connect(), delay);
  }
}
