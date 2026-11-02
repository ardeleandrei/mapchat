import type { RoomDocument, MessageDocument, UserDocument } from "../types/document.types.js";
import type { Room } from "../types/room.types.js";
import type { Message } from "../types/message.types.js";
import type { User } from "../types/user.types.js";

export function toRoom(document: RoomDocument): Room {
  const { _id, createdBy, ...rest } = document;
  return { ...rest, id: _id.toHexString(), ...(createdBy ? { createdBy: createdBy.toHexString() } : {}), revision: document.revision ?? 0 };
}

export function toMessage(document: MessageDocument): Message {
  const { _id, roomId, userId, ...rest } = document;
  return { ...rest, id: _id.toHexString(), roomId: roomId.toHexString(), ...(userId ? { userId: userId.toHexString() } : {}) };
}

export function toUser(document: UserDocument): User {
  // Explicit public fields prevent credentials leaking through a future spread.
  return {
    id: document._id.toHexString(),
    username: document.username,
    lastRoomId: document.lastRoomId?.toHexString() ?? null,
    createdAt: document.createdAt,
    registered: Boolean(document.passwordHash),
  };
}
