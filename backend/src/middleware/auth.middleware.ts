import type { RequestHandler, Response } from "express";
import type { User } from "../types/user.types.js";
import type { createSessionService } from "../services/session.service.js";

export function currentUser(response: Response): User {
  const user = response.locals.visitor as User | undefined;
  if (!user) throw new Error("Session middleware must run before the API");
  return user;
}

export function createAuthMiddleware(sessions: ReturnType<typeof createSessionService>): RequestHandler {
  return async (request, response, next) => {
    const user = await sessions.findUser(request.headers.cookie);
    if (!user) {
      response.status(401).json({ error: "Session missing or expired. Call GET /api/me first." });
      return;
    }
    response.locals.visitor = user;
    next();
  };
}

export function createRequestProtection(): RequestHandler {
  const allowedOrigins = new Set((process.env.ALLOWED_ORIGINS ?? [
    "http://localhost:3000", "http://127.0.0.1:3000",
    "http://localhost:5173", "http://127.0.0.1:5173",
  ].join(",")).split(",").map(origin => origin.trim()).filter(Boolean));

  return (request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    const origin = request.get("Origin");
    if ((origin && !allowedOrigins.has(origin)) || request.get("Sec-Fetch-Site") === "cross-site") {
      response.status(403).json({ error: "Origin not allowed" });
      return;
    }
    // Same-origin custom headers also protect login/logout from cross-site writes.
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && request.get("X-Wolfchatter-Request") !== "1") {
      response.status(403).json({ error: "Missing request protection header" });
      return;
    }
    next();
  };
}
