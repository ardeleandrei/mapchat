import { mergeMessages } from "../utils/messageHistory";
import { roomsService } from "../services/rooms.service";
import { profileService } from "../services/profile.service";
import { messagesService } from "../services/messages.service";
import { useSession } from "./session.store";
import { useWindows } from "./windows.store";
import { computed, reactive, ref } from "vue";
import { defineStore, storeToRefs } from "pinia";
import { ApiError } from "../clients/http.client";
import { LiveClient, Superseded } from "../clients/websocket.client";
import type { Connection, HistoryPage, Message, Room } from "../types";

interface History {
  items: Message[]; before: string | null; after: string | null;
  loaded: boolean; loading: boolean; error: string;
}
export type { ChatWindowState } from "./windows.store";
export const useChat = defineStore("chat", () => {
  const session = useSession(), layout = useWindows();
  const { user, ready, starting, savingName } = storeToRefs(session);
  const { windows, selectedRoomId, drafts } = storeToRefs(layout);
  const rooms = ref<Room[]>([]);
  const deletedRooms = new Set<string>();
  let roomVersion = 0;
  const roomVersions = new Map<string, number>();
  const openChats = computed(() => windows.value.flatMap(entry => {
    const room = rooms.value.find(item => item.id === entry.id);
    return room ? [{ entry, room }] : [];
  }));
  const creating = ref(false);
  const error = ref(""), mapError = ref(""), truncated = ref(false);
  const connection = ref<Connection>("offline"), liveError = ref("");
  const histories = reactive<Record<string, History>>({});
  const sending = reactive<Record<string, boolean>>({});
  const pendingMessages = new Map<string, { text: string; clientMessageId: string }>();
  const pendingPin = ref<{ longitude: number; latitude: number; creationKey: string; title?: string } | null>(null);
  const newRoomLocation = ref<{ longitude: number; latitude: number } | null>(null);

  function requestRoom(longitude: number, latitude: number) {
    if (windows.value.length >= 20) { error.value = "Close a chat before opening more (20 maximum)."; return; }
    if (ready.value && !creating.value) newRoomLocation.value = { longitude, latitude };
  }
  const tasks = new Map<string, Promise<void>>();
  let bounds = "", roomRequest = 0, selectionVersion = 0, identityVersion = 0;
  let live: LiveClient | undefined;
  let selectionSave: Promise<void> = Promise.resolve(), nameSave: Promise<void> = Promise.resolve();

  const selectedRoom = computed(() => rooms.value.find(r => r.id === selectedRoomId.value) ?? null);

  function history(id: string): History {
    return histories[id] ??= { items: [], before: null, after: null, loaded: false, loading: false, error: "" };
  }
  const currentHistory = computed(() => selectedRoomId.value ? history(selectedRoomId.value) : null);

  function expired() {
    ready.value = false; connection.value = "offline"; live?.stop();
    error.value = "Your session has expired. Reconnect to continue. Saved conversations remain available.";
  }

  function report(cause: unknown): string {
    if (cause instanceof ApiError && cause.status === 401) expired();
    return cause instanceof Error ? cause.message : "Something went wrong. Please try again.";
  }

  function merge(id: string, incoming: Message[]) {
    if (deletedRooms.has(id)) return;
    const state = history(id);
    state.items = mergeMessages(state.items, incoming);
  }

  function visible(room: Room) {
    if (!bounds) return true;
    const values = bounds.split(",").map(Number);
    const [west, south, east, north] = values as [number, number, number, number];
    const [lng, lat] = room.location.coordinates;
    return lat >= south && lat <= north && (west <= east ? lng >= west && lng <= east : lng >= west || lng <= east);
  }

  function upsert(room: Room) {
    if (deletedRooms.has(room.id)) return;
    const existing = rooms.value.find(item => item.id === room.id);
    if ((existing?.revision ?? 0) > (room.revision ?? 0)) return;
    roomVersions.set(room.id, ++roomVersion);
    rooms.value = [...rooms.value.filter(r => r.id !== room.id), room]
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  }

  async function refreshRooms() {
    if (!ready.value) return;
    const request = ++roomRequest, identity = identityVersion, startedVersion = roomVersion;
    try {
      const result = await roomsService.list(bounds);
      if (request !== roomRequest || identity !== identityVersion) return;
      // Preserve pins delivered while the HTTP viewport request was in flight.
      const keep = rooms.value.filter(r => windows.value.some(entry => entry.id === r.id) ||
        (visible(r) && (roomVersions.get(r.id) ?? 0) > startedVersion));
      const merged = new Map(keep.map(room => [room.id, room]));
      for (const room of result.rooms) {
        if (deletedRooms.has(room.id)) continue;
        if ((merged.get(room.id)?.revision ?? 0) <= (room.revision ?? 0)) merged.set(room.id, room);
      }
      rooms.value = [...merged.values()];
      truncated.value = result.truncated; mapError.value = "";
    } catch (cause) { if (request === roomRequest) mapError.value = report(cause); }
  }

  function setBounds(value: string) { bounds = value; void refreshRooms(); }

  async function loadHistory(id: string, older = false): Promise<void> {
    if (deletedRooms.has(id)) return;
    const running = tasks.get(id);
    if (running) { await running; if (!older && ready.value) return loadHistory(id); return; }
    const state = history(id), identity = identityVersion;
    if (older && !state.before) return;
    const work = (async () => {
      state.loading = true; state.error = "";
      try {
        if (older || !state.loaded) {
          const page = await messagesService.history(id, 50, older ? { before: state.before! } : {});
          if (identity !== identityVersion) return;
          // Merge, never replace: live messages may arrive before history.
          merge(id, page.messages); state.before = page.nextCursor;
          if (!older) { state.after = page.latestCursor; state.loaded = true; }
        } else if (!state.after) {
          // A previously empty room has no cursor. Replay backward pages so a
          // long disconnect cannot silently truncate its first conversations.
          let before: string | null = null;
          let newest: string | null = null;
          do {
            const page: HistoryPage = await messagesService.history(id, 100, before ? { before } : {});
            if (identity !== identityVersion) return;
            merge(id, page.messages);
            if (!newest) newest = page.latestCursor;
            before = page.nextCursor;
          } while (before && identity === identityVersion);
          state.after = newest; state.before = null;
        } else {
          let more = true;
          while (more && identity === identityVersion) {
            const page: HistoryPage = await messagesService.history(id, 100, state.after ? { after: state.after } : {});
            if (identity !== identityVersion) return;
            merge(id, page.messages);
            if (page.latestCursor) state.after = page.latestCursor;
            more = page.direction === "newer" && page.nextCursor !== null;
          }
        }
      } catch (cause) {
        if (identity === identityVersion) {
          if (cause instanceof ApiError && cause.status === 404) forgetRoom(id);
          else state.error = report(cause);
        }
      }
      finally { state.loading = false; }
    })();
    tasks.set(id, work);
    try { await work; } finally { if (tasks.get(id) === work) tasks.delete(id); }
  }

  async function syncSelected() {
    const ids = windows.value.map(entry => entry.id), version = selectionVersion;
    if (connection.value !== "online" || !live) {
      await Promise.all(ids.map(id => loadHistory(id)));
      return;
    }
    try {
      await live.joinRooms(ids);
      if (version === selectionVersion) {
        liveError.value = "";
        await Promise.all(ids.map(id => loadHistory(id)));
      }
    } catch (cause) {
      if (!(cause instanceof Superseded) && version === selectionVersion) {
        liveError.value = report(cause);
        if (ready.value) await Promise.all(ids.map(id => loadHistory(id)));
      }
    }
  }

  async function selectRoom(room: Room) {
    if (deletedRooms.has(room.id)) return;
    let entry = windows.value.find(item => item.id === room.id);
    if (!entry) {
      if (windows.value.length >= 20) { error.value = "Close a chat before opening more (20 maximum)."; return; }
      entry = layout.open(room.id);
    }
    entry.minimized = false; layout.raise(entry);
    upsert(room); selectedRoomId.value = room.id;
    const version = ++selectionVersion, identity = identityVersion;
    void syncSelected();
    selectionSave = selectionSave.catch(() => {}).then(async () => {
      if (identity !== identityVersion) return;
      const result = await profileService.update({ lastRoomId: room.id });
      if (version === selectionVersion && user.value) user.value.lastRoomId = result.user.lastRoomId;
    }).catch(cause => { if (version === selectionVersion) error.value = report(cause); });
    await selectionSave;
  }

  function activateRoom(id: string) {
    const entry = windows.value.find(item => item.id === id);
    if (!entry) return;
    layout.raise(entry);
    if (selectedRoomId.value === id) return;
    selectedRoomId.value = id;
    const identity = identityVersion;
    selectionSave = selectionSave.catch(() => {}).then(async () => {
      if (identity !== identityVersion) return;
      await profileService.update({ lastRoomId: id });
      if (user.value) user.value.lastRoomId = id;
    }).catch(cause => { error.value = report(cause); });
  }

  function minimizeRoom(id: string) {
    const entry = windows.value.find(item => item.id === id);
    if (entry) entry.minimized = true;
  }

  function closeRoom(id: string) {
    windows.value = windows.value.filter(entry => entry.id !== id);
    ++selectionVersion; void syncSelected();
    if (selectedRoomId.value !== id) return;
    const next = [...windows.value].sort((a, b) => b.order - a.order)[0];
    selectedRoomId.value = next?.id ?? null;
    const selected = selectedRoomId.value, identity = identityVersion;
    selectionSave = selectionSave.catch(() => {}).then(async () => {
      if (identity !== identityVersion) return;
      await profileService.update({ lastRoomId: selected });
      if (user.value) user.value.lastRoomId = selected;
    }).catch(cause => { error.value = report(cause); });
  }

  function forgetRoom(id: string) {
    if (deletedRooms.has(id)) return;
    deletedRooms.add(id);
    if (windows.value.some(entry => entry.id === id)) closeRoom(id);
    roomVersions.delete(id);
    rooms.value = rooms.value.filter(room => room.id !== id);
    delete histories[id]; delete drafts.value[id]; delete sending[id]; pendingMessages.delete(id);
  }

  async function deleteRoom(id: string) {
    try { await roomsService.remove(id); forgetRoom(id); }
    catch (cause) { throw new Error(report(cause)); }
  }

  async function createRoom(longitude: number, latitude: number, retry = false, title?: string) {
    if (!ready.value || creating.value) return false;
    const previous = pendingPin.value;
    if (!previous || (!retry && (previous.longitude !== longitude || previous.latitude !== latitude || previous.title !== title)))
      pendingPin.value = { longitude, latitude, creationKey: crypto.randomUUID(), ...(title === undefined ? {} : { title }) };
    creating.value = true; error.value = "";
    try {
      const result = await roomsService.create(pendingPin.value!);
      pendingPin.value = null; newRoomLocation.value = null; await selectRoom(result.room);
      return true;
    } catch (cause) { error.value = report(cause); return false; }
    finally { creating.value = false; }
  }
  
  async function retryPin() {
    const pin = pendingPin.value;
    if (pin) await createRoom(pin.longitude, pin.latitude, true);
  }
  
  function saveName(value: string): Promise<void> {
    const name = value.trim(), identity = identityVersion;
    if (!name || name.length > 40) return Promise.reject(new Error("Enter a display name of 1–40 characters."));
    nameSave = nameSave.catch(() => {}).then(async () => {
      if (identity !== identityVersion || !ready.value) throw new Error("Reconnect before saving your name.");
      if (user.value?.username === name) return;
      savingName.value = true;
      try {
        const result = await profileService.update({ username: name });
        if (user.value?.id === result.user.id) user.value.username = result.user.username;
      } finally { savingName.value = false; }
    });
    return nameSave;
  }

  async function updateRoom(room: Room, title: string, color: string) {
    try {
      const result = await roomsService.update(room, title, color);
      upsert(result.room);
    } catch (cause) { throw new Error(report(cause)); }
  }

  async function send(id: string, name: string, value: string) {
    if (sending[id] || !ready.value) return false;
    const text = value.trim();
    if (!text || text.length > 2000) { history(id).error = "Enter a message of 1–2,000 characters."; return false; }
    sending[id] = true; history(id).error = "";
    try {
      await saveName(name);
      const previous = pendingMessages.get(id);
      const body = previous?.text === text ? previous : { text, clientMessageId: crypto.randomUUID() };
      pendingMessages.set(id, body);
      const result = await messagesService.send(id, body);
      merge(id, [result.message]); pendingMessages.delete(id);
      return true;
    } catch (cause) { history(id).error = report(cause); return false; }
    finally { sending[id] = false; }
  }

  async function start() {
    if (starting.value) return;
    starting.value = true; error.value = ""; live?.stop();
    try {
      const previousUser = user.value?.id;
      const result = await profileService.get();
      identityVersion++;
      if (previousUser && previousUser !== result.user.id) {
        for (const key of Object.keys(histories)) delete histories[key];
        pendingMessages.clear(); pendingPin.value = null; selectedRoomId.value = null;
        windows.value = []; newRoomLocation.value = null;
        for (const key of Object.keys(drafts.value)) delete drafts.value[key];
      }
      user.value = result.user; ready.value = true;
      await refreshRooms();
      if (result.user.lastRoomId) {
        try {
          const restored = await roomsService.get(result.user.lastRoomId);
          upsert(restored.room); selectedRoomId.value = restored.room.id;
          if (!windows.value.some(entry => entry.id === restored.room.id))
            layout.open(restored.room.id);
        } catch (cause) {
          if (cause instanceof ApiError && cause.status === 404) {
            selectedRoomId.value = null;
            await profileService.update({ lastRoomId: null });
          } else throw cause;
        }
      }
      live = new LiveClient({
        state: value => { connection.value = value; },

        ready: id => {
          if (id !== user.value?.id) { expired(); return; }
          void refreshRooms(); void syncSelected();
        },
        expired,

        event: event => {
          if (event.type === "room.deleted") forgetRoom(event.roomId);
          if ((event.type === "room.created" || event.type === "room.updated") &&
            (visible(event.room) || windows.value.some(entry => entry.id === event.room.id))) upsert(event.room);
          if (event.type === "message.created" && windows.value.some(entry => entry.id === event.message.roomId)) merge(event.message.roomId, [event.message]);
          if (event.type === "error") liveError.value = event.message;
        },
      });
      live.start();
      if (selectedRoomId.value) void loadHistory(selectedRoomId.value);
    } catch (cause) { ready.value = false; error.value = report(cause); }
    finally { starting.value = false; }
  }

  async function refresh() {
    if (!ready.value || document.hidden) return;
    live?.reconnectNow(); await refreshRooms();
    await Promise.all(windows.value.map(entry => loadHistory(entry.id)));
  }

  function stop() { live?.stop(); connection.value = "offline"; }
  return { user, rooms, selectedRoomId, selectedRoom, currentHistory, ready, starting, windows, openChats, drafts, history,
    activateRoom, minimizeRoom, closeRoom,
    creating, savingName, error, mapError, truncated, sending, pendingPin, newRoomLocation, connection, liveError,
    requestRoom, updateRoom, deleteRoom,
    start, stop, refresh, setBounds, selectRoom, createRoom, retryPin, saveName, send, loadHistory };
});
