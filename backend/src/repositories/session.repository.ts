import { ObjectId } from "mongodb";
import type { Database, UserDocument } from "../db.js";
import type { SessionRepository } from "../types/session.types.js";
import { toUser } from "../helpers/documentMappers.js";

export function createSessionRepository(database: Database): SessionRepository {
  return {
    async activeSession(hash) {
      const row = await database.sessions.findOne({ _id: hash, expiresAt: { $gt: new Date() } });
      return row ? {
        hash: row._id,
        userId: row.userId.toHexString(),
        authenticated: Boolean(row.authenticated),
        createdAt: row.createdAt,
        expiresAt: row.expiresAt,
      } : null;
    },

    async user(id) {
      const row = await database.users.findOne({ _id: new ObjectId(id) });
      return row ? toUser(row) : null;
    },

    async createGuest(createdAt) {
      const row: UserDocument = { _id: new ObjectId(), username: "", lastRoomId: null, createdAt };
      await database.users.insertOne(row);
      return toUser(row);
    },

    async insertSession(session) {
      const { hash, userId, ...rest } = session;
      await database.sessions.insertOne({ _id: hash, userId: new ObjectId(userId), ...rest });
    },

    async deleteSession(hash) {
      await database.sessions.deleteOne({ _id: hash });
    },
  };
}
