import { ObjectId } from "mongodb";
import type { Database } from "../db.js";
import type { ProfileRepository } from "../types/repository.types.js";
import { toUser } from "../helpers/documentMappers.js";
import { usernameKey } from "../helpers/username.js";
import { translateWriteError } from "../helpers/persistenceErrors.js";

export function createProfileRepository(database: Database): ProfileRepository {
  return {
    async ownsUsername(id, username) {
      return Boolean(await database.users.findOne({ _id: new ObjectId(id), usernameKey: usernameKey(username) },
        { projection: { _id: 1 } }));
    },

    async updateUser(id, changes) {
      const { lastRoomId, ...fields } = changes;
      const row = await translateWriteError(() => database.users.findOneAndUpdate({ _id: new ObjectId(id) }, {
        $set: { ...fields, ...(fields.username === undefined ? {} : { usernameKey: usernameKey(fields.username) }), ...(lastRoomId === undefined ? {} : {
          lastRoomId: lastRoomId === null ? null : new ObjectId(lastRoomId),
        }) },
      }, { returnDocument: "after" }));
      return row ? toUser(row) : null;
    },
  };
}
