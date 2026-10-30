<template>
  <main class="workspace">
    <ChatMap ref="mapView" />
    <UserProfile v-model:open="chat.authOpen" />
    <div v-if="chat.error" class="app-notice notice error" role="alert">
      {{ chat.error }}
      <button v-if="!chat.ready" :disabled="chat.starting" @click="chat.start">Reconnect</button>
      <button v-else-if="chat.pendingPin" :disabled="chat.creating" @click="chat.retryPin">Retry adding pin</button>
      <button aria-label="Dismiss notification" @click="chat.error = ''">×</button>
    </div>
    <aside v-if="!chat.openChats.length" class="chat-panel compact" aria-label="Chatroom panel">
      <p v-if="chat.starting" class="popup-note" role="status">Loading your conversations…</p>
      <p v-else-if="!chat.ready" class="popup-note">Unable to connect. <button @click="chat.start">Try again</button></p>
      <p v-else class="popup-note">{{ chat.user?.registered ? "Click a pin to open a chat, or click the map to create one." : "Click a pin to read a chat. Sign in to create rooms and send messages." }}</p>
    </aside>
    <ChatWindow v-for="{ entry, room } in chat.openChats" :key="room.id" v-show="!entry.minimized"
      :room="room" :entry="entry" @focus-pin="focusPin" @edit="editingRoomId = $event" @edit-profile="chat.authOpen = true" />
    <MinimizedChats />
    <DeleteRoomDialog v-if="deletingRoom" :key="deletingRoom.id" :room="deletingRoom" @close="deletingRoomId = null" />
    <EditRoomDialog v-else-if="editingRoom" :key="editingRoom.id" :room="editingRoom" @close="editingRoomId = null" @delete="requestDeletion" />
    <CreateRoomDialog v-else-if="chat.newRoomLocation" :location="chat.newRoomLocation" @close="chat.newRoomLocation = null" />
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useEventListener } from "@vueuse/core";
import ChatMap from "./components/map/ChatMap.vue";
import ChatWindow from "./components/chat/ChatWindow.vue";
import CreateRoomDialog from "./components/rooms/CreateRoomDialog.vue";
import EditRoomDialog from "./components/rooms/EditRoomDialog.vue";
import DeleteRoomDialog from "./components/rooms/DeleteRoomDialog.vue";
import { useChat } from "./stores/chat";
import MinimizedChats from "./components/chat/MinimizedChats.vue";
import UserProfile from "./components/profile/UserProfile.vue";

const chat = useChat();
const mapView = ref<InstanceType<typeof ChatMap> | null>(null);
const editingRoomId = ref<string | null>(null);
const deletingRoomId = ref<string | null>(null);
const deletingRoom = computed(() => chat.rooms.find(room => room.id === deletingRoomId.value) ?? null);

function requestDeletion(id: string) { editingRoomId.value = null; deletingRoomId.value = id; }
const editingRoom = computed(() => chat.rooms.find(room => room.id === editingRoomId.value) ?? null);

function focusPin(id: string, bounds?: DOMRect) { mapView.value?.focusSelectedRoom(bounds, id); }

function wake() { void chat.refresh(); }

useEventListener("online", wake);
useEventListener(document, "visibilitychange", wake);
onMounted(() => { void chat.start(); });
onUnmounted(() => { chat.stop(); });
</script>

<style scoped src="./styles/chat-panel.css"></style>
<style scoped src="./styles/feedback.css"></style>

<style scoped>
.workspace { position: relative; width: 100%; height: 100dvh; overflow: hidden; }
.app-notice { position: absolute; bottom: 30px; left: 14px; z-index: 100000; max-width: min(460px, calc(100% - 28px)); border-radius: 12px; box-shadow: 0 3px 12px #1e293b18; }
.popup-note { margin: 0; padding: 18px; line-height: 1.6; }
.popup-note button { border: 0; padding: 2px 4px; background: transparent; font: inherit; text-decoration: underline; }
.chat-panel.compact { height: auto; overflow-y: auto; }
</style>
