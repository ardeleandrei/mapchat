import { Router, type RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import type { createSessionController } from "../controllers/session.controller.js";
import type { createProfileController } from "../controllers/profile.controller.js";

export function createSessionRoutes(
  sessions: ReturnType<typeof createSessionController>,
  profiles: ReturnType<typeof createProfileController>,
  authenticate: RequestHandler,
) {
  const router = Router();
  const bootstrapLimiter = rateLimit({
    windowMs: 60_000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false,
    message: { error: "Too many session requests" },
  });
  const profileLimiter = rateLimit({
    windowMs: 60_000, limit: 60, standardHeaders: "draft-8", legacyHeaders: false,
    message: { error: "Too many profile updates" },
  });
  router.get("/me", bootstrapLimiter, sessions.bootstrap);
  // All following API handlers require an initialized browsing or account session.
  router.use(authenticate);
  router.patch("/me", profileLimiter, profiles.update);
  return router;
}
