import type { RoomRepository, MessageRepository } from "../types/repository.types.js";
import type { PublishEvent } from "../realtime.js";
import { createRoomService } from "./rooms.service.js";
import { createMessageService } from "./messages.service.js";

export function createChatService(repositories: { rooms: RoomRepository; messages: MessageRepository }, publish: PublishEvent) {
  return { ...createRoomService(repositories.rooms, publish), ...createMessageService(repositories.messages, repositories.rooms, publish) };
}
