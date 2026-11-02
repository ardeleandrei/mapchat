import type { ObjectId } from "mongodb";

export interface CounterDocument {
  _id: string;
  value: number;
}

export interface UserDocument {
  _id: ObjectId;
  username: string;
  usernameKey?: string;
  passwordHash?: string;
  lastRoomId: ObjectId | null;
  createdAt: Date;
}

export interface SessionDocument {
  // SHA-256 hash of the cookie token.
  _id: string;
  userId: ObjectId;
  createdAt: Date;
  expiresAt: Date;
  authenticated?: boolean;
}

export interface RoomReadDocument {
  _id: ObjectId;
  userId: ObjectId;
  roomId: ObjectId;
  readThrough: { createdAt: Date; id: ObjectId };
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
