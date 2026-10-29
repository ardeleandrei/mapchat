import { z } from "zod";
export const profileSchema = z.object({
  username: z.string().trim().min(1).max(40).optional(),
  lastRoomId: z.string()
    .regex(/^[a-f\d]{24}$/i, "Invalid room ID")
    .nullable()
    .optional(),
}).strict().refine(
  (value) =>
    value.username !== undefined ||
    value.lastRoomId !== undefined,
  "Provide username or lastRoomId",
);

