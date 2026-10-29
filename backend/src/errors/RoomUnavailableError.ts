export class RoomUnavailableError extends Error {
  constructor() { super("Chatroom not found"); }
}
