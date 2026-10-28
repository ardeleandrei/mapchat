import { createHash, randomBytes } from "node:crypto";
import { Router, type Response } from "express";
import rateLimit from "express-rate-limit";
import { ObjectId } from "mongodb";
import { z } from "zod";
import type { Database, UserDocument } from "./db.js";

const COOKIE_NAME = "wolfchatter_session";
const SESSION_DURATION_MS = 180 * 24 * 60 * 60 * 1000;

const profileSchema = z.object({
  username: z.string().trim().min(1).max(40).optional(),
  lastRoomId: z.string()
    .regex(/^[a-f\d]{24}$/i, "Invalid room ID")
    .nullable()
    .optional(),
}).strict().refine(
  (value) =>
    value.username !== undefined ||
    value.lastRoomId !== undefined,
  "Provide username or lastRoomId",
);

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

export async function findSessionUser(
  database: Database,
  cookieHeader: string | undefined,
) {
  const token = readToken(cookieHeader);

  if (!token) return null;

  const session = await database.sessions.findOne({
    _id: hashToken(token),
    expiresAt: { $gt: new Date() },
  });

  if (!session) return null;

  return database.users.findOne({
    _id: session.userId,
  });
}

export function currentUser(response: Response): UserDocument {
  const user = response.locals.visitor as UserDocument | undefined;

  if (!user) {
    throw new Error("Session middleware must run before the API");
  }

  return user;
}

export function userView(user: UserDocument) {
  return {
    id: user._id.toHexString(),
    username: user.username,
    lastRoomId: user.lastRoomId?.toHexString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

export function createIdentity(database: Database) {
  const router = Router();

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

    if (origin && !allowedOrigins.has(origin)) {
      response.status(403).json({
        error: "Origin not allowed",
      });
      return;
    }

    next();
  });

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
      const token = randomBytes(32).toString("base64url");

      const newUser: UserDocument = {
        _id: new ObjectId(),
        username: "",
        lastRoomId: null,
        createdAt: now,
      };

      await database.users.insertOne(newUser);

      await database.sessions.insertOne({
        _id: hashToken(token),
        userId: newUser._id,
        createdAt: now,
        expiresAt: new Date(now.getTime() + SESSION_DURATION_MS),
      });

      response.cookie(COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: secureCookies,
        path: "/",
        maxAge: SESSION_DURATION_MS,
      });

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

    const changes: Partial<
      Pick<UserDocument, "username" | "lastRoomId">
    > = {};

    if (input.username !== undefined) {
      changes.username = input.username;
    }

    if (input.lastRoomId !== undefined) {
      changes.lastRoomId = input.lastRoomId === null
        ? null
        : new ObjectId(input.lastRoomId);

      if (changes.lastRoomId) {
        const room = await database.rooms.findOne({
          _id: changes.lastRoomId,
        });

        if (!room) {
          response.status(404).json({
            error: "Chatroom not found",
          });
          return;
        }
      }
    }

    const updated = await database.users.findOneAndUpdate(
      { _id: user._id },
      { $set: changes },
      { returnDocument: "after" },
    );

    if (!updated) {
      response.status(401).json({
        error: "User no longer exists. Call GET /api/me again.",
      });
      return;
    }

    response.locals.visitor = updated;

    response.json({
      user: userView(updated),
    });
  });

  return router;
}