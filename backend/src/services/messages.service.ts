import type { Actor } from "../types/user.types.js";
import type { Message } from "../types/message.types.js";
import type { MessageRepository, RoomRepository, ProfileRepository } from "../types/repository.types.js";
import { DuplicateKeyError } from "../errors/DuplicateKeyError.js";
import { RoomUnavailableError } from "../errors/RoomUnavailableError.js";
import { encodeCursor, decodeCursor } from "../helpers/messageCursor.js";
import type { PublishEvent } from "../realtime.js";
import { HttpError } from "../errors/HttpError.js";
import { messageView } from "../helpers/responseMappers.js";
import { createMessageSchema, historySchema } from "../schemas/api.schemas.js";

import { requireRoom } from "./rooms.service.js";
import { httpResult } from "../helpers/httpResult.js";

export function createMessageService(messages: MessageRepository, rooms: RoomRepository, publish: PublishEvent,
  profiles: Pick<ProfileRepository, "ownsUsername">) {
  const notify: PublishEvent = event => {
    try { publish(event); } catch { console.error("Live delivery failed; saved data remains available through history."); }
  };

  async function readHistory(scope: { roomId: string } | { userId: string }, rawQuery: unknown) {
  const query = historySchema.parse(rawQuery);
  const forward = Boolean(query.after);
  const rawCursor = query.before ?? query.after;

  const queryOptions = { limit: query.limit, direction: forward ? "newer" as const : "older" as const,
    ...(rawCursor ? { cursor: decodeCursor(rawCursor) } : {}) };
  const rows = "roomId" in scope
    ? await messages.listByRoom(scope.roomId, queryOptions)
    : await messages.listByUser(scope.userId, queryOptions);

  const page = rows.slice(0, query.limit);
  const continuation = page.at(-1);

  const nextCursor = rows.length > query.limit && continuation
    ? encodeCursor(continuation)
    : null;

  // Always return messages in display order: oldest to newest.
  if (!forward) page.reverse();

  const newest = page.at(-1);

  return {
    messages: page.map(messageView),
    nextCursor,
    latestCursor: newest ? encodeCursor(newest) : null,
    direction: forward ? "newer" : "older",
  };
}



  return {
  async myMessages(user: Actor, rawQuery: unknown) {

    return httpResult(200, await readHistory({ userId: user.id },
      rawQuery,
    ));
  },

  async roomMessages(roomId: unknown, rawQuery: unknown) {
    const room = await requireRoom(rooms,
      roomId,
    );

    return httpResult(200, await readHistory({ roomId: room.id },
      rawQuery,
    ));
  },

  async createMessage(user: Actor, roomId: unknown, body: unknown) {
    const room = await requireRoom(rooms,
      roomId,
    );
    const input = createMessageSchema.parse(body);

    if (!user.username) {
      throw new HttpError(
        400,
        "Set a display name with PATCH /api/me before sending messages",
      );
    }
    if (!await profiles.ownsUsername(user.id, user.username)) {
      throw new HttpError(409, "This username is already taken. Choose a different username before sending.");
    }

    const replyWithExisting = (message: Message) => {
      if (
        message.userId !== user.id ||
        message.text !== input.text
      ) {
        throw new HttpError(
          409,
          "This clientMessageId was already used for another submission",
        );
      }

      return httpResult(200, {
        message: messageView(message),
      });
    };

    const existing = await messages.findRequest(room.id, input.clientMessageId);

    if (existing) {
      return replyWithExisting(existing);
    }

    const draft: Omit<Message, "id"> = {
      roomId: room.id,
      userId: user.id,
      clientMessageId: input.clientMessageId,
      username: user.username,
      text: input.text,
      createdAt: new Date(),
    };

    let message: Message;
    try {
      message = await messages.insert(draft);
    } catch (error) {
      if (error instanceof RoomUnavailableError) throw new HttpError(404, "Chatroom not found");
      if (!(error instanceof DuplicateKeyError)) throw error;

      const replay = await messages.findRequest(room.id, input.clientMessageId);

      if (!replay) throw error;

      return replyWithExisting(replay);
    }

    notify({ type: "message.created", message: messageView(message), ...(room.createdBy ? { roomOwnerId: room.createdBy } : {}) });
    return httpResult(201, {
      message: messageView(message),
    });
  },
  };
}
