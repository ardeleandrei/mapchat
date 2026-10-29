import type { Room } from "../types/room.types.js";
import type { Message } from "../types/message.types.js";

export function roomView(room: Room) {
  return {
    id: room.id,
    title: room.title,
    color: room.color ?? null,
    revision: room.revision ?? 0,
    createdBy: room.createdBy ?? null,
    location: room.location,
    createdAt: room.createdAt.toISOString(),
  };
}

export function messageView(message: Message) {
  return {
    id: message.id,
    roomId: message.roomId,
    userId: message.userId ?? null,
    clientMessageId: message.clientMessageId,
    username: message.username,
    text: message.text,
    createdAt: message.createdAt.toISOString(),
  };
}

