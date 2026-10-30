import { api } from "../clients/http.client";
import type { Room, RecentChatroom } from "../types";
export const roomsService = {
  recent: () => api<{ rooms: RecentChatroom[] }>("/me/rooms/recent"),

  mine: (after?: string) => api<{ rooms: Room[]; nextCursor: string | null }>("/me/rooms" + (after ? "?after=" + after : "")),

  remove: (id: string) => api<{ roomId: string }>("/rooms/" + id, "DELETE"),

  list: (bounds: string) => api<{ rooms: Room[]; truncated: boolean }>("/rooms" + (bounds ? "?bbox=" + encodeURIComponent(bounds) : "")),

  get: (id: string) => api<{ room: Room }>("/rooms/" + id),

  create: (body: { longitude: number; latitude: number; creationKey: string; title?: string }) => api<{ room: Room }>("/rooms", "POST", body),

  update: (room: Room, title: string, color: string) => api<{ room: Room }>("/rooms/" + room.id, "PATCH", { title: title.trim(), color, revision: room.revision ?? 0 }),
};
