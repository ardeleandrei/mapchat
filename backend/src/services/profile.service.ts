import type { Actor, User } from "../types/user.types.js";
import type { RoomRepository, ProfileRepository } from "../types/repository.types.js";
import type { z } from "zod";
import type { profileSchema } from "../schemas/profile.schema.js";
import { HttpError } from "../errors/HttpError.js";
import { DuplicateKeyError } from "../errors/DuplicateKeyError.js";

export function createProfileService(profiles: ProfileRepository, rooms: RoomRepository) {
  return { async update(user: Actor, input: z.infer<typeof profileSchema>) {
    const changes: Partial<Pick<User, "username" | "lastRoomId">> = {};
    if (input.username !== undefined) changes.username = input.username;
    if (input.lastRoomId !== undefined) {
      changes.lastRoomId = input.lastRoomId;
      if (input.lastRoomId && !await rooms.findById(input.lastRoomId)) throw new HttpError(404, "Chatroom not found");
    }
    const updated = await profiles.updateUser(user.id, changes).catch(error => {
      if (error instanceof DuplicateKeyError) throw new HttpError(409, "Username is already taken. Choose another name.");
      throw error;
    });
    if (!updated) throw new HttpError(401, "User no longer exists. Call GET /api/me again.");
    return updated;
  } };
}
