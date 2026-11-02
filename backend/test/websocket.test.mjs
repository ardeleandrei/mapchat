import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { setTimeout as sleep } from "node:timers/promises";
import { ObjectId } from "mongodb";
import { WebSocket } from "ws";
import { attachWebSocket } from "../dist/websocket.js";

test("WebSocket session validation and room routing", async t => {
  const users = [new ObjectId(), new ObjectId()];
  const tokens = users.map(() => randomBytes(32).toString("base64url"));
  const sessions = tokens.map((token, index) => ({
    _id: createHash("sha256").update(token).digest("hex"),
    userId: users[index], expiresAt: new Date(Date.now() + 60_000),
  }));
  const rooms = [new ObjectId(), new ObjectId()];
  const database = {
    sessions: { findOne: async query => sessions.find(s =>
      s._id === query._id && s.expiresAt > query.expiresAt.$gt) ?? null },
    users: { findOne: async query => users.some(id => id.equals(query._id))
      ? { _id: query._id } : null },
    rooms: { findOne: async query => {
      if (rooms[0].equals(query._id)) await sleep(60);
      return rooms.some(id => id.equals(query._id)) ? { _id: query._id } : null;
    } },
  };
  const server = createServer((_request, response) => response.end());
  const live = attachWebSocket(server, database, { heartbeatMs: 100 });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = "ws://127.0.0.1:" + server.address().port + "/ws";
  const clients = [];
  t.after(async () => {
    for (const ws of clients) ws.terminate();
    await live.close();
    await new Promise(resolve => server.close(resolve));
  });

  async function refused(cookie, origin = "http://localhost:3000") {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url, { headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}) } });
      clients.push(ws);
      const timeout = setTimeout(() => reject(new Error("Handshake timeout")), 2000);
      ws.on("error", () => {});
      ws.on("unexpected-response", (_request, response) => {
        clearTimeout(timeout); response.resume(); ws.close(); resolve(response.statusCode);
      });
      ws.on("open", () => { clearTimeout(timeout); reject(new Error("Connection should have been rejected")); });
    });
  }

  async function connect(index) {
    const ws = new WebSocket(url, {
      headers: { Origin: "http://localhost:3000", Cookie: "wolfchatter_session=" + tokens[index] },
    });
    clients.push(ws);
    const queue = [];
    ws.on("message", raw => queue.push(JSON.parse(raw.toString())));
    await once(ws, "open");

    async function wait(predicate) {
      const until = Date.now() + 2500;
      while (Date.now() < until) {
        const index = queue.findIndex(predicate);
        if (index >= 0) return queue.splice(index, 1)[0];
        await sleep(10);
      }
      throw new Error("Timed out waiting for event; queued: " + JSON.stringify(queue));
    }
    await wait(e => e.type === "ready");
    return { ws, queue, wait };
  }

  async function subscribe(client, room) {
    const requestId = randomUUID();
    client.ws.send(JSON.stringify({ type: "subscribe", roomId: room.toHexString(), requestId }));
    return client.wait(e => e.type === "subscribed" && e.requestId === requestId);
  }
  await t.test("rejects missing, forged, and expired sessions and foreign origins", async () => {
    assert.equal(await refused(), 401);
    assert.equal(await refused("wolfchatter_session=" + randomBytes(32).toString("base64url")), 401);
    assert.equal(await refused("wolfchatter_session=" + tokens[0], "https://unrelated.example"), 403);
    const saved = sessions[1].expiresAt;
    sessions[1].expiresAt = new Date(0);
    assert.equal(await refused("wolfchatter_session=" + tokens[1]), 401);
    sessions[1].expiresAt = saved;
  });
  const a = await connect(0), b = await connect(1);
  await t.test("broadcasts new pins to both connected visitors", async () => {
    const room = { id: rooms[0].toHexString(), title: "Test room" };
    live.publish({ type: "room.created", room });
    assert.equal((await a.wait(e => e.type === "room.created")).room.id, room.id);
    assert.equal((await b.wait(e => e.type === "room.created")).room.id, room.id);
  });
  await t.test("delivers messages to room subscribers and isolates other rooms", async () => {
    await subscribe(a, rooms[0]); await subscribe(b, rooms[0]);
    live.publish({ type: "message.created", message: { id: "first", roomId: rooms[0].toHexString() } });
    await a.wait(e => e.message?.id === "first"); await b.wait(e => e.message?.id === "first");
    await subscribe(b, rooms[1]);
    live.publish({ type: "message.created", message: { id: "second", roomId: rooms[0].toHexString() } });
    await a.wait(e => e.message?.id === "second"); await sleep(80);
    assert.equal(b.queue.some(e => e.message?.id === "second"), false);
  });
  await t.test("acknowledges unsubscribe and rejects invalid and missing rooms", async () => {
    const requestId = randomUUID();
    b.ws.send(JSON.stringify({ type: "unsubscribe", requestId }));
    await b.wait(e => e.type === "unsubscribed" && e.requestId === requestId);
    live.publish({ type: "message.created", message: { id: "third", roomId: rooms[1].toHexString() } });
    await sleep(80); assert.equal(b.queue.some(e => e.message?.id === "third"), false);
    b.ws.send("not-json"); await b.wait(e => e.type === "error");
    const missing = randomUUID();
    b.ws.send(JSON.stringify({ type: "subscribe", requestId: missing, roomId: new ObjectId().toHexString() }));
    await b.wait(e => e.type === "error" && e.requestId === missing);
  });
  await t.test("a slow previous subscription cannot override the latest selection", async () => {
    const old = randomUUID(), latest = randomUUID();
    b.ws.send(JSON.stringify({ type: "subscribe", roomId: rooms[0].toHexString(), requestId: old }));
    b.ws.send(JSON.stringify({ type: "subscribe", roomId: rooms[1].toHexString(), requestId: latest }));
    await b.wait(e => e.type === "subscribed" && e.requestId === latest);
    await sleep(100);
    assert.equal(b.queue.some(e => e.requestId === old), false);
  });
  await t.test("one socket subscribes to multiple rooms and closing a room removes its delivery", async () => {
    const requestId = randomUUID();
    a.ws.send(JSON.stringify({ type: "subscribe.rooms", roomIds: rooms.map(room => room.toHexString()), requestId }));
    const ack = await a.wait(event => event.type === "rooms.subscribed" && event.requestId === requestId);
    assert.equal(ack.roomIds.length, rooms.length);
    for (const [index, room] of rooms.entries()) {
      live.publish({ type: "message.created", message: { id: "multi-" + index, roomId: room.toHexString() } });
      await a.wait(event => event.message?.id === "multi-" + index);
    }
    const close = randomUUID();
    a.ws.send(JSON.stringify({ type: "subscribe.rooms", roomIds: [rooms[0].toHexString()], requestId: close }));
    await a.wait(event => event.type === "rooms.subscribed" && event.requestId === close);
    live.publish({ type: "message.created", message: { id: "closed-room", roomId: rooms[1].toHexString() } });
    await sleep(80); assert.equal(a.queue.some(event => event.message?.id === "closed-room"), false);
    const empty = randomUUID();
    a.ws.send(JSON.stringify({ type: "subscribe.rooms", roomIds: [], requestId: empty }));
    await a.wait(event => event.type === "rooms.subscribed" && event.requestId === empty);
    live.publish({ type: "message.created", message: { id: "all-closed", roomId: rooms[0].toHexString() } });
    await sleep(80); assert.equal(a.queue.some(event => event.message?.id === "all-closed"), false);
  });
  await t.test("deletion invalidates a pending subscription and suppresses late messages", async () => {
    const requestId = randomUUID(), roomId = rooms[0].toHexString();
    a.ws.send(JSON.stringify({ type: "subscribe", roomId, requestId }));
    await sleep(10);
    live.publish({ type: "room.deleted", roomId });
    await a.wait(event => event.type === "room.deleted" && event.roomId === roomId);
    await b.wait(event => event.type === "room.deleted" && event.roomId === roomId);
    await a.wait(event => event.type === "error" && event.requestId === requestId);
    live.publish({ type: "message.created", message: { id: "after-deletion", roomId } });
    await sleep(80);
    assert.equal(a.queue.some(event => event.message?.id === "after-deletion"), false);
  });
  await t.test("an established connection closes when its session expires", async () => {
    const closed = once(b.ws, "close");
    sessions[1].expiresAt = new Date(0);
    const [code] = await closed;
    assert.equal(code, 4401);
  });
  await t.test("shutdown closes connected clients cleanly", async () => {
    const closed = once(a.ws, "close");
    await live.close();
    assert.equal((await closed)[0], 1001);
  });
});

