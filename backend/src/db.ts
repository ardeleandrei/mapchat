import { MongoClient } from "mongodb";
import type {
  UserDocument,
  SessionDocument,
  RoomReadDocument,
  RoomDocument,
  MessageDocument,
} from "./types/document.types.js";

export async function connectDatabase(uri: string) {
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 5000,
    maxPoolSize: 10,
  });

  try {
    await client.connect();

    const db = client.db();
    const users = db.collection<UserDocument>("users");
    const sessions = db.collection<SessionDocument>("sessions");
    const rooms = db.collection<RoomDocument>("rooms");
    const messages = db.collection<MessageDocument>("messages");
    const roomReads = db.collection<RoomReadDocument>("roomReads");

    await Promise.all([
      roomReads.createIndex({ userId: 1, roomId: 1 }, { unique: true, name: "user_room_read" }),
      users.createIndex({ usernameKey: 1 }, {
        name: "unique_username",
        unique: true,
        partialFilterExpression: { usernameKey: { $type: "string" } },
      }),
      sessions.createIndex(
        { expiresAt: 1 },
        {
          name: "session_expiry",
          expireAfterSeconds: 0,
        },
      ),
      rooms.createIndexes([
        { key: { createdBy: 1, _id: 1 }, name: "creator_rooms" },
        {
          key: { location: "2dsphere" },
          name: "room_location",
        },
        {
          key: { creationKey: 1 },
          name: "room_creation_key",
          unique: true,
        },
      ]),
      messages.createIndexes([
        {
          key: { roomId: 1, createdAt: -1, _id: -1 },
          name: "room_message_history",
        },
        {
          key: { roomId: 1, clientMessageId: 1 },
          name: "room_message_request",
          unique: true,
        },
        {
          key: { userId: 1, createdAt: -1, _id: -1 },
          name: "user_message_history",
        },
      ]),
    ]);

    console.log(`MongoDB connected; indexes ready in ${db.databaseName}`);

    return {
      client,
      db,
      users,
      sessions,
      rooms,
      messages,
      roomReads,
    };
  } catch (error) {
    await client.close().catch(() => undefined);
    throw error;
  }
}

export type Database = Awaited<ReturnType<typeof connectDatabase>>;
