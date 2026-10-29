import type { MessageCursor } from "../types/message.types.js";
import { cursorSchema } from "../schemas/api.schemas.js";
import { HttpError } from "../errors/HttpError.js";

export function encodeCursor(cursor: MessageCursor): string {
  return Buffer.from(JSON.stringify({ id: cursor.id, createdAt: cursor.createdAt.toISOString() })).toString("base64url");
}

export function decodeCursor(value: string): MessageCursor {
  try {
    const cursor = cursorSchema.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
    return { id: cursor.id, createdAt: new Date(cursor.createdAt) };
  } catch { throw new HttpError(400, "Invalid message cursor"); }
}
