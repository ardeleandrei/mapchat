import { ObjectId, MongoServerError, type Filter } from "mongodb";
import type { Database, MessageDocument } from "../db.js";
import type { RoomReadRepository } from "../types/repository.types.js";
import { RoomUnavailableError } from "../errors/RoomUnavailableError.js";

export function createRoomReadRepository(database: Database): RoomReadRepository {
  return {
    async counts(userId, roomIds) {
      const user = new ObjectId(userId);
      const markers = await database.roomReads.find({ userId: user, roomId: { $in: roomIds.map(id => new ObjectId(id)) } }).toArray();
      const byRoom = new Map(markers.map(marker => [marker.roomId.toHexString(), marker.readThrough]));
      return Promise.all(roomIds.map(async roomId => {
        const cursor = byRoom.get(roomId);
        const filter: Filter<MessageDocument> = { roomId: new ObjectId(roomId), userId: { $ne: user } };
        if (cursor) filter.$or = [
          { createdAt: { $gt: cursor.createdAt } },
          { createdAt: cursor.createdAt, _id: { $gt: cursor.id } },
        ];
        // The UI displays 99+, so counting beyond 100 is unnecessary.
        const unreadCount = await database.messages.countDocuments(filter, { limit: 100 });
        return { roomId, unreadCount };
      }));
    },

    async advance(userId, roomId, cursor) {
      const filter = { userId: new ObjectId(userId), roomId: new ObjectId(roomId) };
      const marker = { createdAt: cursor.createdAt, id: new ObjectId(cursor.id) };
      const update = [{ $set: { readThrough: { $cond: [
        { $or: [
          { $eq: [{ $type: "$readThrough" }, "missing"] },
          { $lt: ["$readThrough.createdAt", marker.createdAt] },
          { $and: [{ $eq: ["$readThrough.createdAt", marker.createdAt] }, { $lt: ["$readThrough.id", marker.id] }] },
        ] }, { $literal: marker }, "$readThrough",
      ] } } }];
      try {
        await database.roomReads.updateOne(filter, update, { upsert: true });
      } catch (error) {
        if (!(error instanceof MongoServerError) || error.code !== 11000) throw error;
        // Concurrent first reads may race to insert the unique marker. Retry
        // against the winner, preserving the furthest read position.
        await database.roomReads.updateOne(filter, update);
      }
      // Deletion can finish after service validation but before this write.
      // Either deletion cleans up the marker, or this post-write check does.
      if (!await database.rooms.findOne({ _id: filter.roomId, deletedAt: { $exists: false } }, { projection: { _id: 1 } })) {
        await database.roomReads.deleteOne(filter);
        throw new RoomUnavailableError();
      }
    },
  };
}
