import type { Request, Response } from "express";
import type { createAuthService } from "../services/auth.service.js";
import type { createSessionService } from "../services/session.service.js";
import type { createSessionCookies } from "../helpers/sessionCookie.js";
import { registerSchema, loginSchema } from "../schemas/auth.schema.js";

export function createAuthController(
  service: ReturnType<typeof createAuthService>,
  sessions: ReturnType<typeof createSessionService>,
  cookies: ReturnType<typeof createSessionCookies>,
) {
  return {
    async register(request: Request, response: Response) {
      const input = registerSchema.parse(request.body);
      const visitor = await sessions.findUser(request.headers.cookie);
      const user = await service.register(visitor, input);
      const token = await sessions.issue(request.headers.cookie, user.id, true);
      cookies.set(response, token);
      response.status(201).json({ user });
    },

    async login(request: Request, response: Response) {
      const user = await service.login(loginSchema.parse(request.body));
      const token = await sessions.issue(request.headers.cookie, user.id, true);
      cookies.set(response, token);
      response.json({ user });
    },

    async logout(request: Request, response: Response) {
      await sessions.revoke(request.headers.cookie);
      cookies.clear(response);
      response.json({ ok: true });
    },
  };
}
