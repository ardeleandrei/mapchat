import type { RequestHandler } from "express";
import { currentUser } from "../middleware/auth.middleware.js";
import type { createChatService } from "../services/chat.service.js";
type Service = ReturnType<typeof createChatService>;

export function chatController(service: Service, action: keyof Service): RequestHandler {
  return async (request, response) => {
    const visitor = currentUser(response);
    const user = { id: visitor.id, username: visitor.username };
    const actions = {
      myRooms: () => service.myRooms(user, request.query),

      recentRooms: () => service.recentRooms(user, request.query),

      unreadCounts: () => service.unreadCounts(user, request.query),

      markRoomRead: () => service.markRoomRead(user, request.params.roomId, request.body),

      myMessages: () => service.myMessages(user, request.query),

      listRooms: () => service.listRooms(request.query),

      nearbyRooms: () => service.nearbyRooms(request.query),

      getRoom: () => service.getRoom(request.params.roomId),

      createRoom: () => service.createRoom(user, request.body),

      updateRoom: () => service.updateRoom(user, request.params.roomId, request.body),

      deleteRoom: () => service.deleteRoom(user, request.params.roomId),

      roomMessages: () => service.roomMessages(request.params.roomId, request.query),

      createMessage: () => service.createMessage(user, request.params.roomId, request.body),
    };
    const result = await actions[action]();
    response.status(result.status).json(result.body);
  };
}
