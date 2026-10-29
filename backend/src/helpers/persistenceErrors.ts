import { MongoServerError } from "mongodb";
import { DuplicateKeyError } from "../errors/DuplicateKeyError.js";

export async function translateWriteError<T>(write: () => Promise<T>): Promise<T> {
  try { return await write(); }
  catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) throw new DuplicateKeyError();
    throw error;
  }
}
