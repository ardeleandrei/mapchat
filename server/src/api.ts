import { Router, type ErrorRequestHandler } from "express";
import rateLimit from "express-rate-limit";
import {
  MongoServerError,
  ObjectId,
  type Filter,
} from "mongodb";
import { z, ZodError } from "zod";
import type {
  Database,
  MessageDocument,
  RoomDocument,
} from "./db.js";
import { currentUser } from "./identity.js";

class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const objectIdSchema = z.string().regex(
  /^[a-f\d]{24}$/i,
  "Invalid ID",
);

const longitude = z.number().min(-180).max(180);
const latitude = z.number().min(-90).max(90);

const createRoomSchema = z.object({
  longitude,
  latitude,
  creationKey: z.string().uuid(),
}).strict();

const createMessageSchema = z.object({
  text: z.string().trim().min(1).max(2000),
  clientMessageId: z.string().uuid(),
}).strict();

const boundsSchema = z.string()
  .transform((value) =>
    value.split(",").map((part) =>
      part.trim() === "" ? NaN : Number(part),
    ),
  )
  .pipe(z.tuple([
    longitude,
    latitude,
    longitude,
    latitude,
  ]))
  .refine(
    ([, south, , north]) => south < north,
    "South must be less than north",
  );

const listRoomsSchema = z.object({
  bbox: boundsSchema.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(500),
}).strict();

const nearbySchema = z.object({
  longitude: z.coerce.number().min(-180).max(180),
  latitude: z.coerce.number().min(-90).max(90),
  radius: z.coerce.number().positive().max(100_000).default(5000),
  limit: z.coerce.number().int().min(1).max(100).default(100),
}).strict();

