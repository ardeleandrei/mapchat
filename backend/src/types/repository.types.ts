import type { Message, MessageCursor, MessagePageQuery } from "./message.types.js";
import type { NearbyQuery, Room, RoomQuery } from "./room.types.js";
import type { User } from "./user.types.js";
export interface RoomRepository {
  exists(id: string): Promise<boolean>;
  findById(id: string, includeDeleted?: boolean): Promise<Room | null>;
  deleteOwned(id: string, userId: string): Promise<boolean>;
  findByKey(key: string): Promise<Room | null>;
  insert(room: Omit<Room, "id">): Promise<Room>;
  list(query: RoomQuery): Promise<Room[]>;
  listOwned(userId: string, after: string | undefined, limit: number): Promise<Room[]>;
  recent(userId: string, limit: number): Promise<{ room: Room; lastMessageAt: Date; lastMessageId: string }[]>;
  nearby(query: NearbyQuery): Promise<Room[]>;
  nextNumber(): Promise<number>;
  update(id: string, userId: string, revision: number, changes: Partial<Pick<Room, "title" | "color">>): Promise<Room | null>;
}
export interface MessageRepository {
  findById(roomId: string, id: string): Promise<Message | null>;
  findRequest(roomId: string, clientMessageId: string): Promise<Message | null>;
  insert(message: Omit<Message, "id">): Promise<Message>;
  // Return at most limit + 1 records in the requested traversal order.
  listByRoom(roomId: string, query: MessagePageQuery): Promise<Message[]>;
  listByUser(userId: string, query: MessagePageQuery): Promise<Message[]>;
}

export interface RoomReadRepository {
  counts(userId: string, roomIds: string[]): Promise<{ roomId: string; unreadCount: number }[]>;
  advance(userId: string, roomId: string, cursor: MessageCursor): Promise<void>;
}
export interface ProfileRepository {
  ownsUsername(id: string, username: string): Promise<boolean>;
  updateUser(id: string, changes: Partial<Pick<User, "username" | "lastRoomId">>): Promise<User | null>;
}
