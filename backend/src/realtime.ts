import type { Server, IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import { createRoomRepository } from "./repositories/rooms.repository.js";
import { z } from "zod";
import type { Database } from "./db.js";
import type { roomView, messageView } from "./helpers/responseMappers.js";
import { findSessionUser, sessionHash } from "./identity.js";

export type LiveEvent =
  | { type: "room.created"; room: ReturnType<typeof roomView> }
  | { type: "room.updated"; room: ReturnType<typeof roomView> }
  | { type: "room.deleted"; roomId: string }
  | { type: "message.created"; message: ReturnType<typeof messageView>; roomOwnerId?: string }
  | { type: "room.read"; roomId: string; userId: string };
export type PublishEvent = (event: LiveEvent) => void;

const commandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("subscribe.rooms"),
    requestId: z.string().uuid(),
    roomIds: z.array(z.string().regex(/^[a-f\d]{24}$/i)).max(20),
  }).strict(),
  z.object({
    type: z.literal("subscribe"),
    requestId: z.string().uuid(),
    roomId: z.string().regex(/^[a-f\d]{24}$/i),
  }).strict(),
  z.object({
    type: z.literal("unsubscribe"),
    requestId: z.string().uuid(),
  }).strict(),
]);

interface Peer {
  socket: WebSocket;
  userId: string;
  cookie: string | undefined;
  ip: string;
  roomId: string | null;
  roomIds: Set<string>;
  recentRoomIds: Set<string>;
  revision: number;
  alive: boolean;
  windowStart: number;
  commands: number;
}

