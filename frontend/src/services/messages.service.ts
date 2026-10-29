import { api } from "../clients/http.client";
import type { HistoryPage, Message } from "../types";
export const messagesService = {
  history: (id: string, limit: number, cursor?: { before?: string; after?: string }) => {
    const query = new URLSearchParams({ limit: String(limit), ...cursor });
    return api<HistoryPage>("/rooms/" + id + "/messages?" + query);
  },

  send: (id: string, body: { text: string; clientMessageId: string }) => api<{ message: Message }>("/rooms/" + id + "/messages", "POST", body),
};
