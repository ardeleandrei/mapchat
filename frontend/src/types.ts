import { z } from "zod";

const id = z.string().regex(/^[a-f0-9]{24}$/i);
export const roomSchema = z.object({
  id, title: z.string(), createdBy: id.nullable(),
  color: z.string().regex(/^#[a-f0-9]{6}$/i).nullable().optional(),
  revision: z.number().int().nonnegative().optional(),
  location: z.object({ type: z.literal("Point"), coordinates: z.tuple([
    z.number().min(-180).max(180), z.number().min(-90).max(90),
  ]) }), createdAt: z.string().datetime(),
});
export const messageSchema = z.object({
  id, roomId: id, userId: id.nullable(), clientMessageId: z.string().uuid(),
  username: z.string(), text: z.string(), createdAt: z.string().datetime(),
});
export const liveSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ready"), userId: id }),
  z.object({ type: z.literal("rooms.subscribed"), requestId: z.string().uuid(), roomIds: z.array(id) }),
  z.object({ type: z.literal("subscribed"), requestId: z.string().uuid(), roomId: id }),
  z.object({ type: z.literal("unsubscribed"), requestId: z.string().uuid() }),
  z.object({ type: z.literal("room.created"), room: roomSchema }),
  z.object({ type: z.literal("room.updated"), room: roomSchema }),
  z.object({ type: z.literal("room.deleted"), roomId: id }),
  z.object({ type: z.literal("room.read"), roomId: id, userId: id }),
  z.object({ type: z.literal("message.created"), message: messageSchema }),
  z.object({ type: z.literal("error"), message: z.string(), requestId: z.string().uuid().optional() }),
]);
export type Room = z.infer<typeof roomSchema>;
export interface RecentChatroom { room: Room; lastMessageAt: string; lastMessageId: string }
export type Message = z.infer<typeof messageSchema>;
export type LiveEvent = z.infer<typeof liveSchema>;
export interface User { id: string; username: string; lastRoomId: string | null; createdAt: string; registered: boolean }
export interface HistoryPage {
  messages: Message[]; nextCursor: string | null; latestCursor: string | null;
  direction: "older" | "newer";
}
export type Connection = "connecting" | "online" | "reconnecting" | "offline";

export interface ChatWindowPosition { x: number; y: number }
