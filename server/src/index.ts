import "dotenv/config";
import express from "express";
import { fileURLToPath } from "node:url";
import { connectDatabase } from "./db.js";
import { createIdentity } from "./identity.js";
import { createApi, handleApiError } from "./api.js";

const mongoUri = process.env.MONGODB_URI;

if (!mongoUri) {
  throw new Error("MONGODB_URI is required");
}

const database = await connectDatabase(mongoUri);
const app = express();
const port = Number(process.env.PORT ?? 3000);

const publicDirectory = fileURLToPath(
  new URL("../public/", import.meta.url),
);

app.disable("x-powered-by");
app.use(express.json({ limit: "16kb" }));

// Health checks do not require or create visitor sessions.
app.get("/api/health", async (_request, response) => {
  response.setHeader("Cache-Control", "no-store");

  try {
    await database.db.command({ ping: 1 });

    response.json({
      status: "ok",
      database: "connected",
    });
  } catch {
    response.status(503).json({
      status: "error",
      database: "unavailable",
    });
  }
});

app.use("/api", createIdentity(database));
app.use("/api", createApi(database));

app.use("/api", (_request, response) => {
  response.status(404).json({
    error: "Endpoint not found",
  });
});

app.use(express.static(publicDirectory));

app.get("/{*path}", (_request, response) => {
  response.sendFile("index.html", {
    root: publicDirectory,
  });
});

app.use(handleApiError);

const server = app.listen(port, "0.0.0.0", () => {
  console.log(`Wolfchatter listening on port ${port}`);
});

let shuttingDown = false;

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;

  server.close(() => {
    void database.client.close().finally(() => {
      process.exit(0);
    });
  });

  setTimeout(() => process.exit(1), 10_000).unref();
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);