import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import express from "express";
import { ObjectId } from "mongodb";
import { WebSocket } from "ws";
import { connectDatabase } from "../dist/db.js";
import { configureApp } from "../dist/app.js";
import { attachWebSocket } from "../dist/websocket.js";

// A dedicated disposable database keeps this test away from the app's records.
const databaseName = "wolfchatter_unread_test_" + randomUUID().replaceAll("-", "");
const database = await connectDatabase((process.env.TEST_MONGODB_BASE || "mongodb://127.0.0.1:27018") + "/" + databaseName);
const app = express(), server = createServer(app), live = attachWebSocket(server, database);
configureApp(app, database, live.publish, live.revokeSession);
server.listen(0, "127.0.0.1"); await once(server, "listening");
const base = "http://127.0.0.1:" + server.address().port;
const sockets = [];

async function visitor(userId = new ObjectId()) {
  const token = randomBytes(32).toString("base64url");
  await database.users.updateOne({ _id: userId }, { $setOnInsert: {
    username: "Visitor " + userId, usernameKey: "visitor " + userId.toHexString(), passwordHash: "test fixture",
    lastRoomId: null, createdAt: new Date(),
  } }, { upsert: true });
  await database.sessions.insertOne({ _id: createHash("sha256").update(token).digest("hex"), userId,
    authenticated: true, createdAt: new Date(), expiresAt: new Date(Date.now() + 60_000) });
  const cookie = "wolfchatter_session=" + token;
  return { userId, cookie,
    async request(path, method = "GET", body, status = 200) {
      const response = await fetch(base + "/api" + path, { method,
        headers: { Cookie: cookie, "X-Wolfchatter-Request": "1", "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(5000),
      });
      const value = await response.json();
      assert.equal(response.status, status, JSON.stringify(value));
      return value;
    },
  };
}

async function socketFor(client) {
  const socket = new WebSocket(base.replace("http", "ws") + "/ws", { headers: { Cookie: client.cookie } });
  sockets.push(socket);
  const events = [];
  socket.on("message", raw => events.push(JSON.parse(raw.toString())));
  await once(socket, "open");
  return { socket, events,
    async wait(predicate) {
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline) {
        const event = events.find(predicate);
        if (event) return event;
        await sleep(10);
      }
      throw new Error("Expected event not received");
    },
  };
}

