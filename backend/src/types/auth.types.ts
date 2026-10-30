import type { User } from "./user.types.js";

export interface AuthRepository {
  credentials(username: string): Promise<{ user: User; passwordHash: string } | null>;
  register(id: string | null, username: string, passwordHash: string): Promise<User | null>;
}
