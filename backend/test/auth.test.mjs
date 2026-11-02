import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import express from "express";
import { MongoServerError } from "mongodb";
import { WebSocket } from "ws";
import { configureApp } from "../dist/app.js";
import { attachWebSocket } from "../dist/websocket.js";
import { usernameKey } from "../dist/helpers/username.js";
import { toUser } from "../dist/helpers/documentMappers.js";
import { hashPassword, verifyPassword } from "../dist/helpers/password.js";

const password = "testpass";

test("password hashes use salted Argon2id and public profiles exclude secrets", async () => {
  const first = await hashPassword(password), second = await hashPassword(password);
  assert.match(first, /^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  assert.notEqual(first, second);
  assert.equal(await verifyPassword(first, password), true);
  assert.equal(await verifyPassword(first, "incorrect password"), false);
  const user = toUser({ _id: { toHexString: () => "id" }, username: "test", usernameKey: "test",
    passwordHash: first, futureSecret: "do not expose", lastRoomId: null, createdAt: new Date() });
  assert.equal(user.registered, true);
  assert.equal(user.passwordHash, undefined);
  assert.equal(user.usernameKey, undefined);
  assert.equal(user.futureSecret, undefined);
});

test("HTTP password authentication, session rotation and WebSocket revocation", async t => {
  const users = new Map(), sessions = new Map();

  function checkUnique(row) {
    if (row.usernameKey && [...users.values()].some(user => !user._id.equals(row._id) && user.usernameKey === row.usernameKey)) {
      throw new MongoServerError({ code: 11000, message: "duplicate username" });
    }
  }

  const database = {
    users: {
      async findOne(query) {
        return [...users.values()].find(user => query._id ? user._id.equals(query._id) : user.usernameKey === query.usernameKey) ?? null;
      },

      async insertOne(row) { checkUnique(row); users.set(row._id.toHexString(), row); },

      async findOneAndUpdate(query, change) {
        const row = users.get(query._id.toHexString());
        if (!row || (query.passwordHash && row.passwordHash)) return null;
        const updated = { ...row, ...change.$set };
        checkUnique(updated); users.set(row._id.toHexString(), updated);
        return updated;
      },
    },
    sessions: {
      async findOne(query) {
        const row = sessions.get(query._id);
        return row && row.expiresAt > query.expiresAt.$gt ? row : null;
      },

      async insertOne(row) { sessions.set(row._id, row); },

      async deleteOne(query) { sessions.delete(query._id); },
    },
    rooms: { findOne: async () => null },
    messages: { aggregate: () => ({ toArray: async () => [] }) },
  };
  const app = express(), server = createServer(app);
  const live = attachWebSocket(server, database);
  configureApp(app, database, live.publish, live.revokeSession);
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const base = "http://127.0.0.1:" + server.address().port;
  const sockets = [];
  t.after(async () => {
    for (const socket of sockets) socket.terminate();
    await live.close(); await new Promise(resolve => server.close(resolve));
  });

  function client() {
    let cookie = "";
    return {
      get cookie() { return cookie; },

      async request(path, method = "GET", body, status = 200, headers = {}) {
        const response = await fetch(base + "/api" + path, {
          method, headers: {
            ...(cookie ? { Cookie: cookie } : {}),
            ...(method === "GET" ? {} : { "X-Wolfchatter-Request": "1" }),
            ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...headers,
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        const value = await response.json();
        assert.equal(response.status, status, JSON.stringify(value));
        const setCookie = response.headers.getSetCookie()[0];
        if (setCookie) cookie = setCookie.split(";")[0];
        return { value, setCookie };
      },
    };
  }

  async function connect(cookie) {
    const socket = new WebSocket(base.replace("http", "ws") + "/ws", { headers: { Cookie: cookie } });
    sockets.push(socket);
    const ready = once(socket, "message");
    await once(socket, "open"); await ready;
    return socket;
  }

  const a = client(), b = client();
  const guest = (await a.request("/me")).value.user;
  const oldCookie = a.cookie;
  const anonymousSocket = await connect(oldCookie);
  await t.test("guests may browse but cannot claim names, create rooms or send messages", async () => {
    assert.equal(guest.registered, false);
    await a.request("/me", "PATCH", { username: "Alice" }, 403);
    await a.request("/rooms", "POST", {}, 403);
    await a.request("/rooms/100000000000000000000001/messages", "POST", {}, 403);
    await a.request("/auth/register", "POST", { username: "Alice", password: "1234567" }, 400);
  });
  await t.test("registration upgrades the visitor, rotates cookies and closes the old socket", async () => {
    const closed = once(anonymousSocket, "close");
    const result = await a.request("/auth/register", "POST", { username: "Alice", password }, 201);
    assert.equal(result.value.user.id, guest.id);
    assert.equal(result.value.user.registered, true);
    assert.equal(result.value.user.passwordHash, undefined);
    assert.notEqual(a.cookie, oldCookie);
    assert.match(result.setCookie, /HttpOnly/); assert.match(result.setCookie, /SameSite=Lax/);
    assert.match(result.setCookie, /Max-Age=2592000/);
    assert.equal((await closed)[0], 4401);
    assert.equal(sessions.has(createHash("sha256").update(oldCookie.split("=")[1]).digest("hex")), false);
    await a.request("/auth/register", "POST", { username: "Other", password }, 409);
  });
  await t.test("a second browser signs into the same ID with a canonical username", async () => {
    const result = await b.request("/auth/login", "POST", { username: "  ＡＬＩＣＥ  ", password });
    assert.equal(result.value.user.id, guest.id);
    assert.notEqual(b.cookie, a.cookie);
    assert.equal((await b.request("/me")).value.user.id, guest.id);
    const user = users.get(guest.id);
    assert.equal(user.usernameKey, usernameKey("Alice"));
    assert.notEqual(user.passwordHash, password);
  });
  await t.test("conflicting registration and invalid logins leave the current session intact", async () => {
    const c = client();
    await c.request("/auth/register", "POST", { username: "ＡＬＩＣＥ", password }, 409);
    const before = b.cookie;
    const wrong = await b.request("/auth/login", "POST", { username: "Alice", password: "wrong" }, 401);
    const unknown = await b.request("/auth/login", "POST", { username: "missing", password: "wrong" }, 401);
    assert.equal(wrong.value.error, unknown.value.error);
    assert.equal(b.cookie, before);
    assert.equal((await b.request("/me")).value.user.id, guest.id);
  });
  await t.test("Origin and custom-header protections reject cross-site authentication", async () => {
    await b.request("/auth/logout", "POST", {}, 403, { Origin: "https://foreign.example" });
    await b.request("/auth/logout", "POST", {}, 403, { "X-Wolfchatter-Request": "" });
    await b.request("/auth/login", "POST", { username: "Alice", password }, 403, { "Sec-Fetch-Site": "cross-site" });
    assert.equal((await b.request("/me")).value.user.id, guest.id);
  });
  await t.test("logout closes its socket and revokes only that browser's session", async () => {
    const socket = await connect(b.cookie), closed = once(socket, "close");
    const cookie = b.cookie;
    const result = await b.request("/auth/logout", "POST", {});
    assert.match(result.setCookie, /Expires=Thu, 01 Jan 1970/);
    assert.equal((await closed)[0], 4401);
    const denied = await fetch(base + "/api/rooms", { headers: { Cookie: cookie } });
    assert.equal(denied.status, 401);
    assert.equal((await a.request("/me")).value.user.registered, true);
    assert.equal((await b.request("/me")).value.user.registered, false);
    await b.request("/auth/login", "POST", { username: "Alice", password });
    assert.equal((await b.request("/me")).value.user.id, guest.id);
  });
  await t.test("an old anonymous token cannot inherit an account after registration", async () => {
    const token = "a".repeat(43), hash = createHash("sha256").update(token).digest("hex");
    sessions.set(hash, { _id: hash, userId: users.get(guest.id)._id, expiresAt: new Date(Date.now() + 60_000), authenticated: false });
    const response = await fetch(base + "/api/rooms", { headers: { Cookie: "wolfchatter_session=" + token } });
    assert.equal(response.status, 401);
  });
  await t.test("failed sign-in attempts are rate limited", async () => {
    let throttled = false;
    for (let i = 0; i < 21; i++) {
      const response = await fetch(base + "/api/auth/login", { method: "POST", headers: {
        "Content-Type": "application/json", "X-Wolfchatter-Request": "1",
      }, body: JSON.stringify({ username: "Alice", password: "incorrect" }) });
      if (response.status === 429) { throttled = true; break; }
      assert.equal(response.status, 401);
    }
    assert.equal(throttled, true);
  });
});
