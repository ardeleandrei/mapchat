import test from "node:test";
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { createMessageRepository } from "../dist/repositories/messages.repository.js";
import { RoomUnavailableError } from "../dist/errors/RoomUnavailableError.js";

test("repository owns timestamp/ID pagination, scope isolation and MongoDB conversion", async () => {
  const roomId = new ObjectId(), userId = new ObjectId(), otherRoom = new ObjectId();
  const date = new Date("2026-10-29T12:00:00.000Z");
  const records = [1, 2, 3].map(n => ({ _id: new ObjectId(String(n).padStart(24, "0")), roomId, userId,
    createdAt: date, text: String(n), username: "Test", clientMessageId: crypto.randomUUID() }));
  records.push({ ...records[0], _id: new ObjectId(), roomId: otherRoom });

  // Execute the supported predicates against records rather than asserting filter syntax.
  const compare = (value, condition) => condition.$gt ? value > condition.$gt : value < condition.$lt;
  const database = { messages: { find(filter) {
    const rows = records.filter(r => (!filter.roomId || r.roomId.equals(filter.roomId)) &&
      (!filter.userId || r.userId.equals(filter.userId)) && (!filter.$or || filter.$or.some(c =>
        c._id ? r.createdAt.getTime() === c.createdAt.getTime() && compare(r._id.toHexString(), c._id.$gt?.toHexString() ? { $gt: c._id.$gt.toHexString() } : { $lt: c._id.$lt.toHexString() }) : compare(r.createdAt, c.createdAt))));
    return { sort(order) { rows.sort((a,b) => order.createdAt * (a.createdAt-b.createdAt || a._id.toHexString().localeCompare(b._id.toHexString()))); return this; },

      limit(n) { return { toArray: async () => rows.slice(0,n) }; } };
  } } };
  const repository = createMessageRepository(database);
  const cursor = { id: records[1]._id.toHexString(), createdAt: date };
  const older = await repository.listByRoom(roomId.toHexString(), { cursor, direction: "older", limit: 1 });
  const newer = await repository.listByRoom(roomId.toHexString(), { cursor, direction: "newer", limit: 1 });
  assert.deepEqual(older.map(m => m.id), [records[0]._id.toHexString()]);
  assert.deepEqual(newer.map(m => m.id), [records[2]._id.toHexString()]);
  assert.equal(older[0].roomId, roomId.toHexString());
  assert.equal(older[0]._id, undefined);
  const byUser = await repository.listByUser(userId.toHexString(), { direction: "older", limit: 2 });
  assert.equal(byUser.length, 3, "fetches one extra record for continuation detection");
});

test("an in-flight write cleans itself up if the room was deleted", async () => {
  let inserted, removed;
  const repository = createMessageRepository({
    rooms: { findOne: async () => null },
    messages: {
      insertOne: async document => { inserted = document; },

      deleteOne: async filter => { removed = filter; },
    },
  });
  await assert.rejects(repository.insert({ roomId: new ObjectId().toHexString(), text: "Racing deletion",
    username: "Test", clientMessageId: crypto.randomUUID(), createdAt: new Date() }), RoomUnavailableError);
  assert.ok(inserted._id.equals(removed._id));
});
