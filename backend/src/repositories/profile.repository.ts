import { ObjectId } from "mongodb";
import type { Database } from "../db.js";
import type { ProfileRepository } from "../types/repository.types.js";
import { toUser } from "../helpers/documentMappers.js";

export function createProfileRepository(database: Database): ProfileRepository {
  return {
    async updateUser(id, changes) {
      const { lastRoomId, ...fields } = changes;
      const row = await database.users.findOneAndUpdate({ _id: new ObjectId(id) }, {
        $set: { ...fields, ...(lastRoomId === undefined ? {} : {
          lastRoomId: lastRoomId === null ? null : new ObjectId(lastRoomId),
        }) },
      }, { returnDocument: "after" });
      return row ? toUser(row) : null;
    },
  };
}
