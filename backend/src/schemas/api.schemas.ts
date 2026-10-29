import { z } from "zod";

export const objectIdSchema = z.string().regex(
  /^[a-f\d]{24}$/i,
  "Invalid ID",
);

export const longitude = z.number().min(-180).max(180);
export const latitude = z.number().min(-90).max(90);

export const createRoomSchema = z.object({
  title: z.string().trim().min(1).max(80).optional(),
  longitude,
  latitude,
  creationKey: z.string().uuid(),
}).strict();

export const createMessageSchema = z.object({
  text: z.string().trim().min(1).max(2000),
  clientMessageId: z.string().uuid(),
}).strict();

export const updateRoomSchema = z.object({
  title: z.string().trim().min(1).max(80).optional(),
  color: z.string().regex(/^#[a-f0-9]{6}$/i).optional(),
  revision: z.number().int().min(0),
}).strict().refine(value => value.title !== undefined || value.color !== undefined,
  "Provide a title or color");

export const boundsSchema = z.string()
  .transform((value) =>
    value.split(",").map((part) =>
      part.trim() === "" ? NaN : Number(part),
    ),
  )
  .pipe(z.tuple([
    longitude,
    latitude,
    longitude,
    latitude,
  ]))
  .refine(
    ([, south, , north]) => south < north,
    "South must be less than north",
  );

export const listRoomsSchema = z.object({
  bbox: boundsSchema.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(500),
}).strict();

export const nearbySchema = z.object({
  longitude: z.coerce.number().min(-180).max(180),
  latitude: z.coerce.number().min(-90).max(90),
  radius: z.coerce.number().positive().max(100_000).default(5000),
  limit: z.coerce.number().int().min(1).max(100).default(100),
}).strict();

export const historySchema = z.object({
  before: z.string().min(1).max(512).optional(),
  after: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict().refine(
  (value) => !(value.before && value.after),
  "Use either before or after, not both",
);

export const cursorSchema = z.object({
  id: objectIdSchema,
  createdAt: z.string().datetime(),
});

