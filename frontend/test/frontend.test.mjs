import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import { createServer } from "vite";
import { createPinia, setActivePinia } from "pinia";
import { createSSRApp } from "vue";
import { renderToString } from "vue/server-renderer";

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
    createdAt: room1.createdAt, registered: true };
  const records = [], posts = [], calls = [];
  const accounts = new Map();
  const ownedRooms = [], readMarkers = new Map();
  let failAfterSave = false, failBootstrap = false, nextNumber = 0;

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
    for (const socket of sockets) if (socket.readyState === 1 && (socket.roomIds.includes(message.roomId) || ownedRooms.some(room => room.id === message.roomId && room.createdBy === profile.id)))
      socket.receive({ type: "message.created", message });
  }

  const response = (value, status = 200) => new Response(JSON.stringify(value), {
    status, headers: { "Content-Type": "application/json" },
  });
  globalThis.fetch = async (path, options = {}) => {
    const url = new URL(path, globalThis.location), method = options.method ?? "GET";
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ path: url.pathname, method });
    if (url.pathname === "/api/me/rooms/recent") {
      const byRoom = new Map();
      for (const message of records.filter(item => item.userId === profile.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))) {
        const room = [room1, room2, ...ownedRooms].find(item => item.id === message.roomId);
        if (room && !byRoom.has(room.id)) byRoom.set(room.id, { room, lastMessageAt: message.createdAt, lastMessageId: message.id });
      }
      return response({ rooms: [...byRoom.values()].slice(0, 20) });
    }
    if (url.pathname === "/api/me/rooms") return response({ rooms: ownedRooms.filter(room => room.createdBy === profile.id), nextCursor: null });
    if (url.pathname === "/api/me/unread") return response({ rooms: url.searchParams.get("roomIds").split(",").map(roomId => ({
      roomId, unreadCount: Math.min(100, records.filter(message => message.roomId === roomId && message.userId !== profile.id &&
        message.id > (readMarkers.get(profile.id + roomId) ?? "")).length),
    })) });
    if (/^\/api\/rooms\/[^/]+\/read$/.test(url.pathname)) {
      const roomId = url.pathname.split("/")[3], key = profile.id + roomId;
      if (body.messageId > (readMarkers.get(key) ?? "")) readMarkers.set(key, body.messageId);
      return response({ roomId });
    }
    if (url.pathname === "/api/auth/logout") {
      accounts.set(profile.username, { ...profile });
      Object.assign(profile, { id: "200000000000000000000002", username: "", registered: false, lastRoomId: null });
      return response({ ok: true });
    }
    if (url.pathname === "/api/auth/login") {
      const account = accounts.get(body.username);
      if (!account || body.password !== "correct test passphrase") return response({ error: "Invalid username or password." }, 401);
      Object.assign(profile, account);
      return response({ user: { ...profile } });
    }
    if (url.pathname === "/api/auth/register") {
      if (body.username === "Taken") return response({ error: "Username is already taken." }, 409);
      Object.assign(profile, { username: body.username, registered: true });
      return response({ user: { ...profile } }, 201);
    }
    if (url.pathname === "/api/me") {
      if (method === "GET" && failBootstrap) { failBootstrap = false; return response({ error: "Session bootstrap unavailable" }, 503); }
      if (method === "PATCH" && body?.username === "Taken") return response({ error: "Username is already taken. Choose another name." }, 409);
      if (method === "PATCH") Object.assign(profile, body);
      return response({ user: { ...profile } });
    }
    if (url.pathname === "/api/rooms") return response({ rooms: [room1, room2, ...ownedRooms], truncated: false });
    const room = [room1, room2, ...ownedRooms].find(item => url.pathname === "/api/rooms/" + item.id);
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
  const pinia = createPinia();
  setActivePinia(pinia);
  chat = useChat();
  await chat.start(); await until(() => chat.connection === "online");
  await chat.selectRoom(room1); await until(() => chat.currentHistory?.loaded);
  await t.test("loads the profile and room history from the API", async () => {
    assert.equal(chat.user.username, "Tester");
    assert.equal(chat.selectedRoomId, room1.id);
    assert.equal(profile.lastRoomId, room1.id);
    assert.equal(chat.currentHistory.items.length, 0);
  });
  await t.test("a taken username leaves the saved profile and message draft intact", async () => {
    chat.drafts[room1.id] = "Keep this draft";
    await assert.rejects(chat.saveName("Taken"), /already taken/);
    assert.equal(posts.length, 0);
    assert.equal(chat.user.username, "Tester");
    assert.equal(chat.drafts[room1.id], "Keep this draft");
  });
  await t.test("merges a saved HTTP response and its WebSocket echo once", async () => {
    const profileWrites = calls.filter(call => call.path === "/api/me" && call.method === "PATCH").length;
    assert.equal(await chat.send(room1.id, "First message"), true);
    assert.equal(calls.filter(call => call.path === "/api/me" && call.method === "PATCH").length, profileWrites);
    assert.equal(chat.currentHistory.items.length, 1);
    assert.equal(chat.currentHistory.items[0].text, "First message");
  });
  await t.test("profile edits keep the user ID and affect future messages without rewriting old authors", async () => {
    const id = chat.user.id;
    await chat.saveName("Renamed Tester");
    assert.equal(chat.user.id, id);
    assert.equal(profile.username, "Renamed Tester");
    assert.equal(await chat.send(room1.id, "After profile edit"), true);
    assert.equal(chat.history(room1.id).items.find(message => message.text === "First message").username, "Tester");
    assert.equal(chat.history(room1.id).items.find(message => message.text === "After profile edit").username, "Renamed Tester");
  });
  await t.test("a visitor without a saved username cannot send", async () => {
    const name = chat.user.username, before = posts.length;
    chat.user.username = "";
    assert.equal(await chat.send(room1.id, "Needs a username"), false);
    assert.equal(posts.length, before);
    assert.match(chat.history(room1.id).error, /profile/);
    chat.user.username = name;
  });
  await t.test("retries an uncertain write with the original request ID", async () => {
    failAfterSave = true;
    assert.equal(await chat.send(room1.id, "Retry safely"), false);
    assert.equal(await chat.send(room1.id, "Retry safely"), true);
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
  await t.test("all created rooms appear in the sidebar without consuming the open-window limit", async () => {
    for (let i = 0; i < 25; i++) ownedRooms.push({ ...room1, id: (3000 + i).toString(16).padStart(24, "0"),
      title: "Owned " + i, createdBy: profile.id, location: { type: "Point", coordinates: [150, -30] } });
    await chat.refreshSidebar();
    assert.equal(chat.myChatrooms.length, 25);
    assert.equal(chat.windows.length, 1);
    await chat.selectRoom(ownedRooms[0]);
    assert.ok(chat.sidebarRooms.some(room => room.id === ownedRooms[0].id), "opening a created chat keeps its sidebar entry");
    chat.closeRoom(ownedRooms[0].id);
    assert.ok(chat.sidebarRooms.some(room => room.id === ownedRooms[0].id), "closing the window keeps its sidebar entry");
    assert.equal(chat.windows.some(entry => entry.id === ownedRooms[0].id), false);
  });
  function incoming(room, text) {
    const message = { ...makeMessage(room.id, text), userId: "200000000000000000000099", username: "Other visitor" };
    records.push(message); publish(message);
    return message;
  }
  await t.test("unread counts are per room, exclude own messages, and clear on opening", async () => {
    const first = ownedRooms[0], second = ownedRooms[1];
    incoming(first, "First unread"); incoming(first, "Second unread"); incoming(second, "Other room unread");
    const own = makeMessage(first.id, "Own message"); records.push(own); publish(own);
    await until(() => chat.unreadCounts[first.id] === 2 && chat.unreadCounts[second.id] === 1);
    await chat.selectRoom(first);
    await until(() => chat.unreadCounts[first.id] === 0);
    assert.equal(chat.unreadCounts[second.id], 1);
    chat.minimizeRoom(first.id);
    const saved = incoming(first, "Arrived while minimized"); publish(saved);
    await until(() => chat.unreadCounts[first.id] === 1);
    assert.ok(chat.sidebarRooms.some(room => room.id === first.id));
    await chat.selectRoom(first); await until(() => chat.unreadCounts[first.id] === 0);
  });
  await t.test("recent chats include owned and other rooms, ordered by the user's latest message", async () => {
    const first = ownedRooms[0];
    assert.equal(await chat.send(first.id, "Recent message in my room"), true);
    assert.equal(await chat.send(room1.id, "Recent message in another room"), true);
    assert.deepEqual(chat.recentChatrooms.slice(0, 2).map(room => room.id), [room1.id, first.id]);
    assert.ok(chat.myChatrooms.some(room => room.id === first.id));
    chat.closeRoom(first.id);
    assert.ok(chat.myChatrooms.some(room => room.id === first.id));
    assert.ok(chat.recentChatrooms.some(room => room.id === first.id));
    await chat.refreshSidebar();
    assert.deepEqual(chat.recentChatrooms.slice(0, 2).map(room => room.id), [room1.id, first.id]);
  });
  await t.test("badges show 99+ and unread counts survive a fresh frontend session", async () => {
    const first = ownedRooms[0];
    await chat.selectRoom(first);
    await until(() => chat.unreadCounts[first.id] === 0);
    chat.minimizeRoom(first.id);
    for (let i = 0; i < 105; i++) incoming(first, "Unread burst " + i);
    await until(() => chat.unreadCounts[first.id] === 100);
    const { default: Sidebar } = await vite.ssrLoadModule("/src/components/chat/MinimizedChats.vue");
    assert.match(await renderToString(createSSRApp(Sidebar).use(pinia)), />99\+<\/span>/);
    chat.stop(); setActivePinia(createPinia()); chat = useChat();
    await chat.start(); await until(() => chat.connection === "online");
    assert.equal(chat.myChatrooms.length, 25);
    assert.ok(chat.recentChatrooms.some(room => room.id === first.id));
    assert.equal(chat.windows.length, 0, "the last owned room is restored minimized");
    assert.equal(chat.unreadCounts[first.id], 100);
    await chat.selectRoom(first); await until(() => chat.unreadCounts[first.id] === 0);
    ownedRooms.length = 0; await chat.refreshSidebar();
    await chat.selectRoom(room1);
  });
  await t.test("invalid login does not expire the existing session or discard drafts", async () => {
    const id = chat.user.id;
    chat.drafts[room1.id] = "Keep during failed sign-in";
    await assert.rejects(chat.authenticate("login", "Missing", "wrong password"), /Invalid username or password/);
    assert.equal(chat.user.id, id);
    assert.equal(chat.ready, true);
    assert.equal(chat.authBusy, false);
    assert.equal(chat.drafts[room1.id], "Keep during failed sign-in");
  });
  await t.test("logout clears identity-specific state and login restores the account's room", async () => {
    const account = { ...chat.user }, oldSocket = sockets.at(-1);
    await chat.logout();
    assert.notEqual(chat.user.id, account.id);
    assert.equal(chat.user.registered, false);
    assert.equal(chat.windows.length, 0);
    assert.equal(chat.drafts[room1.id], undefined);
    assert.equal(chat.history(room1.id).items.length, 0);
    assert.equal(await chat.send(room1.id, "Guest cannot send"), false);
    chat.requestRoom(15, 48);
    assert.equal(chat.authOpen, true); assert.equal(chat.newRoomLocation, null);
    await chat.authenticate("login", account.username, "correct test passphrase");
    await until(() => chat.connection === "online" && chat.history(room1.id).loaded);
    assert.equal(chat.user.id, account.id);
    assert.equal(chat.user.registered, true);
    assert.equal(chat.selectedRoomId, account.lastRoomId);
    assert.equal(chat.authOpen, false);
    const stale = makeMessage(room1.id, "Old socket must be ignored");
    oldSocket.receive({ type: "message.created", message: stale });
    assert.equal(chat.history(room1.id).items.some(message => message.id === stale.id), false);
  });
  await t.test("registration preserves a guest's open chat and failed registration keeps its draft", async () => {
    const account = { ...chat.user };
    await chat.logout();
    await chat.selectRoom(room1);
    const guestId = chat.user.id;
    chat.drafts[room1.id] = "Guest draft";
    await assert.rejects(chat.authenticate("register", "Taken", "correct test passphrase"), /already taken/);
    assert.equal(chat.user.registered, false);
    assert.equal(chat.drafts[room1.id], "Guest draft");
    await chat.authenticate("register", "New account", "correct test passphrase");
    assert.equal(chat.user.id, guestId);
    assert.equal(chat.user.registered, true);
    assert.equal(chat.drafts[room1.id], "Guest draft");
    assert.equal(chat.windows.length, 1);
    await chat.authenticate("login", account.username, "correct test passphrase");
    await until(() => chat.connection === "online");
    assert.equal(chat.user.id, account.id);
    assert.equal(chat.drafts[room1.id], undefined);
  });
  await t.test("logout still clears the account and drafts if guest bootstrap fails", async () => {
    const account = { ...chat.user };
    chat.drafts[room1.id] = "Private unsent draft";
    failBootstrap = true;
    await chat.logout();
    assert.equal(chat.user, null);
    assert.equal(chat.ready, false);
    assert.equal(chat.windows.length, 0);
    assert.equal(chat.drafts[room1.id], undefined);
    assert.match(chat.error, /bootstrap unavailable/);
    await chat.start();
    await chat.authenticate("login", account.username, "correct test passphrase");
    await until(() => chat.connection === "online");
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
    assert.equal(chat.recentChatrooms.some(room => room.id === room1.id), false);
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
