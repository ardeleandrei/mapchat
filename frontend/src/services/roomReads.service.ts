import { api } from "../clients/http.client";

export const roomReadsService = {
  counts: (roomIds: string[]) => api<{ rooms: { roomId: string; unreadCount: number }[] }>("/me/unread?roomIds=" + roomIds.join(",")),

  mark: (roomId: string, messageId: string) => api<{ roomId: string }>("/rooms/" + roomId + "/read", "POST", { messageId }),
};
