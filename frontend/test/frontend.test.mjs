import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import { createServer } from "vite";
import { createPinia, setActivePinia } from "pinia";

test("Frontend API and WebSocket state", async t => {
  const vite = await createServer({ server: { middlewareMode: true, hmr: false } });
  t.after(() => vite.close());
  const { useChat } = await vite.ssrLoadModule("/src/stores/chat.ts");
  const original = {
    window: globalThis.window, document: globalThis.document, location: globalThis.location,
    WebSocket: globalThis.WebSocket, fetch: globalThis.fetch,
  };
  globalThis.window = { setTimeout, clearTimeout };
  globalThis.document = { hidden: false };
  globalThis.location = new URL("http://localhost:5173/");
  let chat;
  t.after(() => { chat?.stop(); Object.assign(globalThis, original); });
  const room1 = { id: "100000000000000000000001", title: "Chatroom 1", createdBy: null,
    location: { type: "Point", coordinates: [15, 48] }, createdAt: "2026-10-29T10:00:00.000Z" };
  const room2 = { ...room1, id: "100000000000000000000002", title: "Chatroom 2" };
  const profile = { id: "200000000000000000000001", username: "Tester", lastRoomId: null,
    createdAt: room1.createdAt };
  const records = [], posts = [], calls = [];
  let failAfterSave = false, nextNumber = 0;

  function makeMessage(roomId, text, clientMessageId = crypto.randomUUID()) {
    const number = ++nextNumber;
    return { id: number.toString(16).padStart(24, "0"), roomId, userId: profile.id,
      clientMessageId, username: profile.username, text,
      createdAt: new Date(Date.UTC(2026, 9, 29, 10, 0, number)).toISOString() };
  }
  const sockets = [];
  class Socket {
    static OPEN = 1;
    readyState = 0; roomIds = []; acknowledged = false;

    constructor() {
      sockets.push(this);
      setTimeout(() => {
        if (this.readyState !== 0) return;
        this.readyState = 1; this.receive({ type: "ready", userId: profile.id });
      }, 0);
    }

    receive(event) { this.onmessage?.({ data: JSON.stringify(event) }); }

    send(raw) {
      const command = JSON.parse(raw);
      this.roomIds = command.roomIds ?? (command.roomId ? [command.roomId] : []); this.acknowledged = false;
      setTimeout(() => {
        if (this.readyState !== 1) return;
        this.acknowledged = true;
        this.receive(command.type === "subscribe.rooms"
          ? { type: "rooms.subscribed", roomIds: command.roomIds, requestId: command.requestId }
          : command.type === "subscribe"
          ? { type: "subscribed", roomId: command.roomId, requestId: command.requestId }
          : { type: "unsubscribed", requestId: command.requestId });
      }, 0);
    }

    close(code = 1006) {
      if (this.readyState === 3) return;
      this.readyState = 3; this.onclose?.({ code });
    }
  }
  globalThis.WebSocket = Socket;

  function publish(message) {
    for (const socket of sockets) if (socket.readyState === 1 && socket.roomIds.includes(message.roomId))
      socket.receive({ type: "message.created", message });
  }

  const response = (value, status = 200) => new Response(JSON.stringify(value), {
    status, headers: { "Content-Type": "application/json" },
  });
  globalThis.fetch = async (path, options = {}) => {
    const url = new URL(path, globalThis.location), method = options.method ?? "GET";
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ path: url.pathname, method });
    if (url.pathname === "/api/me") {
      if (method === "PATCH") Object.assign(profile, body);
      return response({ user: { ...profile } });
    }
    if (url.pathname === "/api/rooms") return response({ rooms: [room1, room2], truncated: false });
    const room = [room1, room2].find(item => url.pathname === "/api/rooms/" + item.id);
    if (room) return method === "DELETE" ? response({ roomId: room.id }) : response({ room });
    const parts = url.pathname.split("/");
    assert.ok(parts.length === 5 && parts[2] === "rooms" && parts[4] === "messages", "Unexpected API request " + url);
    const roomId = parts[3];
    if (method === "POST") {
      posts.push(body);
      let saved = records.find(message => message.roomId === roomId && message.clientMessageId === body.clientMessageId);
      if (!saved) { saved = makeMessage(roomId, body.text, body.clientMessageId); records.push(saved); publish(saved); }
      if (failAfterSave) { failAfterSave = false; return response({ error: "Simulated response failure" }, 500); }
      return response({ message: saved });
    }
    let messages = records.filter(message => message.roomId === roomId);
    const after = url.searchParams.get("after"), before = url.searchParams.get("before");
    if (after) messages = messages.filter(message => message.id > after);
    if (before) messages = messages.filter(message => message.id < before);
    const limit = Number(url.searchParams.get("limit") || 50);
    const ordered = after ? messages : [...messages].reverse();
    const page = ordered.slice(0, limit);
    const nextCursor = ordered.length > limit ? page.at(-1).id : null;
    if (!after) page.reverse();
    return response({ messages: page, nextCursor, latestCursor: page.at(-1)?.id ?? null,
      direction: after ? "newer" : "older" });
  };

  async function until(predicate) {
    const deadline = Date.now() + 4000;
    while (!predicate()) {
      if (Date.now() > deadline) throw new Error("Timed out");
      await sleep(10);
    }
  }
  setActivePinia(createPinia());
  chat = useChat();
  await chat.start(); await until(() => chat.connection === "online");
  await chat.selectRoom(room1); await until(() => chat.currentHistory?.loaded);
  await t.test("loads the profile and room history from the API", async () => {
    assert.equal(chat.user.username, "Tester");
    assert.equal(chat.selectedRoomId, room1.id);
    assert.equal(profile.lastRoomId, room1.id);
    assert.equal(chat.currentHistory.items.length, 0);
  });
  await t.test("merges a saved HTTP response and its WebSocket echo once", async () => {
    assert.equal(await chat.send(room1.id, "Tester", "First message"), true);
    assert.equal(chat.currentHistory.items.length, 1);
    assert.equal(chat.currentHistory.items[0].text, "First message");
  });
  await t.test("retries an uncertain write with the original request ID", async () => {
    failAfterSave = true;
    assert.equal(await chat.send(room1.id, "Tester", "Retry safely"), false);
    assert.equal(await chat.send(room1.id, "Tester", "Retry safely"), true);
    assert.equal(posts.at(-1).clientMessageId, posts.at(-2).clientMessageId);
    assert.equal(chat.currentHistory.items.filter(message => message.text === "Retry safely").length, 1);
  });
  await t.test("rapid room changes persist the final selection and isolate history", async () => {
    await Promise.all([chat.selectRoom(room1), chat.selectRoom(room2)]);
    await until(() => chat.currentHistory?.loaded);
    assert.equal(chat.selectedRoomId, room2.id); assert.equal(profile.lastRoomId, room2.id);
    publish(makeMessage(room1.id, "Wrong room"));
    assert.equal(chat.currentHistory.items.some(message => message.text === "Wrong room"), false);
  });
  await t.test("open chats receive isolated live histories and minimized drafts survive", async () => {
    await until(() => sockets.at(-1).acknowledged && sockets.at(-1).roomIds.length === 2);
    assert.equal(chat.windows.length, 2);
    chat.drafts[room1.id] = "Unsent room-one draft";
    chat.minimizeRoom(room1.id);
    publish(makeMessage(room1.id, "Message while minimized"));
    publish(makeMessage(room2.id, "Message in second window"));
    assert.ok(chat.history(room1.id).items.some(message => message.text === "Message while minimized"));
    assert.equal(chat.history(room2.id).items.some(message => message.text === "Message while minimized"), false);
    await chat.selectRoom(room1);
    assert.equal(chat.windows.find(entry => entry.id === room1.id).minimized, false);
    assert.equal(chat.drafts[room1.id], "Unsent room-one draft");
    assert.equal(chat.windows.length, 2);
  });
  await t.test("closing a chat unsubscribes it and reopening reloads missed history", async () => {
    chat.closeRoom(room2.id);
    await until(() => sockets.at(-1).acknowledged && sockets.at(-1).roomIds.length === 1);
    const missed = makeMessage(room2.id, "Saved while closed"); records.push(missed); publish(missed);
    assert.equal(chat.history(room2.id).items.some(message => message.id === missed.id), false);
    await chat.selectRoom(room2);
    await until(() => chat.history(room2.id).items.some(message => message.id === missed.id));
    assert.equal(chat.windows.length, 2);
  });
  await t.test("reconnection catches up across multiple pages without duplicates", async () => {
    await chat.selectRoom(room1); await until(() => !chat.currentHistory.loading);
    const socket = sockets.at(-1); socket.close();
    const background = makeMessage(room2.id, "Background reconnect recovery"); records.push(background);
    for (let n = 0; n < 105; n++) records.push(makeMessage(room1.id, "Missed " + n));
    await until(() => chat.connection === "online" && sockets.at(-1).acknowledged && !chat.currentHistory.loading &&
      chat.currentHistory.items.some(message => message.text === "Missed 104") &&
      chat.history(room2.id).items.some(message => message.id === background.id));
    assert.equal(chat.currentHistory.items.filter(message => message.text.startsWith("Missed ")).length, 105);
    assert.equal(new Set(chat.currentHistory.items.map(message => message.id)).size, chat.currentHistory.items.length);
  });
  await t.test("there is no periodic HTTP polling", async () => {
    await until(() => !chat.currentHistory.loading);
    const before = calls.length; await sleep(1200);
    assert.equal(calls.length, before, JSON.stringify(calls.slice(before)));
  });
  await t.test("closing all windows clears subscriptions without losing saved history or drafts", async () => {
    chat.closeRoom(room1.id); chat.closeRoom(room2.id);
    await until(() => sockets.at(-1).acknowledged && sockets.at(-1).roomIds.length === 0 && profile.lastRoomId === null);
    assert.equal(chat.windows.length, 0);
    assert.equal(chat.selectedRoomId, null);
    assert.equal(chat.drafts[room1.id], "Unsent room-one draft");
    assert.ok(chat.history(room1.id).items.length > 100);
    await chat.selectRoom(room1); await chat.selectRoom(room1);
    assert.equal(chat.windows.length, 1);
  });
  await t.test("room deletion clears minimized windows/drafts and ignores stale room updates", async () => {
    await chat.selectRoom(room2);
    chat.drafts[room2.id] = "Deleted draft";
    chat.minimizeRoom(room2.id);
    sockets.at(-1).receive({ type: "room.deleted", roomId: room2.id });
    await until(() => sockets.at(-1).acknowledged && !sockets.at(-1).roomIds.includes(room2.id));
    assert.equal(chat.windows.some(entry => entry.id === room2.id), false);
    assert.equal(chat.rooms.some(room => room.id === room2.id), false);
    assert.equal(chat.drafts[room2.id], undefined);
    sockets.at(-1).receive({ type: "room.updated", room: room2 });
    await chat.refresh(); // The fake response deliberately still contains the deleted room.
    assert.equal(chat.rooms.some(room => room.id === room2.id), false);
    await chat.selectRoom(room2);
    assert.equal(chat.windows.some(entry => entry.id === room2.id), false);
    assert.ok(chat.windows.some(entry => entry.id === room1.id));
    await chat.deleteRoom(room1.id);
    await until(() => sockets.at(-1).acknowledged && sockets.at(-1).roomIds.length === 0 && profile.lastRoomId === null);
    assert.equal(chat.rooms.some(room => room.id === room1.id), false);
    assert.equal(chat.windows.length, 0);
    assert.equal(chat.drafts[room1.id], undefined);
    assert.ok(calls.some(call => call.method === "DELETE"));
  });
  await t.test("session expiration stops live delivery and requires explicit recovery", async () => {
    sockets.at(-1).close(4401);
    assert.equal(chat.ready, false); assert.equal(chat.connection, "offline");
    assert.match(chat.error, /expired/);
  });
});
