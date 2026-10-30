import { Router } from "express";
import rateLimit from "express-rate-limit";
import type { createAuthController } from "../controllers/auth.controller.js";

export function createAuthRoutes(controller: ReturnType<typeof createAuthController>) {
  const router = Router();
  const attempts = rateLimit({
    windowMs: 15 * 60_000, limit: 20,
    standardHeaders: "draft-8", legacyHeaders: false,
    message: { error: "Too many sign-in attempts. Try again in 15 minutes." },
  });
  router.post("/register", attempts, controller.register);
  router.post("/login", attempts, controller.login);
  router.post("/logout", controller.logout);
  return router;
}
