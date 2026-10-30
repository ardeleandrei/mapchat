export interface Actor { id: string; username: string }

export interface User extends Actor { lastRoomId: string | null; createdAt: Date; registered: boolean }
