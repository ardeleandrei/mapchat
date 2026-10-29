import { api } from "../clients/http.client";
import type { User } from "../types";
export const profileService = {
  get: () => api<{ user: User }>("/me"),

  update: (body: { username?: string; lastRoomId?: string | null }) => api<{ user: User }>("/me", "PATCH", body),
};
