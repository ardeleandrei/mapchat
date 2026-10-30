import { z } from "zod";
import { isValidUsername } from "../helpers/username.js";

const username = z.string().trim().min(1).max(40)
  .refine(isValidUsername, "Use a visible username without control or hidden characters");

export const registerSchema = z.object({
  username,
  password: z.string().min(8, "Use at least 8 characters for your password").max(128),
}).strict();

export const loginSchema = z.object({
  username,
  password: z.string().min(1).max(128),
}).strict();
