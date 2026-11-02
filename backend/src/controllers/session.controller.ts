import type { Request, Response } from "express";
import type { createSessionService } from "../services/session.service.js";
import type { createSessionCookies } from "../helpers/sessionCookie.js";

export function createSessionController(
  sessions: ReturnType<typeof createSessionService>,
  cookies: ReturnType<typeof createSessionCookies>,
) {
  return {
    async bootstrap(request: Request, response: Response) {
      const { user, token } = await sessions.bootstrap(request.headers.cookie);
      if (token) cookies.set(response, token);
      response.json({ user });
    },
  };
}
