import type { ObjectId } from "mongodb";
import type { Database, UserDocument, SessionDocument } from "../db.js";

export function createIdentityRepository(database: Database) { return {
  activeSession: (hash: string) => database.sessions.findOne({ _id: hash, expiresAt: { $gt: new Date() } }),

  user: (id: ObjectId) => database.users.findOne({ _id: id }),

  insertUser: (user: UserDocument) => database.users.insertOne(user),

  insertSession: (session: SessionDocument) => database.sessions.insertOne(session),
}; }
