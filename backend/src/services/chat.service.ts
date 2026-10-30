import type { RoomRepository, MessageRepository, ProfileRepository, RoomReadRepository } from "../types/repository.types.js";
import type { PublishEvent } from "../realtime.js";
import { createRoomService } from "./rooms.service.js";
import { createMessageService } from "./messages.service.js";
import { createRoomReadService } from "./roomReads.service.js";

export function createChatService(repositories: { rooms: RoomRepository; messages: MessageRepository; profiles: ProfileRepository; reads: RoomReadRepository }, publish: PublishEvent) {
  return { ...createRoomService(repositories.rooms, publish), ...createMessageService(repositories.messages, repositories.rooms, publish, repositories.profiles),
    ...createRoomReadService(repositories.rooms, repositories.messages, repositories.reads, publish) };
}
