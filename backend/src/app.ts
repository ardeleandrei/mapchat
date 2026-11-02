import express from "express";
import { fileURLToPath } from "node:url";
import type { Database } from "./db.js";
import type { PublishEvent } from "./websocket.js";
import { createAuthMiddleware, createRequestProtection } from "./middleware/auth.middleware.js";
import { createSessionCookies } from "./helpers/sessionCookie.js";
import { createSessionRepository } from "./repositories/session.repository.js";
import { createAuthRepository } from "./repositories/auth.repository.js";
import { createProfileRepository } from "./repositories/profile.repository.js";
import { createRoomRepository } from "./repositories/rooms.repository.js";
import { createSessionService } from "./services/session.service.js";
import { createAuthService } from "./services/auth.service.js";
import { createProfileService } from "./services/profile.service.js";
import { createSessionController } from "./controllers/session.controller.js";
import { createAuthController } from "./controllers/auth.controller.js";
import { createProfileController } from "./controllers/profile.controller.js";
import { createAuthRoutes } from "./routes/auth.routes.js";
import { createSessionRoutes } from "./routes/session.routes.js";
import { createApi } from "./routes/api.routes.js";
import { handleApiError } from "./middleware/errorHandler.js";

export function configureApp(
  app: express.Express,
  database: Database,
  publish: PublishEvent,
  revokeSession?: (hash: string) => void,
) {
  const publicDirectory = fileURLToPath(new URL("../public/", import.meta.url));
  const sessions = createSessionService(createSessionRepository(database), revokeSession);
  const cookies = createSessionCookies();
  const authController = createAuthController(createAuthService(createAuthRepository(database)), sessions, cookies);
  const profileController = createProfileController(
    createProfileService(createProfileRepository(database), createRoomRepository(database)),
  );
  const sessionController = createSessionController(sessions, cookies);

  app.disable("x-powered-by");
  app.use(express.json({ limit: "16kb" }));
  app.get("/api/health", async (_request, response) => {
    response.setHeader("Cache-Control", "no-store");
    try {
      await database.db.command({ ping: 1 });
      response.json({ status: "ok", database: "connected" });
    } catch {
      response.status(503).json({ status: "error", database: "unavailable" });
    }
  });
  app.use("/api", createRequestProtection());
  app.use("/api/auth", createAuthRoutes(authController));
  app.use("/api", createSessionRoutes(sessionController, profileController, createAuthMiddleware(sessions)));
  app.use("/api", createApi(database, publish));
  app.use("/api", (_request, response) => {
    response.status(404).json({ error: "Endpoint not found" });
  });
  app.use(express.static(publicDirectory));
  app.get("/{*path}", (_request, response) => {
    response.sendFile("index.html", { root: publicDirectory });
  });
  app.use(handleApiError);

  return app;
}
