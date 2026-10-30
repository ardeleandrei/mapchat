import { ObjectId } from "mongodb";
import type { Filter } from "mongodb";
import type { RoomRepository } from "../types/repository.types.js";
import { toRoom } from "../helpers/documentMappers.js";
import { translateWriteError } from "../helpers/persistenceErrors.js";
import type { Database, RoomDocument } from "../db.js";

export function createRoomRepository(database: Database): RoomRepository { return {
  async exists(id) { return Boolean(await database.rooms.findOne({ _id: new ObjectId(id), deletedAt: { $exists: false } }, { projection: { _id: 1 } })); },

  async findById(id, includeDeleted = false) {
    const row = await database.rooms.findOne({ _id: new ObjectId(id), ...(includeDeleted ? {} : { deletedAt: { $exists: false } }) });
    return row ? toRoom(row) : null;
  },

  async deleteOwned(id, userId) {
    const roomId = new ObjectId(id);
    // Retain the creation key and creator as a tombstone: retries cannot recreate
    // the room, and the owner can safely retry interrupted cascading cleanup.
    const result = await database.rooms.updateOne({ _id: roomId, createdBy: new ObjectId(userId) },
      { $set: { deletedAt: new Date() } });
    if (!result.matchedCount) return false;
    await database.messages.deleteMany({ roomId });
    await database.roomReads.deleteMany({ roomId });
    await database.users.updateMany({ lastRoomId: roomId }, { $set: { lastRoomId: null } });
    return true;
  },

  async findByKey(creationKey) { const row = await database.rooms.findOne({ creationKey }); return row ? toRoom(row) : null; },

  async insert(room) {
    const { createdBy, ...fields } = room;
    const document: RoomDocument = { ...fields, _id: new ObjectId(), ...(createdBy ? { createdBy: new ObjectId(createdBy) } : {}) };
    await translateWriteError(() => database.rooms.insertOne(document));
    return toRoom(document);
  },

  async list(query) {
    const filter: Filter<RoomDocument> = { deletedAt: { $exists: false } };

    if (query.bbox) {
      const [west, south, east, north] = query.bbox;

      filter["location.coordinates.1"] = {
        $gte: south,
        $lte: north,
      };

      if (west <= east) {
        filter["location.coordinates.0"] = {
          $gte: west,
          $lte: east,
        };
      } else {
        // The viewport crosses the antimeridian.
        filter.$or = [
          { "location.coordinates.0": { $gte: west } },
          { "location.coordinates.0": { $lte: east } },
        ];
      }
    }

    const rooms = await database.rooms
      .find(filter)
      .sort({ _id: 1 })
      .limit(query.limit + 1)
      .toArray();
    return rooms.map(toRoom);
  },

  async listOwned(userId, after, limit) {
    const rows = await database.rooms.find({
      createdBy: new ObjectId(userId), deletedAt: { $exists: false },
      ...(after ? { _id: { $gt: new ObjectId(after) } } : {}),
    }).sort({ _id: 1 }).limit(limit + 1).toArray();
    return rows.map(toRoom);
  },

  async nearby(query) {
    const rooms = await database.rooms.find({
      deletedAt: { $exists: false },
      location: {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [query.longitude, query.latitude],
          },
          $maxDistance: query.radius,
        },
      },
    }).limit(query.limit).toArray();
    return rooms.map(toRoom);
  },

  async nextNumber() { const counter = await database.db.collection<{
      _id: string;
      value: number;
    }>("counters").findOneAndUpdate(
      { _id: "roomNumber" },
      { $inc: { value: 1 } },
      { upsert: true, returnDocument: "after" },
    );
    if (!counter) throw new Error("Could not allocate a chatroom number");
    return counter.value;
  },

  async update(id, userId, revision, changes) { const row = await database.rooms.findOneAndUpdate({
      _id: new ObjectId(id), createdBy: new ObjectId(userId), deletedAt: { $exists: false },
      ...(revision === 0 ? { $or: [{ revision: 0 }, { revision: { $exists: false } }] } : { revision }),
    }, { $set: changes, $inc: { revision: 1 } }, { returnDocument: "after" }); return row ? toRoom(row) : null; },
}; }
