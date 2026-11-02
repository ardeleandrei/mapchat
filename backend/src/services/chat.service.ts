import type { Actor } from "../types/user.types.js";
import type { Room } from "../types/room.types.js";
import type { Message } from "../types/message.types.js";
import type { RoomRepository, MessageRepository, ProfileRepository, RoomReadRepository } from "../types/repository.types.js";
import type { PublishEvent } from "../websocket.js";
import { DuplicateKeyError } from "../errors/DuplicateKeyError.js";
import { RoomUnavailableError } from "../errors/RoomUnavailableError.js";
import { HttpError } from "../errors/HttpError.js";
import { roomView, messageView } from "../helpers/responseMappers.js";
import { encodeCursor, decodeCursor } from "../helpers/messageCursor.js";
import { httpResult } from "../helpers/httpResult.js";
import {
  objectIdSchema, createRoomSchema, updateRoomSchema, listRoomsSchema,
  nearbySchema, createMessageSchema, historySchema,
} from "../schemas/api.schemas.js";
import { ownedRoomsSchema, unreadSchema, markReadSchema, recentRoomsSchema } from "../schemas/roomReads.schema.js";

export function createChatService(
  repositories: {
    rooms: RoomRepository;
    messages: MessageRepository;
    profiles: ProfileRepository;
    reads: RoomReadRepository;
  },
  publish: PublishEvent,
) {
  const { rooms, messages, profiles, reads } = repositories;

  function notify(event: Parameters<PublishEvent>[0]) {
    try {
      publish(event);
    } catch {
      console.error("Live delivery failed; saved data remains available through history.");
    }
  }

  async function requireRoom(value: unknown) {
    const room = await rooms.findById(objectIdSchema.parse(value));
    if (!room) throw new HttpError(404, "Chatroom not found");
    return room;
  }

  async function readHistory(scope: { roomId: string } | { userId: string }, rawQuery: unknown) {
    const query = historySchema.parse(rawQuery);
    const forward = Boolean(query.after);
    const rawCursor = query.before ?? query.after;
    const queryOptions = {
      limit: query.limit,
      direction: forward ? "newer" as const : "older" as const,
      ...(rawCursor ? { cursor: decodeCursor(rawCursor) } : {}),
    };
    const rows = "roomId" in scope
      ? await messages.listByRoom(scope.roomId, queryOptions)
      : await messages.listByUser(scope.userId, queryOptions);
    const page = rows.slice(0, query.limit);
    const continuation = page.at(-1);
    const nextCursor = rows.length > query.limit && continuation
      ? encodeCursor(continuation)
      : null;

    // Always return messages in display order: oldest to newest.
    if (!forward) page.reverse();
    const newest = page.at(-1);

    return {
      messages: page.map(messageView),
      nextCursor,
      latestCursor: newest ? encodeCursor(newest) : null,
      direction: forward ? "newer" : "older",
    };
  }

  return {
    async listRooms(rawQuery: unknown) {
      const query = listRoomsSchema.parse(rawQuery);
      const rows = await rooms.list(query);
      return httpResult(200, {
        rooms: rows.slice(0, query.limit).map(roomView),
        truncated: rows.length > query.limit,
      });
    },

    async nearbyRooms(rawQuery: unknown) {
      const query = nearbySchema.parse(rawQuery);
      return httpResult(200, { rooms: (await rooms.nearby(query)).map(roomView) });
    },

    async getRoom(roomId: unknown) {
      return httpResult(200, { room: roomView(await requireRoom(roomId)) });
    },

    async createRoom(user: Actor, body: unknown) {
      const input = createRoomSchema.parse(body);
      const replyWithExisting = (room: Room) => {
        const [lng, lat] = room.location.coordinates;
        if (
          room.createdBy !== user.id ||
          lng !== input.longitude ||
          lat !== input.latitude ||
          room.creationTitle !== input.title
        ) {
          throw new HttpError(409, "This creationKey was already used for another submission");
        }
        return httpResult(200, { room: roomView(room) });
      };

      const existing = await rooms.findByKey(input.creationKey);
      if (existing) {
        if (existing.deletedAt) throw new HttpError(410, "This chatroom was deleted");
        return replyWithExisting(existing);
      }

      const counter = await rooms.nextNumber();
      if (!counter) throw new Error("Could not allocate a chatroom number");
      const draft: Omit<Room, "id"> = {
        title: input.title ?? `Chatroom ${counter}`,
        ...(input.title === undefined ? {} : { creationTitle: input.title }),
        revision: 0,
        creationKey: input.creationKey,
        createdBy: user.id,
        location: { type: "Point", coordinates: [input.longitude, input.latitude] },
        createdAt: new Date(),
      };

      let room: Room;
      try {
        room = await rooms.insert(draft);
      } catch (error) {
        if (!(error instanceof DuplicateKeyError)) throw error;
        const replay = await rooms.findByKey(input.creationKey);
        if (!replay) throw error;
        if (replay.deletedAt) throw new HttpError(410, "This chatroom was deleted");
        return replyWithExisting(replay);
      }

      notify({ type: "room.created", room: roomView(room) });
      return httpResult(201, { room: roomView(room) });
    },

    async updateRoom(user: Actor, roomId: unknown, body: unknown) {
      const input = updateRoomSchema.parse(body);
      const room = await requireRoom(roomId);
      if (room.createdBy !== user.id) throw new HttpError(403, "Only the room creator can edit this chatroom");
      const changes: Partial<Pick<Room, "title" | "color">> = {};
      if (input.title !== undefined) changes.title = input.title;
      if (input.color !== undefined) changes.color = input.color;
      const updated = await rooms.update(room.id, user.id, input.revision, changes);
      if (!updated) throw new HttpError(409, "This room has changed. Reopen its settings and try again.");
      notify({ type: "room.updated", room: roomView(updated) });
      return httpResult(200, { room: roomView(updated) });
    },

    async deleteRoom(user: Actor, roomId: unknown) {
      const id = objectIdSchema.parse(roomId);
      const room = await rooms.findById(id, true);
      if (!room) throw new HttpError(404, "Chatroom not found");
      if (room.createdBy !== user.id) throw new HttpError(403, "Only the room creator can delete this chatroom");
      if (!await rooms.deleteOwned(room.id, user.id)) throw new HttpError(404, "Chatroom not found");
      notify({ type: "room.deleted", roomId: room.id });
      return httpResult(200, { roomId: room.id });
    },

    async myMessages(user: Actor, rawQuery: unknown) {
      return httpResult(200, await readHistory({ userId: user.id }, rawQuery));
    },

    async roomMessages(roomId: unknown, rawQuery: unknown) {
      const room = await requireRoom(roomId);
      return httpResult(200, await readHistory({ roomId: room.id }, rawQuery));
    },

    async createMessage(user: Actor, roomId: unknown, body: unknown) {
      const room = await requireRoom(roomId);
      const input = createMessageSchema.parse(body);
      if (!user.username) throw new HttpError(400, "Set a display name with PATCH /api/me before sending messages");
      if (!await profiles.ownsUsername(user.id, user.username)) {
        throw new HttpError(409, "This username is already taken. Choose a different username before sending.");
      }

      const replyWithExisting = (message: Message) => {
        if (message.userId !== user.id || message.text !== input.text) {
          throw new HttpError(409, "This clientMessageId was already used for another submission");
        }
        return httpResult(200, { message: messageView(message) });
      };

      const existing = await messages.findRequest(room.id, input.clientMessageId);
      if (existing) return replyWithExisting(existing);
      const draft: Omit<Message, "id"> = {
        roomId: room.id,
        userId: user.id,
        clientMessageId: input.clientMessageId,
        username: user.username,
        text: input.text,
        createdAt: new Date(),
      };

      let message: Message;
      try {
        message = await messages.insert(draft);
      } catch (error) {
        if (error instanceof RoomUnavailableError) throw new HttpError(404, "Chatroom not found");
        if (!(error instanceof DuplicateKeyError)) throw error;
        const replay = await messages.findRequest(room.id, input.clientMessageId);
        if (!replay) throw error;
        return replyWithExisting(replay);
      }

      notify({
        type: "message.created",
        message: messageView(message),
        ...(room.createdBy ? { roomOwnerId: room.createdBy } : {}),
      });
      return httpResult(201, { message: messageView(message) });
    },

    async recentRooms(user: Actor, rawQuery: unknown) {
      const query = recentRoomsSchema.parse(rawQuery);
      const rows = await rooms.recent(user.id, query.limit);
      return httpResult(200, {
        rooms: rows.map(row => ({
          room: roomView(row.room),
          lastMessageAt: row.lastMessageAt.toISOString(),
          lastMessageId: row.lastMessageId,
        })),
      });
    },

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
      const roomId = objectIdSchema.parse(rawRoomId);
      const input = markReadSchema.parse(body);
      await requireRoom(roomId);
      const message = await messages.findById(roomId, input.messageId);
      if (!message) throw new HttpError(404, "Message not found in this chatroom");
      await reads.advance(user.id, roomId, { id: message.id, createdAt: message.createdAt });
      notify({ type: "room.read", roomId, userId: user.id });
      return httpResult(200, { roomId });
    },
  };
}
