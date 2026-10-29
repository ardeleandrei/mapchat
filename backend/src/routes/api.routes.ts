import { createRoomRepository } from "../repositories/rooms.repository.js";
import { createMessageRepository } from "../repositories/messages.repository.js";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import type { Database } from "../db.js";
import type { PublishEvent } from "../realtime.js";
import { createChatService } from "../services/chat.service.js";
import { chatController } from "../controllers/chat.controller.js";

export function createApi(database: Database, publish: PublishEvent) {
  const router = Router();
  const service = createChatService({ rooms: createRoomRepository(database), messages: createMessageRepository(database) }, publish);
  router.use((_request, response, next) => { response.setHeader("Cache-Control", "no-store"); next(); });
  router.use(rateLimit({ windowMs: 60_000, limit: 60, skip: request => request.method === "GET",
    standardHeaders: "draft-8", legacyHeaders: false, message: { error: "Too many requests. Try again shortly." } }));
  router.get("/me/messages", chatController(service, "myMessages"));
  router.get("/rooms", chatController(service, "listRooms"));
  router.get("/rooms/nearby", chatController(service, "nearbyRooms"));
  router.get("/rooms/:roomId", chatController(service, "getRoom"));
  router.post("/rooms", chatController(service, "createRoom"));
  router.patch("/rooms/:roomId", chatController(service, "updateRoom"));
  router.delete("/rooms/:roomId", chatController(service, "deleteRoom"));
  router.get("/rooms/:roomId/messages", chatController(service, "roomMessages"));
  router.post("/rooms/:roomId/messages", chatController(service, "createMessage"));
  return router;
}