export function attachRealtime(
  server: Server,
  database: Database,
  options: { heartbeatMs?: number } = {},
) {
  const roomsRepository = createRoomRepository(database);
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 4096,
    perMessageDeflate: false,
  });
  const peers = new Map<WebSocket, Peer>();
  const deletedRooms = new Set<string>();
  const attempts = new Map<string, { count: number; until: number }>();
  const allowedOrigins = new Set((
    process.env.ALLOWED_ORIGINS ??
    "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173"
  ).split(",").map(value => value.trim()).filter(Boolean));
  let closing = false;

  function reject(socket: Duplex, status: number, reason: string) {
    if (!socket.destroyed) socket.end(
      "HTTP/1.1 " + status + " " + reason +
      "\r\nConnection: close\r\nContent-Length: 0\r\n\r\n",
    );
  }

  function send(peer: Peer, event: unknown) {
    if (peer.socket.readyState !== WebSocket.OPEN) return;
    if (peer.socket.bufferedAmount > 1024 * 1024) {
      peer.socket.terminate();
      return;
    }
    try {
      peer.socket.send(JSON.stringify(event), error => {
        if (error) peer.socket.terminate();
      });
    } catch { peer.socket.terminate(); }
  }

  function connect(socket: WebSocket, request: IncomingMessage, userId: string, recentRoomIds: string[]) {
    const peer: Peer = {
      socket, userId, cookie: request.headers.cookie,
      ip: request.socket.remoteAddress ?? "unknown",
      roomId: null, roomIds: new Set(), recentRoomIds: new Set(recentRoomIds.reverse()), revision: 0, alive: true,
      windowStart: Date.now(), commands: 0,
    };
    peers.set(socket, peer);
    socket.on("error", () => socket.terminate());
    socket.on("close", () => { peer.revision++; peers.delete(socket); });
    socket.on("pong", () => { peer.alive = true; });
    socket.on("message", (data, binary) => {
      if (closing || socket.readyState !== WebSocket.OPEN) return;
      if (binary) { socket.close(1003, "JSON text commands only"); return; }
      if (Date.now() - peer.windowStart >= 60_000) {
        peer.windowStart = Date.now(); peer.commands = 0;
      }
      if (++peer.commands > 60) { socket.close(1008, "Too many commands"); return; }
      let command: z.infer<typeof commandSchema>;
      try {
        command = commandSchema.parse(JSON.parse(data.toString()));
      } catch {
        send(peer, { type: "error", message: "Invalid subscription command" });
        return;
      }
      const revision = ++peer.revision;
      peer.roomId = null;
      peer.roomIds.clear();
      if (command.type === "unsubscribe") {
        send(peer, { type: "unsubscribed", requestId: command.requestId });
        return;
      }
      if (command.type === "subscribe.rooms") {
        const ids = [...new Set(command.roomIds.map(id => id.toLowerCase()))];
        void Promise.all(ids.map(id => roomsRepository.exists(id)))
          .then(rooms => {
            if (revision !== peer.revision || !peers.has(socket) || closing) return;
            if (rooms.some(room => !room) || ids.some(id => deletedRooms.has(id))) {
              send(peer, { type: "error", requestId: command.requestId, message: "Chatroom not found" });
              return;
            }
            peer.roomIds = new Set(ids);
            send(peer, { type: "rooms.subscribed", requestId: command.requestId, roomIds: ids });
          }).catch(() => {
            if (revision === peer.revision) send(peer, { type: "error", requestId: command.requestId, message: "Could not join chatrooms" });
          });
        return;
      }
      // Revision checking prevents a slow subscribe(A) overriding subscribe(B).
      const roomId = command.roomId.toLowerCase();
      void roomsRepository.exists(roomId)
        .then(room => {
          if (revision !== peer.revision || !peers.has(socket) || closing) return;
          if (!room || deletedRooms.has(roomId)) {
            send(peer, { type: "error", requestId: command.requestId, message: "Chatroom not found" });
            return;
          }
          peer.roomId = roomId;
          peer.roomIds.add(peer.roomId);
          send(peer, { type: "subscribed", requestId: command.requestId, roomId: peer.roomId });
        }).catch(() => {
          if (revision === peer.revision)
            send(peer, { type: "error", requestId: command.requestId, message: "Could not join chatroom" });
        });
    });
    send(peer, { type: "ready", userId });
  }

  const upgrade = (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    socket.on("error", () => {});
    const upgradeTimeout = setTimeout(() => socket.destroy(), 10_000);
    upgradeTimeout.unref();
    socket.once("close", () => clearTimeout(upgradeTimeout));
    void (async () => {
      if (new URL(request.url ?? "/", "http://localhost").pathname !== "/ws") {
        reject(socket, 404, "Not Found"); return;
      }
      if (closing) { reject(socket, 503, "Service Unavailable"); return; }
      const origin = request.headers.origin;
      // Browsers send Origin. Non-browser clients still need a valid cookie.
      if (origin && !allowedOrigins.has(origin)) { reject(socket, 403, "Forbidden"); return; }
      const ip = request.socket.remoteAddress ?? "unknown";
      const now = Date.now();
      const budget = attempts.get(ip) ?? { count: 0, until: now + 60_000 };
      if (budget.until <= now) { budget.count = 0; budget.until = now + 60_000; }
      attempts.set(ip, budget);
      if (++budget.count > 30) { reject(socket, 429, "Too Many Requests"); return; }
      const user = await findSessionUser(database, request.headers.cookie);
      if (!user) { reject(socket, 401, "Unauthorized"); return; }
      const recent = user.passwordHash ? await roomsRepository.recent(user._id.toHexString(), 20) : [];
      if (socket.destroyed) return;
      if (closing || peers.size >= 500 ||
          [...peers.values()].filter(peer => peer.ip === ip).length >= 20) {
        reject(socket, 503, "Service Unavailable"); return;
      }
      clearTimeout(upgradeTimeout);
      wss.handleUpgrade(request, socket, head, ws => connect(ws, request, user._id.toHexString(), recent.map(row => row.room.id)));
    })().catch(() => reject(socket, 503, "Service Unavailable"));
  };
  server.on("upgrade", upgrade);

  const heartbeat = setInterval(() => {
    for (const [ip, budget] of attempts) if (budget.until <= Date.now()) attempts.delete(ip);
    for (const peer of peers.values()) {
      if (!peer.alive) { peer.socket.terminate(); continue; }
      peer.alive = false;
      try { peer.socket.ping(); } catch { peer.socket.terminate(); }
      // TTL cleanup is asynchronous; validate expiration explicitly.
      void findSessionUser(database, peer.cookie).then(user => {
        if (!user || user._id.toHexString() !== peer.userId)
          peer.socket.close(4401, "Session expired; initialize /api/me again");
      }).catch(() => peer.socket.close(1011, "Session check unavailable"));
    }
  }, options.heartbeatMs ?? 30_000);
  heartbeat.unref();

  const publish: PublishEvent = event => {
    if (closing) return;
    if (event.type === "room.deleted") deletedRooms.add(event.roomId);
    if (event.type === "message.created" && deletedRooms.has(event.message.roomId)) return;
    if ((event.type === "room.created" || event.type === "room.updated") && deletedRooms.has(event.room.id)) return;
    for (const peer of peers.values()) {
      if (event.type === "room.read" && peer.userId !== event.userId) continue;
      if (event.type === "room.deleted") {
        peer.roomIds.delete(event.roomId);
        peer.recentRoomIds.delete(event.roomId);
        if (peer.roomId === event.roomId) peer.roomId = null;
      }
      if (event.type === "message.created" && event.message.userId === peer.userId) {
        peer.recentRoomIds.delete(event.message.roomId);
        peer.recentRoomIds.add(event.message.roomId);
        if (peer.recentRoomIds.size > 20) peer.recentRoomIds.delete(peer.recentRoomIds.values().next().value!);
      }
      if (event.type !== "message.created" || peer.roomIds.has(event.message.roomId) || event.roomOwnerId === peer.userId || peer.recentRoomIds.has(event.message.roomId))
        send(peer, event);
    }
  };

  function revokeSession(hash: string) {
    for (const peer of peers.values()) {
      if (sessionHash(peer.cookie) === hash) {
        peer.revision++;
        peer.roomIds.clear();
        peer.socket.close(4401, "Session changed; reconnect with your current account");
      }
    }
  }

  async function close() {
    if (closing) return;
    closing = true;
    clearInterval(heartbeat);
    server.off("upgrade", upgrade);
    const force = setTimeout(() => {
      for (const peer of peers.values()) peer.socket.terminate();
    }, 2000);
    force.unref();
    for (const peer of peers.values()) peer.socket.close(1001, "Server shutting down");
    await new Promise<void>(resolve => wss.close(() => resolve()));
    clearTimeout(force);
  }

  return { publish, close, revokeSession };
}

