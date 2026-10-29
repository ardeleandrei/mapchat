import type { Message } from "../types";

export function mergeMessages(existing: Message[], incoming: Message[]): Message[] {
  return [...new Map([...existing, ...incoming].map(message => [message.id, message])).values()]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}
