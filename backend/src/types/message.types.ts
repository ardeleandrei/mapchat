export interface Message {
  id: string; roomId: string; userId?: string; clientMessageId: string;
  username: string; text: string; createdAt: Date;
}

export interface MessageCursor { id: string; createdAt: Date }

export interface MessagePageQuery { limit: number; direction: "older" | "newer"; cursor?: MessageCursor }
