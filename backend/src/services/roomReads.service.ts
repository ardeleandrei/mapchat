import type { Actor } from "../types/user.types.js";
import type { RoomRepository, MessageRepository, RoomReadRepository } from "../types/repository.types.js";
import type { PublishEvent } from "../realtime.js";
import { ownedRoomsSchema, unreadSchema, markReadSchema } from "../schemas/roomReads.schema.js";
import { objectIdSchema } from "../schemas/api.schemas.js";
import { roomView } from "../helpers/responseMappers.js";
import { httpResult } from "../helpers/httpResult.js";
import { HttpError } from "../errors/HttpError.js";
import { requireRoom } from "./rooms.service.js";

export function createRoomReadService(rooms: RoomRepository, messages: MessageRepository, reads: RoomReadRepository, publish: PublishEvent) {
  return {
    async myRooms(user: Actor, rawQuery: unknown) {
      const query = ownedRoomsSchema.parse(rawQuery);
      const rows = await rooms.listOwned(user.id, query.after, query.limit);
      const page = rows.slice(0, query.limit);
      return httpResult(200, {
        rooms: page.map(roomView),
        nextCursor: rows.length > query.limit ? page.at(-1)!.id : null,
      });
    },

    async unreadCounts(user: Actor, rawQuery: unknown) {
      const query = unreadSchema.parse(rawQuery);
      return httpResult(200, { rooms: await reads.counts(user.id, [...new Set(query.roomIds)]) });
    },

    async markRoomRead(user: Actor, rawRoomId: unknown, body: unknown) {
      const roomId = objectIdSchema.parse(rawRoomId), input = markReadSchema.parse(body);
      await requireRoom(rooms, roomId);
      const message = await messages.findById(roomId, input.messageId);
      if (!message) throw new HttpError(404, "Message not found in this chatroom");
      await reads.advance(user.id, roomId, { id: message.id, createdAt: message.createdAt });
      try { publish({ type: "room.read", roomId, userId: user.id }); }
      catch { console.error("Read position saved; live update unavailable."); }
      return httpResult(200, { roomId });
    },
  };
}
