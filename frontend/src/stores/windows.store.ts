import { ref, reactive } from "vue";
import { defineStore } from "pinia";
import { useStorage } from "@vueuse/core";
import type { ChatWindowPosition } from "../types";
export interface ChatWindowState { id: string; minimized: boolean; order: number; slot: number }
export const useWindows = defineStore("windows", () => {
  const windows = ref<ChatWindowState[]>([]);
  const selectedRoomId = ref<string | null>(null);
  const drafts = reactive<Record<string, string>>({});
  const positions = useStorage<Record<string, ChatWindowPosition>>("wolfchatter.window-positions", {}, undefined, { onError: () => {} });
  let order = 0, slot = 0;

  function raise(entry: ChatWindowState) { entry.order = ++order; }

  function open(id: string) {
    let entry = windows.value.find(item => item.id === id);
    if (!entry) { entry = { id, minimized: false, order: 0, slot: slot++ }; windows.value.push(entry); }
    entry.minimized = false; raise(entry); return entry;
  }

  function positionFor(userId: string, roomId: string): ChatWindowPosition | undefined {
    const value = positions.value[`${userId}:${roomId}`];
    return value && Number.isFinite(value.x) && Number.isFinite(value.y) ? { x: value.x, y: value.y } : undefined;
  }

  function savePosition(userId: string, roomId: string, position: ChatWindowPosition) {
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) return;
    const key = `${userId}:${roomId}`, previous = positions.value[key];
    if (previous?.x !== position.x || previous.y !== position.y) positions.value[key] = { ...position };
  }

  function forgetPosition(roomId: string) {
    for (const key of Object.keys(positions.value)) if (key.endsWith(`:${roomId}`)) delete positions.value[key];
  }

  return { windows, selectedRoomId, drafts, raise, open, positionFor, savePosition, forgetPosition };
});
