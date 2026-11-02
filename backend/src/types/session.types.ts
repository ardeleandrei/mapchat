import type { User } from "./user.types.js";

export interface Session {
  hash: string;
  userId: string;
  authenticated: boolean;
  createdAt: Date;
  expiresAt: Date;
}

export interface SessionRepository {
  activeSession(hash: string): Promise<Session | null>;
  user(id: string): Promise<User | null>;
  createGuest(createdAt: Date): Promise<User>;
  insertSession(session: Session): Promise<void>;
  deleteSession(hash: string): Promise<void>;
}
