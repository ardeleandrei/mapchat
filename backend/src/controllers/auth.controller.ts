import type { Request, Response } from "express";
import type { User } from "../types/user.types.js";
import type { createAuthService } from "../services/auth.service.js";
import { registerSchema, loginSchema } from "../schemas/auth.schema.js";

export interface AuthSessions {
  user(cookie: string | undefined): Promise<User | null>;
  replace(cookie: string | undefined, userId: string, response: Response): Promise<void>;
  logout(cookie: string | undefined, response: Response): Promise<void>;
}

export function createAuthController(service: ReturnType<typeof createAuthService>, sessions: AuthSessions) {
  return {
    async register(request: Request, response: Response) {
      const input = registerSchema.parse(request.body);
      const visitor = await sessions.user(request.headers.cookie);
      const user = await service.register(visitor, input);
      await sessions.replace(request.headers.cookie, user.id, response);
      response.status(201).json({ user });
    },

    async login(request: Request, response: Response) {
      const user = await service.login(loginSchema.parse(request.body));
      await sessions.replace(request.headers.cookie, user.id, response);
      response.json({ user });
    },

    async logout(request: Request, response: Response) {
      await sessions.logout(request.headers.cookie, response);
      response.json({ ok: true });
    },
  };
}