test("WebSocket handshakes respect revocation and shutdown during database work", async t => {
  for (const action of ["revoke", "shutdown"]) {
    await t.test(action + " rejects a pending handshake", { timeout: 5000 }, async context => {
      const userId = new ObjectId(), token = randomBytes(32).toString("base64url");
      const hash = createHash("sha256").update(token).digest("hex");
      let active = true, started, release;
      const lookupStarted = new Promise(resolve => { started = resolve; });
      const recentRooms = new Promise(resolve => { release = resolve; });
      const database = {
        sessions: { findOne: async () => active ? {
          _id: hash, userId, authenticated: true, expiresAt: new Date(Date.now() + 60_000),
        } : null },
        users: { findOne: async () => ({
          _id: userId, username: "Visitor", passwordHash: "fixture", lastRoomId: null, createdAt: new Date(),
        }) },
        messages: { aggregate: () => ({ toArray: () => { started(); return recentRooms; } }) },
      };
      const server = createServer((_request, response) => response.end());
      const live = attachWebSocket(server, database);
      let socket;
      context.after(async () => {
        release([]); socket?.terminate(); await live.close();
        await new Promise(resolve => server.close(resolve));
      });
      server.listen(0, "127.0.0.1"); await once(server, "listening");
      const response = new Promise((resolve, reject) => {
        socket = new WebSocket("ws://127.0.0.1:" + server.address().port + "/ws", {
          headers: { Cookie: "wolfchatter_session=" + token, Origin: "http://localhost:3000" },
        });
        socket.on("error", reject);
        socket.once("open", () => resolve(101));
        socket.once("unexpected-response", (_request, reply) => { reply.resume(); resolve(reply.statusCode); socket.close(); });
      });
      await Promise.race([lookupStarted, response.then(status => {
        throw new Error("Handshake finished before the controlled lookup: " + status);
      })]);
      if (action === "revoke") {
        active = false;
        live.revokeSession(hash);
        release([]);
        assert.equal(await response, 401, "a revoked session must not complete its upgrade");
      } else {
        const shutdown = live.close();
        const status = await Promise.race([response, sleep(300).then(() => null)]);
        release([]);
        await shutdown;
        assert.equal(status, 503, "shutdown must reject pending upgrades without waiting for the database");
      }
    });
  }
});

