import { api } from "../clients/http.client";
import type { User } from "../types";

export const authService = {
  register: (username: string, password: string) => api<{ user: User }>("/auth/register", "POST", { username, password }),

  login: (username: string, password: string) => api<{ user: User }>("/auth/login", "POST", { username, password }),

  logout: () => api<{ ok: true }>("/auth/logout", "POST", {}),
};
