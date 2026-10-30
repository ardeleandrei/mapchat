import { randomBytes } from "node:crypto";
import type { AuthRepository } from "../types/auth.types.js";
import type { User } from "../types/user.types.js";
import { DuplicateKeyError } from "../errors/DuplicateKeyError.js";
import { HttpError } from "../errors/HttpError.js";
import { hashPassword, verifyPassword } from "../helpers/password.js";

// Unknown usernames still perform a password verification to reduce timing leaks.
const dummyHash = hashPassword(randomBytes(32).toString("base64url"));

export function createAuthService(accounts: AuthRepository) {
  return {
    async register(visitor: User | null, input: { username: string; password: string }) {
      if (visitor?.registered) throw new HttpError(409, "You already have an account. Sign out to create another.");
      try {
        const user = await accounts.register(visitor?.id ?? null, input.username, await hashPassword(input.password));
        if (!user) throw new HttpError(409, "This profile already has an account. Sign in instead.");
        return user;
      } catch (error) {
        if (error instanceof DuplicateKeyError) throw new HttpError(409, "Username is already taken. Choose another name.");
        throw error;
      }
    },

    async login(input: { username: string; password: string }) {
      const account = await accounts.credentials(input.username);
      const valid = await verifyPassword(account?.passwordHash ?? await dummyHash, input.password);
      if (!account || !valid) throw new HttpError(401, "Invalid username or password.");
      return account.user;
    },
  };
}
