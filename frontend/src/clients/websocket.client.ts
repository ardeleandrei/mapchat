import { liveSchema, type Connection, type LiveEvent } from "../types";

export class Superseded extends Error {}
interface Pending {
  resolve: () => void; reject: (cause: Error) => void; timeout: number;
}
interface Handlers {
  state: (state: Connection) => void;
  ready: (userId: string) => void;
  event: (event: LiveEvent) => void;
  expired: () => void;
}
export class LiveClient {
  private socket: WebSocket | null = null;
  private stopped = true;
  private retry: number | undefined;
  private handshake: number | undefined;
  private attempt = 0;
  private pending = new Map<string, Pending>();
  private handlers: Handlers;

  constructor(handlers: Handlers) { this.handlers = handlers; }

  start() { this.stop(); this.stopped = false; this.attempt = 0; this.connect(); }

  private connect() {
    if (this.stopped) return;
    this.handlers.state(this.attempt ? "reconnecting" : "connecting");
    const url = new URL("/ws", location.href);
    url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(url);
    this.socket = socket;
    this.handshake = window.setTimeout(() => socket.close(), 10000);
    socket.onmessage = message => {
      if (this.socket !== socket || this.stopped) return;
      let event: LiveEvent;
      try { event = liveSchema.parse(JSON.parse(String(message.data))); }
      catch { return; }
      if (event.type === "ready") {
        window.clearTimeout(this.handshake); this.attempt = 0;
        this.handlers.state("online"); this.handlers.ready(event.userId);
      } else if (event.type === "subscribed" || event.type === "unsubscribed" || event.type === "rooms.subscribed" ||
          (event.type === "error" && event.requestId)) {
        const key = event.requestId!;
        const pending = this.pending.get(key);
        if (pending) {
          window.clearTimeout(pending.timeout); this.pending.delete(key);
          if (event.type === "error") pending.reject(new Error(event.message));
          else pending.resolve();
        }
      } else this.handlers.event(event);
    };
    socket.onerror = () => socket.close();
    socket.onclose = event => {
      if (this.socket !== socket || this.stopped) return;
      window.clearTimeout(this.handshake);
      this.rejectPending(new Error("Live connection lost. Reconnecting…"));
      this.socket = null;
      if (event.code === 4401) {
        this.stopped = true; this.handlers.state("offline"); this.handlers.expired(); return;
      }
      this.handlers.state("reconnecting");
      const delay = Math.min(15000, 750 * 2 ** Math.min(this.attempt++, 5));
      this.retry = window.setTimeout(() => this.connect(), delay * (0.85 + Math.random() * 0.3));
    };
  }

  private rejectPending(error: Error) {
    for (const request of this.pending.values()) {
      window.clearTimeout(request.timeout); request.reject(error);
    }
    this.pending.clear();
  }

  join(roomId: string | null): Promise<void> {
    return this.requestJoin(roomId ? { type: "subscribe", roomId } : { type: "unsubscribe" });
  }

  joinRooms(roomIds: string[]): Promise<void> {
    return this.requestJoin({ type: "subscribe.rooms", roomIds });
  }

  private requestJoin(command: object): Promise<void> {
    this.rejectPending(new Superseded("A newer room was selected"));
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error("Live connection is reconnecting."));
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.pending.delete(requestId); reject(new Error("Joining the room timed out."));
        socket.close();
      }, 8000);
      this.pending.set(requestId, { resolve, reject, timeout });
      try {
        socket.send(JSON.stringify({ ...command, requestId }));
      } catch {
        window.clearTimeout(timeout); this.pending.delete(requestId);
        reject(new Error("Could not join the room.")); socket.close();
      }
    });
  }

  reconnectNow() {
    if (this.stopped) return;
    if (this.socket?.readyState === WebSocket.OPEN) return;
    window.clearTimeout(this.retry);
    window.clearTimeout(this.handshake);
    this.socket?.close(); this.socket = null; this.connect();
  }

  stop() {
    this.stopped = true; window.clearTimeout(this.retry); window.clearTimeout(this.handshake);
    this.rejectPending(new Superseded("Live client stopped"));
    const socket = this.socket; this.socket = null; socket?.close(1000);
  }
}
