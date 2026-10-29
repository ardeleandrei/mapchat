import { MongoClient, type ObjectId } from "mongodb";

export interface UserDocument {
  _id: ObjectId;
  username: string;
  lastRoomId: ObjectId | null;
  createdAt: Date;
}

export interface SessionDocument {
  // SHA-256 hash of the cookie token.
  _id: string;
  userId: ObjectId;
  createdAt: Date;
  expiresAt: Date;
}

export interface RoomDocument {
  deletedAt?: Date;
  _id: ObjectId;
  title: string;
  creationTitle?: string;
  color?: string;
  revision?: number;
  creationKey: string;
  createdBy?: ObjectId;
  location: {
    type: "Point";
    coordinates: [number, number];
  };
  createdAt: Date;
}

export interface MessageDocument {
  _id: ObjectId;
  roomId: ObjectId;
  userId?: ObjectId;
  clientMessageId: string;
  username: string;
  text: string;
  createdAt: Date;
}

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

    await Promise.all([
      sessions.createIndex(
        { expiresAt: 1 },
        {
          name: "session_expiry",
          expireAfterSeconds: 0,
        },
      ),
      rooms.createIndexes([
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
    };
  } catch (error) {
    await client.close().catch(() => undefined);
    throw error;
  }
}

export type Database = Awaited<ReturnType<typeof connectDatabase>>;
