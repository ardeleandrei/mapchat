<template>
  <aside ref="panel" class="chat-panel" :class="{ dragging: movable.dragging.value }"
    :style="[roomTheme(room.id, room.color), movable.style.value, { zIndex: 1000 + entry.order }]"
    :aria-label="'Chatroom: ' + room.title"
    @pointerdown.capture="chat.activateRoom(room.id)" @focusin="chat.activateRoom(room.id)">
    <ChatWindowHeader :room="room" :movable="movable" :can-edit="room.createdBy === chat.user?.id"
      @focus-pin="emit('focusPin', room.id, panel?.getBoundingClientRect())"
      @edit="emit('edit', room.id)" @minimize="chat.minimizeRoom(room.id)" @close="chat.closeRoom(room.id)" />
    <p v-if="chat.connection !== 'online' || chat.liveError" class="notice" role="status">
      {{ chat.liveError || "Reconnecting to live chat…" }}
    </p>
    <MessageList :room="room" />
    <MessageComposer :room="room" />
  </aside>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useChat, type ChatWindowState } from "../../stores/chat";
import { roomTheme } from "../../utils/roomTheme";
import { useDraggablePanel } from "../../composables/useDraggablePanel";
import type { Room } from "../../types";
import ChatWindowHeader from "./ChatWindowHeader.vue";
import MessageList from "./MessageList.vue";
import MessageComposer from "./MessageComposer.vue";
const props = defineProps<{ room: Room; entry: ChatWindowState }>();
const emit = defineEmits<{ focusPin: [id: string, bounds?: DOMRect]; edit: [id: string] }>();
const chat = useChat();
const panel = ref<HTMLElement | null>(null);
const movable = useDraggablePanel(panel, props.entry.slot);
</script>

<style scoped src="../../styles/chat-panel.css"></style>
<style scoped src="../../styles/feedback.css"></style>
