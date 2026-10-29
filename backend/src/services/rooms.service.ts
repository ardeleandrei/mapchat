import type { Actor } from "../types/user.types.js";
import type { Room } from "../types/room.types.js";
import type { RoomRepository } from "../types/repository.types.js";
import { DuplicateKeyError } from "../errors/DuplicateKeyError.js";
import type { PublishEvent } from "../realtime.js";
import { HttpError } from "../errors/HttpError.js";
import { roomView } from "../helpers/responseMappers.js";
import { objectIdSchema, createRoomSchema, updateRoomSchema, listRoomsSchema, nearbySchema } from "../schemas/api.schemas.js";

import { httpResult } from "../helpers/httpResult.js";

export async function requireRoom(rooms: RoomRepository, value: unknown) {
  const room = await rooms.findById(objectIdSchema.parse(value));
  if (!room) throw new HttpError(404, "Chatroom not found");
  return room;
}

export function createRoomService(roomsRepository: RoomRepository, publish: PublishEvent) {
  const notify: PublishEvent = event => {
    try { publish(event); } catch { console.error("Live delivery failed; saved data remains available through history."); }
  };
  return {
  async listRooms(rawQuery: unknown) {
    const query = listRoomsSchema.parse(rawQuery);
    const rooms = await roomsRepository.list(query);

    return httpResult(200, {
      rooms: rooms.slice(0, query.limit).map(roomView),
      truncated: rooms.length > query.limit,
    });
  },

  async nearbyRooms(rawQuery: unknown) {
    const query = nearbySchema.parse(rawQuery);

    const rooms = await roomsRepository.nearby(query);

    return httpResult(200, {
      rooms: rooms.map(roomView),
    });
  },

  async getRoom(roomId: unknown) {
    const room = await requireRoom(roomsRepository,
      roomId,
    );

    return httpResult(200, {
      room: roomView(room),
    });
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
        throw new HttpError(
          409,
          "This creationKey was already used for another submission",
        );
      }

      return httpResult(200, {
        room: roomView(room),
      });
    };

    const existing = await roomsRepository.findByKey(input.creationKey);

    if (existing) {
      if (existing.deletedAt) throw new HttpError(410, "This chatroom was deleted");
      return replyWithExisting(existing);
    }

    const counter = await roomsRepository.nextNumber();

    if (!counter) {
      throw new Error("Could not allocate a chatroom number");
    }

    const draft: Omit<Room, "id"> = {
      title: input.title ?? `Chatroom ${counter}`,
      ...(input.title === undefined ? {} : { creationTitle: input.title }),
      revision: 0,
      creationKey: input.creationKey,
      createdBy: user.id,
      location: {
        type: "Point",
        coordinates: [input.longitude, input.latitude],
      },
      createdAt: new Date(),
    };

    let room: Room;
    try {
      room = await roomsRepository.insert(draft);
    } catch (error) {
      if (!(error instanceof DuplicateKeyError)) throw error;

      const replay = await roomsRepository.findByKey(input.creationKey);

      if (!replay) throw error;
      if (replay.deletedAt) throw new HttpError(410, "This chatroom was deleted");

      return replyWithExisting(replay);
    }

    notify({ type: "room.created", room: roomView(room) });
    return httpResult(201, {
      room: roomView(room),
    });
  },

  async updateRoom(user: Actor, roomId: unknown, body: unknown) {
    const input = updateRoomSchema.parse(body);
    const room = await requireRoom(roomsRepository, roomId);
    if (room.createdBy !== user.id) throw new HttpError(403, "Only the room creator can edit this chatroom");
    const { revision } = input;
    const changes: Partial<Pick<Room, "title" | "color">> = {};
    if (input.title !== undefined) changes.title = input.title;
    if (input.color !== undefined) changes.color = input.color;
    const updated = await roomsRepository.update(room.id, user.id, revision, changes);
    if (!updated) throw new HttpError(409, "This room has changed. Reopen its settings and try again.");
    notify({ type: "room.updated", room: roomView(updated) });
    return httpResult(200, { room: roomView(updated) });
  },

  async deleteRoom(user: Actor, roomId: unknown) {
    const id = objectIdSchema.parse(roomId);
    const room = await roomsRepository.findById(id, true);
    if (!room) throw new HttpError(404, "Chatroom not found");
    if (room.createdBy !== user.id) throw new HttpError(403, "Only the room creator can delete this chatroom");
    if (!await roomsRepository.deleteOwned(room.id, user.id)) throw new HttpError(404, "Chatroom not found");
    notify({ type: "room.deleted", roomId: room.id });
    return httpResult(200, { roomId: room.id });
  },
  };
}
