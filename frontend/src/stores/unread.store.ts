import { reactive, ref } from "vue";
import { defineStore } from "pinia";
import { roomReadsService } from "../services/roomReads.service";

export const useUnread = defineStore("unread", () => {
  const counts = reactive<Record<string, number>>({}), error = ref("");
  const pending = new Set<string>(), deleted = new Set<string>();
  const readPending = new Map<string, string>(), readSaved = new Map<string, string>();
  const reading = new Map<string, Promise<void>>();
  let generation = 0, refreshing: Promise<void> | undefined;

  function reset() {
    generation++; pending.clear(); deleted.clear(); readPending.clear(); readSaved.clear(); reading.clear();
    refreshing = undefined; error.value = "";
    for (const id of Object.keys(counts)) delete counts[id];
  }

  function forget(id: string) {
    deleted.add(id); pending.delete(id); readPending.delete(id); readSaved.delete(id); delete counts[id];
  }

  function refresh(roomIds: string[]): Promise<void> {
    for (const id of roomIds) if (!deleted.has(id)) pending.add(id);
    if (refreshing) return refreshing;
    const version = generation;
    const work = Promise.resolve().then(async () => {
      while (pending.size && version === generation) {
        const batch = [...pending].slice(0, 100);
        for (const id of batch) pending.delete(id);
        try {
          const result = await roomReadsService.counts(batch);
          if (version !== generation) return;
          for (const row of result.rooms) if (!deleted.has(row.roomId)) counts[row.roomId] = row.unreadCount;
          error.value = "";
        } catch (cause) {
          if (version === generation) error.value = cause instanceof Error ? cause.message : "Could not refresh unread counts.";
          return;
        }
      }
    });
    refreshing = work;
    void work.finally(() => { if (refreshing === work) refreshing = undefined; });
    return work;
  }

  function mark(roomId: string, messageId: string): Promise<void> {
    if (deleted.has(roomId) || readSaved.get(roomId) === messageId) return Promise.resolve();
    readPending.set(roomId, messageId);
    const existing = reading.get(roomId);
    if (existing) return existing;
    const version = generation;
    const work = Promise.resolve().then(async () => {
      while (readPending.has(roomId) && version === generation) {
        const through = readPending.get(roomId)!;
        readPending.delete(roomId);
        try {
          await roomReadsService.mark(roomId, through);
          if (version !== generation) return;
          readSaved.set(roomId, through);
          await refresh([roomId]);
        } catch (cause) {
          if (version === generation) error.value = cause instanceof Error ? cause.message : "Could not save read position.";
          return;
        }
      }
    });
    reading.set(roomId, work);
    void work.finally(() => { if (reading.get(roomId) === work) reading.delete(roomId); });
    return work;
  }

  return { counts, error, reset, forget, refresh, mark };
});
