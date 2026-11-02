import test from "node:test";
import assert from "node:assert/strict";
import { createChatService } from "../dist/services/chat.service.js";
import { createProfileService } from "../dist/services/profile.service.js";
import { DuplicateKeyError } from "../dist/errors/DuplicateKeyError.js";
import { encodeCursor, decodeCursor } from "../dist/helpers/messageCursor.js";

const room = { id: "100000000000000000000001", title: "Room", revision: 0, creationKey: crypto.randomUUID(),
  createdBy: "200000000000000000000001", location: { type: "Point", coordinates: [15, 48] }, createdAt: new Date() };
const actor = { id: room.createdBy, username: "Visitor" };

const message = number => ({ id: String(number).padStart(24, "0"), roomId: room.id, userId: actor.id,
  clientMessageId: crypto.randomUUID(), username: actor.username, text: "Message " + number,
  createdAt: new Date("2026-10-29T12:00:00.000Z") });
const rooms = { findById: async id => id === room.id ? room : null };
const profiles = { ownsUsername: async () => true };

test("chat service requests room/user histories through plain repository arguments", async () => {
  const calls = [];
  const records = [message(3), message(2), message(1)];
  const service = createChatService({ messages: {
    listByRoom: async (...args) => { calls.push(args); return records; },

    listByUser: async (...args) => { calls.push(args); return [records[0]]; },
  }, rooms, profiles }, () => {});
  const { body } = await service.roomMessages(room.id, { limit: "2" });
  assert.deepEqual(calls[0], [room.id, { limit: 2, direction: "older" }]);
  assert.deepEqual(body.messages.map(m => m.id), [records[1].id, records[0].id]);
  assert.deepEqual(decodeCursor(body.nextCursor), { id: records[1].id, createdAt: records[1].createdAt });
  const cursor = encodeCursor(records[0]);
  await service.myMessages(actor, { after: cursor });
  assert.deepEqual(calls[1], [actor.id, { limit: 50, direction: "newer", cursor: decodeCursor(cursor) }]);
  await assert.rejects(service.roomMessages(room.id, { before: "invalid" }), { status: 400 });
  await assert.rejects(service.roomMessages(room.id, { before: cursor, after: cursor }));
  assert.equal(calls.length, 2, "invalid pagination never reaches persistence");
});

test("chat service reconciles a concurrent duplicate without publishing twice", async () => {
  const saved = message(1), events = [];
  let reads = 0;
  const service = createChatService({ messages: {
    findRequest: async () => ++reads === 1 ? null : saved,

    insert: async draft => { assert.equal(draft.userId, actor.id); assert.equal(draft.id, undefined); throw new DuplicateKeyError(); },
  }, rooms, profiles }, event => events.push(event));
  const result = await service.createMessage(actor, room.id, { text: saved.text, clientMessageId: saved.clientMessageId });
  assert.equal(result.status, 200);
  assert.equal(result.body.message.id, saved.id);
  assert.deepEqual(events, []);
});

test("chat service publishes only after persistence succeeds", async () => {
  const events = [], saved = message(1);
  const service = createChatService({ messages: { findRequest: async () => null,

    insert: async () => { assert.equal(events.length, 0); return saved; },
  }, rooms, profiles }, event => events.push(event));
  assert.equal((await service.createMessage(actor, room.id, { text: saved.text, clientMessageId: saved.clientMessageId })).status, 201);
  assert.equal(events[0].message.id, saved.id);
  const failed = createChatService({ messages: { findRequest: async () => null, insert: async () => { throw new Error("offline"); } }, rooms, profiles }, event => events.push(event));
  await assert.rejects(failed.createMessage(actor, room.id, { text: saved.text, clientMessageId: crypto.randomUUID() }), /offline/);
  assert.equal(events.length, 1);
});

test("chat service enforces ownership and passes plain revision updates to its repository", async () => {
  const calls = [];
  const service = createChatService({ rooms: { ...rooms, update: async (...args) => { calls.push(args); return null; } } }, () => {});
  await assert.rejects(service.updateRoom({ ...actor, id: "other" }, room.id, { title: "New", revision: 0 }), { status: 403 });
  assert.equal(calls.length, 0);
  await assert.rejects(service.updateRoom(actor, room.id, { title: "New", revision: 0 }), { status: 409 });
  assert.deepEqual(calls[0], [room.id, actor.id, 0, { title: "New" }]);
});

test("profile service validates room references before saving plain profile changes", async () => {
  const calls = [];
  const service = createProfileService({ updateUser: async (...args) => { calls.push(args); return { ...actor, lastRoomId: args[1].lastRoomId }; } }, rooms);
  await assert.rejects(service.update(actor, { lastRoomId: "missing" }), { status: 404 });
  assert.equal(calls.length, 0);
  await service.update(actor, { lastRoomId: room.id });
  await service.update(actor, { lastRoomId: null });
  assert.deepEqual(calls, [[actor.id, { lastRoomId: room.id }], [actor.id, { lastRoomId: null }]]);
});

test("room deletion is creator-only, retryable, and broadcasts only after cleanup", async () => {
  const events = [], calls = [];
  let failed = true;
  const service = createChatService({ rooms: { ...rooms,

    deleteOwned: async (...args) => { calls.push(args); if (failed) throw new Error("cleanup failed"); return true; },
  } }, event => events.push(event));
  await assert.rejects(service.deleteRoom({ ...actor, id: "other" }, room.id), { status: 403 });
  assert.equal(calls.length, 0);
  await assert.rejects(service.deleteRoom(actor, room.id), /cleanup failed/);
  assert.equal(events.length, 0);
  failed = false;
  const result = await service.deleteRoom(actor, room.id);
  assert.equal(result.status, 200);
  assert.deepEqual(calls.at(-1), [room.id, actor.id]);
  assert.deepEqual(events[0], { type: "room.deleted", roomId: room.id });
  await service.deleteRoom(actor, room.id);
  const deleted = createChatService({ rooms: { findByKey: async () => ({ ...room, deletedAt: new Date() }) } }, () => {});
  await assert.rejects(deleted.createRoom(actor, { longitude: 15, latitude: 48, creationKey: room.creationKey }), { status: 410 });
});
