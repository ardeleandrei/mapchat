import { ObjectId } from "mongodb";
import type { Database } from "../db.js";
import type { UserDocument } from "../types/document.types.js";
import type { AuthRepository } from "../types/auth.types.js";
import { toUser } from "../helpers/documentMappers.js";
import { usernameKey } from "../helpers/username.js";
import { translateWriteError } from "../helpers/persistenceErrors.js";

export function createAuthRepository(database: Database): AuthRepository {
  return {
    async credentials(username) {
      const row = await database.users.findOne({ usernameKey: usernameKey(username) });
      return row?.passwordHash ? { user: toUser(row), passwordHash: row.passwordHash } : null;
    },

    async register(id, username, passwordHash) {
      const fields = { username, usernameKey: usernameKey(username), passwordHash };
      if (id) {
        const row = await translateWriteError(() => database.users.findOneAndUpdate(
          { _id: new ObjectId(id), passwordHash: { $exists: false } },
          { $set: fields }, { returnDocument: "after" },
        ));
        return row ? toUser(row) : null;
      }
      const row: UserDocument = { _id: new ObjectId(), ...fields, lastRoomId: null, createdAt: new Date() };
      await translateWriteError(() => database.users.insertOne(row));
      return toUser(row);
    },
  };
}
