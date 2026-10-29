import type { Message, MessagePageQuery } from "./message.types.js";
import type { NearbyQuery, Room, RoomQuery } from "./room.types.js";
import type { User } from "./user.types.js";
export interface RoomRepository {
  exists(id: string): Promise<boolean>;
  findById(id: string, includeDeleted?: boolean): Promise<Room | null>;
  deleteOwned(id: string, userId: string): Promise<boolean>;
  findByKey(key: string): Promise<Room | null>;
  insert(room: Omit<Room, "id">): Promise<Room>;
  list(query: RoomQuery): Promise<Room[]>;
  nearby(query: NearbyQuery): Promise<Room[]>;
  nextNumber(): Promise<number>;
  update(id: string, userId: string, revision: number, changes: Partial<Pick<Room, "title" | "color">>): Promise<Room | null>;
}
export interface MessageRepository {
  findRequest(roomId: string, clientMessageId: string): Promise<Message | null>;
  insert(message: Omit<Message, "id">): Promise<Message>;
  // Return at most limit + 1 records in the requested traversal order.
  listByRoom(roomId: string, query: MessagePageQuery): Promise<Message[]>;
  listByUser(userId: string, query: MessagePageQuery): Promise<Message[]>;
}
export interface ProfileRepository {
  updateUser(id: string, changes: Partial<Pick<User, "username" | "lastRoomId">>): Promise<User | null>;
}
