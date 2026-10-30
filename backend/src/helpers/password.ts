import { hash, verify } from "@node-rs/argon2";

export function hashPassword(password: string): Promise<string> {
  return hash(password, {
    algorithm: 2, // Argon2id (the package's ambient const enum cannot be imported in isolated modules).
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

export function verifyPassword(digest: string, password: string): Promise<boolean> {
  return verify(digest, password);
}
