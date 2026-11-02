import { createHash } from "node:crypto";
import type { Response } from "express";
import { z } from "zod";

export const SESSION_COOKIE_NAME = "wolfchatter_session";
export const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function sessionHash(cookieHeader: string | undefined) {
  const prefix = `${SESSION_COOKIE_NAME}=`;
  const cookie = cookieHeader?.split(";").map(part => part.trim()).find(part => part.startsWith(prefix));
  const token = cookie?.slice(prefix.length);
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? hashSessionToken(token) : null;
}

export function createSessionCookies() {
  const secure = z.enum(["true", "false"]).parse(
    process.env.COOKIE_SECURE ?? (process.env.NODE_ENV === "production" ? "true" : "false"),
  ) === "true";
  const options = { httpOnly: true, sameSite: "lax" as const, secure, path: "/" };

  return {
    set(response: Response, token: string) {
      response.cookie(SESSION_COOKIE_NAME, token, { ...options, maxAge: SESSION_DURATION_MS });
    },

    clear(response: Response) {
      response.clearCookie(SESSION_COOKIE_NAME, options);
    },
  };
}
