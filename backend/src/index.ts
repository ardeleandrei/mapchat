import "./config/environment.js";
import express from "express";
import { createServer } from "node:http";
import { configureApp } from "./app.js";
import { connectDatabase } from "./db.js";
import { attachWebSocket } from "./websocket.js";

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) throw new Error("MONGODB_URI is required");
const database = await connectDatabase(mongoUri);
const app = express();
const server = createServer(app);
const live = attachWebSocket(server, database);
const port = Number(process.env.PORT ?? 3000);

configureApp(app, database, live.publish, live.revokeSession);

server.listen(port, "0.0.0.0", () => {
  console.log("Wolfchatter listening on port " + port);
});

let shuttingDown = false;

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  const force = setTimeout(() => process.exit(1), 10_000);
  force.unref();
  void (async () => {
    await Promise.all([
      live.close(),
      new Promise<void>((resolve, reject) =>
        server.close(error => error ? reject(error) : resolve())),
    ]);
    await database.client.close();
    clearTimeout(force);
    process.exit(0);
  })().catch(error => {
    console.error("Shutdown failed", error);
    process.exit(1);
  });
}
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);