const historySchema = z.object({
  before: z.string().min(1).max(512).optional(),
  after: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict().refine(
  (value) => !(value.before && value.after),
  "Use either before or after, not both",
);

const cursorSchema = z.object({
  id: objectIdSchema,
  createdAt: z.string().datetime(),
});

export function roomView(room: RoomDocument) {
  return {
    id: room._id.toHexString(),
    title: room.title,
    createdBy: room.createdBy?.toHexString() ?? null,
    location: room.location,
    createdAt: room.createdAt.toISOString(),
  };
}

export function messageView(message: MessageDocument) {
  return {
    id: message._id.toHexString(),
    roomId: message.roomId.toHexString(),
    userId: message.userId?.toHexString() ?? null,
    clientMessageId: message.clientMessageId,
    username: message.username,
    text: message.text,
    createdAt: message.createdAt.toISOString(),
  };
}

function encodeCursor(message: MessageDocument) {
  return Buffer.from(JSON.stringify({
    id: message._id.toHexString(),
    createdAt: message.createdAt.toISOString(),
  })).toString("base64url");
}

function decodeCursor(value: string) {
  try {
    const cursor = cursorSchema.parse(
      JSON.parse(Buffer.from(value, "base64url").toString("utf8")),
    );

    return {
      id: new ObjectId(cursor.id),
      createdAt: new Date(cursor.createdAt),
    };
  } catch {
    throw new HttpError(400, "Invalid message cursor");
  }
}

function isDuplicate(error: unknown) {
  return error instanceof MongoServerError && error.code === 11000;
}

async function requireRoom(database: Database, value: unknown) {
  const id = new ObjectId(objectIdSchema.parse(value));
  const room = await database.rooms.findOne({ _id: id });

  if (!room) {
    throw new HttpError(404, "Chatroom not found");
  }

  return room;
}

async function readMessages(
  database: Database,
  filter: Filter<MessageDocument>,
  rawQuery: unknown,
) {
  const query = historySchema.parse(rawQuery);
  const forward = Boolean(query.after);
  const rawCursor = query.before ?? query.after;

  if (rawCursor) {
    const cursor = decodeCursor(rawCursor);

    const dateComparison = forward
      ? { $gt: cursor.createdAt }
      : { $lt: cursor.createdAt };

    const idComparison = forward
      ? { $gt: cursor.id }
      : { $lt: cursor.id };

    filter.$or = [
      { createdAt: dateComparison },
      { createdAt: cursor.createdAt, _id: idComparison },
    ];
  }

  const direction = forward ? 1 : -1;

  const rows = await database.messages
    .find(filter)
    .sort({ createdAt: direction, _id: direction })
    .limit(query.limit + 1)
    .toArray();

  const page = rows.slice(0, query.limit);
  const continuation = page.at(-1);

  const nextCursor = rows.length > query.limit && continuation
    ? encodeCursor(continuation)
    : null;

  // Always return messages in display order: oldest to newest.
  if (!forward) page.reverse();

  const newest = page.at(-1);

  return {
    messages: page.map(messageView),
    nextCursor,
    latestCursor: newest ? encodeCursor(newest) : null,
    direction: forward ? "newer" : "older",
  };
}

export function createApi(database: Database) {
  const router = Router();

  router.use((_request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    next();
  });

  router.use(rateLimit({
    windowMs: 60_000,
    limit: 60,
    skip: (request) => request.method === "GET",
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      error: "Too many requests. Try again shortly.",
    },
  }));

  // Messages belonging to the current visitor, across all rooms.
  router.get("/me/messages", async (request, response) => {
    const user = currentUser(response);

    response.json(await readMessages(
      database,
      { userId: user._id },
      request.query,
    ));
  });

  // Map pins, optionally restricted to a viewport.
  router.get("/rooms", async (request, response) => {
    const query = listRoomsSchema.parse(request.query);
    const filter: Filter<RoomDocument> = {};

    if (query.bbox) {
      const [west, south, east, north] = query.bbox;

      filter["location.coordinates.1"] = {
        $gte: south,
        $lte: north,
      };

      if (west <= east) {
        filter["location.coordinates.0"] = {
          $gte: west,
          $lte: east,
        };
      } else {
        // The viewport crosses the antimeridian.
        filter.$or = [
          { "location.coordinates.0": { $gte: west } },
          { "location.coordinates.0": { $lte: east } },
        ];
      }
    }

    const rooms = await database.rooms
      .find(filter)
      .sort({ _id: 1 })
      .limit(query.limit + 1)
      .toArray();

    response.json({
      rooms: rooms.slice(0, query.limit).map(roomView),
      truncated: rooms.length > query.limit,
    });
  });

  // Nearby rooms, sorted by distance. Radius is in metres.
  router.get("/rooms/nearby", async (request, response) => {
    const query = nearbySchema.parse(request.query);

    const rooms = await database.rooms.find({
      location: {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [query.longitude, query.latitude],
          },
          $maxDistance: query.radius,
        },
      },
    }).limit(query.limit).toArray();

    response.json({
      rooms: rooms.map(roomView),
    });
  });

  router.get("/rooms/:roomId", async (request, response) => {
    const room = await requireRoom(
      database,
      request.params.roomId,
    );

    response.json({
      room: roomView(room),
    });
  });

  router.post("/rooms", async (request, response) => {
    const input = createRoomSchema.parse(request.body);
    const user = currentUser(response);

    const replyWithExisting = (room: RoomDocument) => {
      const [lng, lat] = room.location.coordinates;

      if (
        !room.createdBy?.equals(user._id) ||
        lng !== input.longitude ||
        lat !== input.latitude
      ) {
        throw new HttpError(
          409,
          "This creationKey was already used for another submission",
        );
      }

      response.status(200).json({
        room: roomView(room),
      });
    };

    const existing = await database.rooms.findOne({
      creationKey: input.creationKey,
    });

    if (existing) {
      replyWithExisting(existing);
      return;
    }

    const counter = await database.db.collection<{
      _id: string;
      value: number;
    }>("counters").findOneAndUpdate(
      { _id: "roomNumber" },
      { $inc: { value: 1 } },
      { upsert: true, returnDocument: "after" },
    );

    if (!counter) {
      throw new Error("Could not allocate a chatroom number");
    }

    const room: RoomDocument = {
      _id: new ObjectId(),
      title: `Chatroom ${counter.value}`,
      creationKey: input.creationKey,
      createdBy: user._id,
      location: {
        type: "Point",
        coordinates: [input.longitude, input.latitude],
      },
      createdAt: new Date(),
    };

    try {
      await database.rooms.insertOne(room);
    } catch (error) {
      if (!isDuplicate(error)) throw error;

      const replay = await database.rooms.findOne({
        creationKey: input.creationKey,
      });

      if (!replay) throw error;

      replyWithExisting(replay);
      return;
    }

    response.status(201).json({
      room: roomView(room),
    });
  });

  router.get("/rooms/:roomId/messages", async (request, response) => {
    const room = await requireRoom(
      database,
      request.params.roomId,
    );

    response.json(await readMessages(
      database,
      { roomId: room._id },
      request.query,
    ));
  });

  router.post("/rooms/:roomId/messages", async (request, response) => {
    const user = currentUser(response);
    const room = await requireRoom(
      database,
      request.params.roomId,
    );
    const input = createMessageSchema.parse(request.body);

    if (!user.username) {
      throw new HttpError(
        400,
        "Set a display name with PATCH /api/me before sending messages",
      );
    }

    const replyWithExisting = (message: MessageDocument) => {
      if (
        !message.userId?.equals(user._id) ||
        message.text !== input.text
      ) {
        throw new HttpError(
          409,
          "This clientMessageId was already used for another submission",
        );
      }

      response.status(200).json({
        message: messageView(message),
      });
    };

    const existing = await database.messages.findOne({
      roomId: room._id,
      clientMessageId: input.clientMessageId,
    });

    if (existing) {
      replyWithExisting(existing);
      return;
    }

    const message: MessageDocument = {
      _id: new ObjectId(),
      roomId: room._id,
      userId: user._id,
      clientMessageId: input.clientMessageId,
      username: user.username,
      text: input.text,
      createdAt: new Date(),
    };

    try {
      await database.messages.insertOne(message);
    } catch (error) {
      if (!isDuplicate(error)) throw error;

      const replay = await database.messages.findOne({
        roomId: room._id,
        clientMessageId: input.clientMessageId,
      });

      if (!replay) throw error;

      replyWithExisting(replay);
      return;
    }

    response.status(201).json({
      message: messageView(message),
    });
  });

  return router;
}

export const handleApiError: ErrorRequestHandler = (
  error: unknown,
  _request,
  response,
  next,
) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  if (error instanceof ZodError) {
    response.status(400).json({
      error: "Invalid request",
      issues: error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }

  if (error instanceof HttpError) {
    response.status(error.status).json({
      error: error.message,
    });
    return;
  }

  if (error && typeof error === "object" && "type" in error) {
    if (error.type === "entity.parse.failed") {
      response.status(400).json({
        error: "Invalid JSON body",
      });
      return;
    }

    if (error.type === "entity.too.large") {
      response.status(413).json({
        error: "Request body is too large",
      });
      return;
    }
  }

  console.error("Request failed:", error);

  response.status(500).json({
    error: "An unexpected server error occurred",
  });
};