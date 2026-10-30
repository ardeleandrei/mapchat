import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { setTimeout as sleep } from "node:timers/promises";
import { WebSocket } from "ws";

const base = (process.env.TEST_API_URL || "http://localhost:3000").replace(/\/$/, "");

function visitor() {
  let cookie = "";
  return {
    get cookie() { return cookie; },

    async request(path, method = "GET", body, status = 200) {
      const response = await fetch(base + "/api" + path, {
        method, headers: { ...(cookie ? { Cookie: cookie } : {}),
          ...(method === "GET" ? {} : { "X-Wolfchatter-Request": "1" }),
          ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(10_000),
      });
      const setCookie = response.headers.getSetCookie()[0];
      if (setCookie) cookie = setCookie.split(";")[0];
      const result = await response.json();
      assert.equal(response.status, status, JSON.stringify(result));
      return result;
    },
  };
}
const sockets = [];

async function connect(client) {
  const url = new URL("/ws", base); url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(url, { headers: { Cookie: client.cookie, Origin: new URL(base).origin } });
  sockets.push(socket);
  const queue = [];
  socket.on("message", raw => queue.push(JSON.parse(raw.toString())));
  await once(socket, "open");

  async function wait(predicate) {
    const until = Date.now() + 5000;
    while (Date.now() < until) {
      const index = queue.findIndex(predicate);
      if (index >= 0) return queue.splice(index, 1)[0];
      await sleep(15);
    }
    throw new Error("Expected live event did not arrive: " + JSON.stringify(queue));
  }
  await wait(event => event.type === "ready");
  return {
    socket, queue, wait,

    async subscribe(roomId) {
      const requestId = randomUUID();
      socket.send(JSON.stringify({ type: "subscribe", roomId, requestId }));
      await wait(event => event.type === "subscribed" && event.requestId === requestId);
    },
  };
}
try {
  const a = visitor(), b = visitor();
  const first = await a.request("/me"), second = await b.request("/me");
  assert.notEqual(first.user.id, second.user.id);
  const nameA = "Check A " + randomUUID().slice(0, 16), nameB = "Check B " + randomUUID().slice(0, 16);
  const password = "Integration passphrase " + randomUUID();
  const guestCookie = a.cookie;
  await a.request("/rooms", "POST", {}, 403);
  await a.request("/auth/register", "POST", { username: nameA, password }, 201);
  await b.request("/auth/register", "POST", { username: nameB, password }, 201);
  assert.notEqual(a.cookie, guestCookie);
  assert.equal((await a.request("/me")).user.id, first.user.id);
  await b.request("/me", "PATCH", { username: "  " + nameA.toUpperCase() + "  " }, 409);
  await b.request("/me", "PATCH", { username: nameA.replaceAll(" ", "   ") }, 409);
  await b.request("/me", "PATCH", { username: nameA.replace(/C/g, "Ｃ") }, 409);
  await b.request("/me", "PATCH", { username: nameA + "\u200b" }, 400);
  assert.equal((await b.request("/me")).user.username, nameB);
  assert.equal((await a.request("/me", "PATCH", { username: nameA })).user.username, nameA);
  const c = visitor(), d = visitor();
  await c.request("/me"); await d.request("/me");
  const raceName = "Race " + randomUUID().slice(0, 16);
  const claimResults = await Promise.all([c, d].map(async client => {
    const response = await fetch(base + "/api/auth/register", { method: "POST", headers: {
      Cookie: client.cookie, "Content-Type": "application/json", "X-Wolfchatter-Request": "1",
    }, body: JSON.stringify({ username: raceName, password }) });
    return response.status;
  }));
  assert.deepEqual(claimResults.sort(), [201, 409]);
  console.log("PASS: unique usernames, canonical comparisons, owner reuse and concurrent claims.");
  const liveA = await connect(a), liveB = await connect(b);
  const roomBody = { longitude: 26.1025, latitude: 44.4268, creationKey: randomUUID(), title: "Named integration room" };
  const { room } = await a.request("/rooms", "POST", roomBody, 201);
  assert.equal(room.createdBy, first.user.id);
  await liveA.wait(event => event.type === "room.created" && event.room.id === room.id);
  await liveB.wait(event => event.type === "room.created" && event.room.id === room.id);
  assert.equal((await a.request("/rooms", "POST", roomBody)).room.id, room.id);
  assert.equal(room.title, roomBody.title);
  await a.request("/rooms", "POST", { ...roomBody, creationKey: randomUUID(), title: " " }, 400);
  await a.request("/rooms/" + room.id, "PATCH", { title: " ", revision: 0 }, 400);
  await a.request("/rooms/" + room.id, "PATCH", { color: "red", revision: 0 }, 400);
  await a.request("/rooms/" + room.id, "PATCH", { revision: 0 }, 400);
  await b.request("/rooms/" + room.id, "PATCH", { title: "Not my room", revision: 0 }, 403);
  const edited = { title: "Renamed integration room", color: "#8f76b5", revision: 0 };
  const updated = (await a.request("/rooms/" + room.id, "PATCH", edited)).room;
  assert.equal(updated.title, edited.title); assert.equal(updated.color, edited.color);
  assert.equal(updated.revision, 1);
  for (const live of [liveA, liveB]) {
    const event = await live.wait(event => event.type === "room.updated" && event.room.id === room.id);
    assert.equal(event.room.title, edited.title); assert.equal(event.room.color, edited.color);
  }
  assert.equal((await b.request("/rooms/" + room.id)).room.title, edited.title);
  await a.request("/rooms/" + room.id, "PATCH", edited, 409);
  assert.equal((await a.request("/rooms", "POST", roomBody)).room.title, edited.title);
  await a.request("/rooms", "POST", { ...roomBody, title: "Different submission" }, 409);
  await liveA.subscribe(room.id); await liveB.subscribe(room.id);
  const body = { text: "Live backend integration check", clientMessageId: randomUUID() };
  const { message } = await a.request("/rooms/" + room.id + "/messages", "POST", body, 201);
  assert.equal(message.userId, first.user.id);
  await liveA.wait(event => event.type === "message.created" && event.message.id === message.id);
  await liveB.wait(event => event.type === "message.created" && event.message.id === message.id);
  assert.equal((await a.request("/rooms/" + room.id + "/messages", "POST", body)).message.id, message.id);
  const history = await b.request("/rooms/" + room.id + "/messages");
  assert.equal(history.messages.filter(item => item.id === message.id).length, 1);
  assert.equal((await b.request("/me/messages")).messages.some(item => item.id === message.id), false);
  await a.request("/rooms/" + room.id + "/messages", "POST",
    { ...body, clientMessageId: randomUUID(), userId: second.user.id }, 400);
  const { room: other } = await b.request("/rooms", "POST",
    { ...roomBody, creationKey: randomUUID(), longitude: 20 }, 201);
  await liveB.subscribe(other.id);
  const next = await a.request("/rooms/" + room.id + "/messages", "POST",
    { text: "Room isolation check", clientMessageId: randomUUID() }, 201);
  await liveA.wait(event => event.message?.id === next.message.id);
  await sleep(200);
  assert.equal(liveB.queue.some(event => event.message?.id === next.message.id), false);
  await a.request("/me", "PATCH", { lastRoomId: room.id });
  const restored = await a.request("/me");
  assert.equal(restored.user.id, first.user.id);
  assert.equal(restored.user.username, nameA);
  assert.equal(restored.user.lastRoomId, room.id);
  const multiple = randomUUID();
  liveB.socket.send(JSON.stringify({ type: "subscribe.rooms", roomIds: [room.id, other.id], requestId: multiple }));
  await liveB.wait(event => event.type === "rooms.subscribed" && event.requestId === multiple);
  const multiFirst = (await a.request("/rooms/" + room.id + "/messages", "POST",
    { text: "Multiple windows: first room", clientMessageId: randomUUID() }, 201)).message;
  const multiSecond = (await b.request("/rooms/" + other.id + "/messages", "POST",
    { text: "Multiple windows: second room", clientMessageId: randomUUID() }, 201)).message;
  assert.equal((await liveB.wait(event => event.message?.id === multiFirst.id)).message.roomId, room.id);
  assert.equal((await liveB.wait(event => event.message?.id === multiSecond.id)).message.roomId, other.id);
  const reduced = randomUUID();
  liveB.socket.send(JSON.stringify({ type: "subscribe.rooms", roomIds: [other.id], requestId: reduced }));
  await liveB.wait(event => event.type === "rooms.subscribed" && event.requestId === reduced);
  const afterClose = (await a.request("/rooms/" + room.id + "/messages", "POST",
    { text: "Saved after the first window closed", clientMessageId: randomUUID() }, 201)).message;
  await liveA.wait(event => event.message?.id === afterClose.id);
  await sleep(100); assert.equal(liveB.queue.some(event => event.message?.id === afterClose.id), false);
  await b.request("/rooms/" + room.id, "DELETE", undefined, 403);
  await visitor().request("/rooms/" + room.id, "DELETE", undefined, 401);
  await a.request("/rooms/invalid-id", "DELETE", undefined, 400);
  assert.equal((await a.request("/rooms/" + room.id, "DELETE")).roomId, room.id);
  for (const live of [liveA, liveB]) await live.wait(event => event.type === "room.deleted" && event.roomId === room.id);
  await b.request("/rooms/" + room.id, "GET", undefined, 404);
  await a.request("/rooms/" + room.id + "/messages", "GET", undefined, 404);
  await a.request("/rooms/" + room.id + "/messages", "POST", { text: "After deletion", clientMessageId: randomUUID() }, 404);
  await a.request("/rooms/" + room.id, "PATCH", { title: "Restore?", revision: 1 }, 404);
  assert.equal((await a.request("/me")).user.lastRoomId, null);
  assert.equal((await a.request("/me/messages")).messages.some(message => message.roomId === room.id), false);
  assert.equal((await b.request("/rooms")).rooms.some(item => item.id === room.id), false);
  assert.equal((await a.request("/rooms/nearby?longitude=26.1025&latitude=44.4268&radius=5000")).rooms.some(item => item.id === room.id), false);
  await a.request("/rooms/" + room.id, "DELETE"); // Owner retry remains safe.
  await b.request("/rooms/" + room.id, "DELETE", undefined, 403);
  await a.request("/rooms", "POST", roomBody, 410); // Original creation key cannot resurrect it.
  const deletedJoin = randomUUID();
  liveA.socket.send(JSON.stringify({ type: "subscribe", roomId: room.id, requestId: deletedJoin }));
  await liveA.wait(event => event.type === "error" && event.requestId === deletedJoin);
  assert.equal((await b.request("/rooms/" + other.id)).room.id, other.id);
  const recovered = visitor();
  await recovered.request("/auth/login", "POST", { username: nameB.toUpperCase(), password: "incorrect" }, 401);
  const login = await recovered.request("/auth/login", "POST", { username: nameB.toUpperCase(), password });
  assert.equal(login.user.id, second.user.id);
  assert.equal(login.user.registered, true);
  assert.equal(login.user.passwordHash, undefined);
  await recovered.request("/rooms/" + other.id, "PATCH", { title: "Owned after cross-browser login", revision: 0 });
  await b.request("/me", "PATCH", { lastRoomId: other.id });
  const closed = once(liveB.socket, "close"), revokedCookie = b.cookie;
  await b.request("/auth/logout", "POST", {});
  assert.equal((await closed)[0], 4401);
  const revoked = await fetch(base + "/api/rooms", { headers: { Cookie: revokedCookie } });
  assert.equal(revoked.status, 401);
  assert.equal((await b.request("/me")).user.registered, false);
  await b.request("/auth/login", "POST", { username: nameB, password });
  const signedBackIn = await b.request("/me");
  assert.equal(signedBackIn.user.id, second.user.id);
  assert.equal(signedBackIn.user.lastRoomId, other.id);
  assert.equal((await recovered.request("/me")).user.id, second.user.id, "logging out one browser preserves the other session");
  console.log("PASS: password registration, cross-browser sign-in/ownership, logout revocation and account restoration.");
  console.log("PASS: creator-only deletion, live removal, message cleanup, cleared profile, hidden pins/nearby results and safe retries.");
  console.log("PASS: two visitors, session ownership, live pins/messages, room isolation, retries, history and profile restoration.");
  console.log("PASS: custom room names, persistent title/color edits, creator ownership, validation, stale-edit conflicts and live room updates.");
  console.log("PASS: live saved messages reach multiple room subscriptions, and closed rooms stop live delivery.");
  console.log("Created diagnostic rooms " + room.id + " and " + other.id + ". No existing records were changed.");
} finally {
  for (const socket of sockets) socket.terminate();
}

