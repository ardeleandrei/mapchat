import { createRoomRepository } from "./repositories/rooms.repository.js";
import { createProfileRepository } from "./repositories/profile.repository.js";
import { createIdentityRepository } from "./repositories/identity.repository.js";
import { profileSchema } from "./schemas/profile.schema.js";
import { createProfileService } from "./services/profile.service.js";
import { createHash, randomBytes } from "node:crypto";
import { Router, type Response } from "express";
import rateLimit from "express-rate-limit";
import { ObjectId } from "mongodb";
import { z } from "zod";
import type { Database, UserDocument } from "./db.js";
import { toUser } from "./helpers/documentMappers.js";
import { createAuthRepository } from "./repositories/auth.repository.js";
import { createAuthService } from "./services/auth.service.js";
import { createAuthController } from "./controllers/auth.controller.js";
import { createAuthRoutes } from "./routes/auth.routes.js";

const COOKIE_NAME = "wolfchatter_session";
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function readToken(cookieHeader: string | undefined) {
  const prefix = `${COOKIE_NAME}=`;

  const cookie = cookieHeader
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));

  const token = cookie?.slice(prefix.length);

  return token && /^[A-Za-z0-9_-]{43}$/.test(token)
    ? token
    : null;
}

export function sessionHash(cookieHeader: string | undefined) {
  const token = readToken(cookieHeader);
  return token ? hashToken(token) : null;
}

export async function findSessionUser(
  database: Database,
  cookieHeader: string | undefined,
) {
  const token = readToken(cookieHeader);

  if (!token) return null;

  const session = await createIdentityRepository(database).activeSession(hashToken(token));

  if (!session) return null;

  const user = await createIdentityRepository(database).user(session.userId);
  // A previously issued anonymous token cannot become authenticated by registration.
  if (Boolean(user?.passwordHash) !== Boolean(session.authenticated)) return null;
  return user;
}

export function currentUser(response: Response): UserDocument {
  const user = response.locals.visitor as UserDocument | undefined;

  if (!user) {
    throw new Error("Session middleware must run before the API");
  }

  return user;
}

export function userView(user: UserDocument) {
  const profile = toUser(user);
  return { ...profile, createdAt: profile.createdAt.toISOString() };
}

export function createIdentity(database: Database, revokeLiveSession: (hash: string) => void = () => {}) {
  const router = Router();
  const identities = createIdentityRepository(database);
  const profileService = createProfileService(createProfileRepository(database), createRoomRepository(database));

  const secureCookies = z.enum(["true", "false"]).parse(
    process.env.COOKIE_SECURE ??
      (process.env.NODE_ENV === "production" ? "true" : "false"),
  ) === "true";

  const allowedOrigins = new Set(
    (
      process.env.ALLOWED_ORIGINS ??
      [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
      ].join(",")
    )
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );

  router.use((request, response, next) => {
    response.setHeader("Cache-Control", "no-store");

    const origin = request.get("Origin");

    if ((origin && !allowedOrigins.has(origin)) || request.get("Sec-Fetch-Site") === "cross-site") {
      response.status(403).json({
        error: "Origin not allowed",
      });
      return;
    }

    // A custom header makes cross-site mutations require a CORS preflight, which
    // this same-origin API does not allow. Apply it to login and logout as well.
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && request.get("X-Wolfchatter-Request") !== "1") {
      response.status(403).json({ error: "Missing request protection header" });
      return;
    }

    next();
  });

  const cookieOptions = { httpOnly: true, sameSite: "lax" as const, secure: secureCookies, path: "/" };

  async function revoke(cookie: string | undefined) {
    const hash = sessionHash(cookie);
    if (!hash) return;
    await identities.deleteSession(hash);
    revokeLiveSession(hash);
  }

  async function issue(cookie: string | undefined, userId: ObjectId, authenticated: boolean, response: Response) {
    const now = new Date(), token = randomBytes(32).toString("base64url");
    await identities.insertSession({
      _id: hashToken(token), userId, authenticated, createdAt: now,
      expiresAt: new Date(now.getTime() + SESSION_DURATION_MS),
    });
    await revoke(cookie);
    response.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: SESSION_DURATION_MS });
  }

  router.use("/auth", createAuthRoutes(createAuthController(createAuthService(createAuthRepository(database)), {
    async user(cookie) {
      const user = await findSessionUser(database, cookie);
      return user ? toUser(user) : null;
    },

    replace: (cookie, userId, response) => issue(cookie, new ObjectId(userId), true, response),

    async logout(cookie, response) {
      await revoke(cookie);
      response.clearCookie(COOKIE_NAME, cookieOptions);
    },
  })));

  const bootstrapLimiter = rateLimit({
    windowMs: 60_000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      error: "Too many session requests",
    },
  });

  router.get("/me", bootstrapLimiter, async (request, response) => {
    let user = await findSessionUser(
      database,
      request.headers.cookie,
    );

    if (!user) {
      const now = new Date();

      const newUser: UserDocument = {
        _id: new ObjectId(),
        username: "",
        lastRoomId: null,
        createdAt: now,
      };

      await identities.insertUser(newUser);
      await issue(request.headers.cookie, newUser._id, false, response);

      user = newUser;
    }

    response.json({
      user: userView(user),
    });
  });

  // All remaining API routes require an initialized session.
  router.use(async (request, response, next) => {
    const user = await findSessionUser(
      database,
      request.headers.cookie,
    );

    if (!user) {
      response.status(401).json({
        error: "Session missing or expired. Call GET /api/me first.",
      });
      return;
    }

    response.locals.visitor = user;
    next();
  });

  const profileLimiter = rateLimit({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      error: "Too many profile updates",
    },
  });

  router.patch("/me", profileLimiter, async (request, response) => {
    const user = currentUser(response);
    const input = profileSchema.parse(request.body);
    if (input.username !== undefined && !user.passwordHash) {
      response.status(403).json({ error: "Create an account before choosing a username." });
      return;
    }

    const updated = await profileService.update({ id: user._id.toHexString(), username: user.username }, input);


    response.json({
      user: { ...updated, createdAt: updated.createdAt.toISOString() },
    });
  });

  return router;
}
