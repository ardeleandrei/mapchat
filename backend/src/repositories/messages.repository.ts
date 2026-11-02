import { ObjectId, type Filter } from "mongodb";
import type { Database } from "../db.js";
import type { MessageDocument } from "../types/document.types.js";
import type { MessageRepository } from "../types/repository.types.js";
import type { MessagePageQuery } from "../types/message.types.js";
import { toMessage } from "../helpers/documentMappers.js";
import { translateWriteError } from "../helpers/persistenceErrors.js";
import { RoomUnavailableError } from "../errors/RoomUnavailableError.js";

export function createMessageRepository(database: Database): MessageRepository {
  async function list(filter: Filter<MessageDocument>, query: MessagePageQuery) {
    const forward = query.direction === "newer";
    if (query.cursor) {
      const { createdAt, id } = query.cursor;
      const objectId = new ObjectId(id);
      filter.$or = [
        { createdAt: forward ? { $gt: createdAt } : { $lt: createdAt } },
        { createdAt, _id: forward ? { $gt: objectId } : { $lt: objectId } },
      ];
    }
    const direction = forward ? 1 : -1;
    const rows = await database.messages.find(filter)
      .sort({ createdAt: direction, _id: direction }).limit(query.limit + 1).toArray();
    return rows.map(toMessage);
  }
  return {
    async findById(roomId, id) {
      const row = await database.messages.findOne({ _id: new ObjectId(id), roomId: new ObjectId(roomId) });
      return row ? toMessage(row) : null;
    },

    async findRequest(roomId, clientMessageId) {
      const row = await database.messages.findOne({ roomId: new ObjectId(roomId), clientMessageId });
      return row ? toMessage(row) : null;
    },

    async insert(message) {
      const { userId, ...fields } = message;
      const document: MessageDocument = { ...fields, _id: new ObjectId(), roomId: new ObjectId(message.roomId),
        ...(userId ? { userId: new ObjectId(userId) } : {}) };
      await translateWriteError(() => database.messages.insertOne(document));
      // A writer may have passed service validation just before deletion.
      // Either cascading cleanup removes this write, or this check removes it.
      if (!await database.rooms.findOne({ _id: document.roomId, deletedAt: { $exists: false } }, { projection: { _id: 1 } })) {
        await database.messages.deleteOne({ _id: document._id });
        throw new RoomUnavailableError();
      }
      return toMessage(document);
    },

    listByRoom: (id, query) => list({ roomId: new ObjectId(id) }, query),

    listByUser: (id, query) => list({ userId: new ObjectId(id) }, query),
  };
}
