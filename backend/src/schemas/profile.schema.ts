import { z } from "zod";
import { isValidUsername } from "../helpers/username.js";
export const profileSchema = z.object({
  username: z.string().trim().min(1).max(40)
    .refine(isValidUsername, "Use a visible username without control or hidden characters").optional(),
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

