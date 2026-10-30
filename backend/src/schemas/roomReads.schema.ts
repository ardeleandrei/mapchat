import { z } from "zod";
import { objectIdSchema } from "./api.schemas.js";

export const ownedRoomsSchema = z.object({
  after: objectIdSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(100),
}).strict();

export const unreadSchema = z.object({
  roomIds: z.string().transform(value => value.split(",")).pipe(z.array(objectIdSchema).min(1).max(100)),
}).strict();

export const markReadSchema = z.object({ messageId: objectIdSchema }).strict();

export const recentRoomsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
}).strict();
