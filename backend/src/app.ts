import express from "express";
import { fileURLToPath } from "node:url";
import type { Database } from "./db.js";
import type { PublishEvent } from "./realtime.js";
import { createIdentity } from "./identity.js";
import { createApi } from "./routes/api.routes.js";
import { handleApiError } from "./middleware/errorHandler.js";

export function configureApp(app: express.Express, database: Database, publish: PublishEvent) {
const publicDirectory = fileURLToPath(new URL("../public/", import.meta.url));
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
app.use("/api", createIdentity(database));
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