try {
  const owner = await visitor(), sender = await visitor(), unrelated = await visitor();
  const rooms = Array.from({ length: 25 }, (_, index) => ({ _id: new ObjectId(), title: "Owned " + index,
    createdBy: owner.userId, revision: 0, creationKey: randomUUID(),
    location: { type: "Point", coordinates: [150, -30] }, createdAt: new Date() }));
  await database.rooms.insertMany(rooms);
  const first = rooms[0]._id.toHexString(), second = rooms[1]._id.toHexString();
  const date = new Date("2026-10-29T12:00:00Z");
  const messages = Array.from({ length: 108 }, (_, index) => ({
    _id: new ObjectId((index + 1).toString(16).padStart(24, "0")), roomId: rooms[0]._id,
    userId: index < 105 ? sender.userId : owner.userId,
    username: "Fixture", text: "Message " + index, clientMessageId: randomUUID(), createdAt: date,
  }));
  await database.messages.insertMany(messages);
  await database.messages.insertMany([0, 1].map(index => ({ ...messages[index], _id: new ObjectId(), roomId: rooms[1]._id, clientMessageId: randomUUID() })));
  const count = async (client, roomId) => (await client.request("/me/unread?roomIds=" + roomId)).rooms[0].unreadCount;

  const page = await owner.request("/me/rooms?limit=2");
  assert.equal(page.rooms.length, 2); assert.ok(page.nextCursor);
  assert.equal((await owner.request("/me/rooms?after=" + page.nextCursor)).rooms.length, 23);
  assert.equal((await unrelated.request("/me/rooms")).rooms.length, 0);
  assert.equal((await owner.request("/me/rooms/recent")).rooms[0].room.id, first);
  assert.equal((await unrelated.request("/me/rooms/recent")).rooms.length, 0);
  await owner.request("/me/rooms/recent?limit=0", "GET", undefined, 400);
  assert.deepEqual((await owner.request("/me/unread?roomIds=" + first + "," + second)).rooms.map(row => row.unreadCount), [100, 2]);
  assert.equal(await count(sender, first), 3, "own messages are excluded");

  await owner.request("/rooms/" + first + "/read", "POST", { messageId: messages[9]._id.toHexString() });
  assert.equal(await count(owner, first), 95);
  await owner.request("/rooms/" + first + "/read", "POST", { messageId: messages[4]._id.toHexString() });
  assert.equal(await count(owner, first), 95, "a stale browser cannot move the read marker backward");
  await Promise.all([19, 59].map(index => owner.request("/rooms/" + first + "/read", "POST", { messageId: messages[index]._id.toHexString() })));
  assert.equal(await count(owner, first), 45);
  const anotherSession = await visitor(owner.userId);
  assert.equal(await count(anotherSession, first), 45, "read positions persist across sessions");
  await owner.request("/rooms/" + second + "/read", "POST", { messageId: messages[0]._id.toHexString() }, 404);

  const ownerSocket = await socketFor(owner), otherSocket = await socketFor(unrelated);
  const body = { text: "Live while owner has no window open", clientMessageId: randomUUID() };
  const saved = (await sender.request("/rooms/" + first + "/messages", "POST", body, 201)).message;
  await ownerSocket.wait(event => event.type === "message.created" && event.message.id === saved.id);
  assert.equal(await count(owner, first), 46);
  assert.equal((await sender.request("/rooms/" + first + "/messages", "POST", body)).message.id, saved.id);
  assert.equal(await count(owner, first), 46, "retried messages do not double-count");
  await owner.request("/rooms/" + first + "/read", "POST", { messageId: saved.id });
  await ownerSocket.wait(event => event.type === "room.read" && event.roomId === first);
  assert.equal(await count(owner, first), 0);
  await sleep(50);
  assert.equal(otherSocket.events.some(event => event.type === "room.read" || event.type === "message.created"), false);
  const otherRoom = (await sender.request("/rooms", "POST", {
    longitude: 100, latitude: 30, creationKey: randomUUID(), title: "Someone else's room",
  }, 201)).room;
  const ownPost = (await owner.request("/rooms/" + otherRoom.id + "/messages", "POST", {
    text: "My recent chat in another user's room", clientMessageId: randomUUID(),
  }, 201)).message;
  await ownerSocket.wait(event => event.message?.id === ownPost.id);
  const recent = (await owner.request("/me/rooms/recent")).rooms;
  assert.deepEqual(recent.map(row => row.room.id), [otherRoom.id, first]);
  assert.equal(recent[0].room.createdBy, sender.userId.toHexString());
  const restoredSocket = await socketFor(anotherSession);
  const reply = (await sender.request("/rooms/" + otherRoom.id + "/messages", "POST", {
    text: "Reply while the recent chat has no open window", clientMessageId: randomUUID(),
  }, 201)).message;
  await ownerSocket.wait(event => event.message?.id === reply.id);
  await restoredSocket.wait(event => event.message?.id === reply.id);
  assert.equal(await count(owner, otherRoom.id), 1);
  await unrelated.request("/rooms/" + first + "/read", "POST", { messageId: saved.id });
  await owner.request("/rooms/" + first, "DELETE");
  assert.equal(await database.roomReads.countDocuments({ roomId: rooms[0]._id }), 0);
  assert.equal((await owner.request("/me/rooms")).rooms.length, 24);
  assert.equal((await owner.request("/me/rooms/recent")).rooms.some(row => row.room.id === first), false);
  console.log("PASS: owned-room pagination, per-chat unread counts, 99+ cap, own-message exclusion, monotonic reads, session persistence, creator live delivery, private read events, retry safety and deletion cleanup.");
  console.log("PASS: recent chats include owned/other rooms, follow the user's message order, exclude deleted rooms, and receive live replies across sessions without open windows.");

  // Pause a read write after service validation, then finish deletion first.
  const secondMessage = await database.messages.findOne({ roomId: rooms[1]._id });
  const updateRead = database.roomReads.updateOne.bind(database.roomReads);
  let pauseRead, finishRead;
  const readPaused = new Promise(resolve => { pauseRead = resolve; });
  const readGate = new Promise(resolve => { finishRead = resolve; });
  database.roomReads.updateOne = async (filter, ...args) => {
    if (filter.roomId.equals(rooms[1]._id) && filter.userId.equals(owner.userId)) {
      pauseRead(); await readGate;
    }
    return updateRead(filter, ...args);
  };
  try {
    const reading = owner.request("/rooms/" + second + "/read", "POST", { messageId: secondMessage._id.toHexString() }, 404);
    await Promise.race([readPaused, reading.then(() => { throw new Error("Read was not paused before persistence"); })]);
    await owner.request("/rooms/" + second, "DELETE");
    finishRead();
    await reading;
    assert.equal(await database.roomReads.countDocuments({ roomId: rooms[1]._id }), 0,
      "a read request must not recreate markers after room deletion");
    console.log("PASS: a read racing with room deletion returns 404 and leaves no read markers.");
  } finally {
    finishRead();
    database.roomReads.updateOne = updateRead;
  }
} finally {
  for (const socket of sockets) socket.terminate();
  await live.close(); await new Promise(resolve => server.close(resolve));
  assert.equal(database.db.databaseName, databaseName);
  assert.match(databaseName, /^wolfchatter_unread_test_[a-f0-9]{32}$/);
  await database.db.dropDatabase();
  await database.client.close();
}
