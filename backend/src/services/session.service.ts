import { randomBytes } from "node:crypto";
import type { SessionRepository } from "../types/session.types.js";
import { hashSessionToken, sessionHash, SESSION_DURATION_MS } from "../helpers/sessionCookie.js";

export function createSessionService(sessions: SessionRepository, revokeSocket: (hash: string) => void = () => {}) {
  async function findUser(cookie: string | undefined) {
    const hash = sessionHash(cookie);
    if (!hash) return null;
    const session = await sessions.activeSession(hash);
    if (!session) return null;
    const user = await sessions.user(session.userId);
    // An anonymous token cannot inherit authentication after registration.
    return user && user.registered === session.authenticated ? user : null;
  }

  async function revoke(cookie: string | undefined) {
    const hash = sessionHash(cookie);
    if (!hash) return;
    await sessions.deleteSession(hash);
    revokeSocket(hash);
  }

  async function issue(cookie: string | undefined, userId: string, authenticated: boolean) {
    const now = new Date();
    const token = randomBytes(32).toString("base64url");
    await sessions.insertSession({
      hash: hashSessionToken(token), userId, authenticated, createdAt: now,
      expiresAt: new Date(now.getTime() + SESSION_DURATION_MS),
    });
    await revoke(cookie);
    return token;
  }

  async function bootstrap(cookie: string | undefined) {
    const existing = await findUser(cookie);
    if (existing) return { user: existing, token: null };
    const user = await sessions.createGuest(new Date());
    const token = await issue(cookie, user.id, false);
    return { user, token };
  }

  return { findUser, issue, revoke, bootstrap };
}
