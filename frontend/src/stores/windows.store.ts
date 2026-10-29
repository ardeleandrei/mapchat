import { ref, reactive } from "vue";
import { defineStore } from "pinia";
export interface ChatWindowState { id: string; minimized: boolean; order: number; slot: number }
export const useWindows = defineStore("windows", () => {
  const windows = ref<ChatWindowState[]>([]);
  const selectedRoomId = ref<string | null>(null);
  const drafts = reactive<Record<string, string>>({});
  let order = 0, slot = 0;

  function raise(entry: ChatWindowState) { entry.order = ++order; }

  function open(id: string) {
    let entry = windows.value.find(item => item.id === id);
    if (!entry) { entry = { id, minimized: false, order: 0, slot: slot++ }; windows.value.push(entry); }
    entry.minimized = false; raise(entry); return entry;
  }
  return { windows, selectedRoomId, drafts, raise, open };
});
