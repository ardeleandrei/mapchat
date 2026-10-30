<template>
  <aside ref="panel" class="chat-panel" :class="{ dragging: movable.dragging.value, resizing: resizable.resizing.value }"
    :style="[roomTheme(room.id, room.color), movable.style.value, resizable.style.value, { zIndex: 1000 + entry.order }]"
    :aria-label="'Chatroom: ' + room.title"
    @pointerdown.capture="chat.activateRoom(room.id)" @focusin="chat.activateRoom(room.id)">
    <ChatWindowHeader :room="room" :movable="movable" :can-edit="Boolean(chat.user?.registered && room.createdBy === chat.user.id)"
      @focus-pin="emit('focusPin', room.id, panel?.getBoundingClientRect())"
      @edit="emit('edit', room.id)" @minimize="chat.minimizeRoom(room.id)" @close="chat.closeRoom(room.id)" />
    <p v-if="chat.connection !== 'online' || chat.liveError" class="notice" role="status">
      {{ chat.liveError || "Reconnecting to live chat…" }}
    </p>
    <MessageList :room="room" />
    <MessageComposer :room="room" @edit-profile="emit('editProfile')" />
    <button :ref="resizable.handle" type="button" class="resize-handle" :aria-label="'Resize ' + room.title"
      title="Drag the bottom-left corner to resize; use arrow keys when focused" @keydown="resizable.keyResize"></button>
  </aside>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useChat, type ChatWindowState } from "../../stores/chat";
import { roomTheme } from "../../utils/roomTheme";
import { useDraggablePanel } from "../../composables/useDraggablePanel";
import { useResizablePanel } from "../../composables/useResizablePanel";
import { useWindows } from "../../stores/windows.store";
import type { Room } from "../../types";
import ChatWindowHeader from "./ChatWindowHeader.vue";
import MessageList from "./MessageList.vue";
import MessageComposer from "./MessageComposer.vue";
const props = defineProps<{ room: Room; entry: ChatWindowState }>();
const emit = defineEmits<{ focusPin: [id: string, bounds?: DOMRect]; edit: [id: string]; editProfile: [] }>();
const chat = useChat();
const layout = useWindows();
const userId = chat.user?.id ?? "guest";
const panel = ref<HTMLElement | null>(null);
const movable = useDraggablePanel(panel, props.entry.slot, {
  load: () => layout.positionFor(userId, props.room.id),

  save: position => layout.savePosition(userId, props.room.id, position),
});
const resizable = useResizablePanel(panel, movable.anchor, movable.move);
</script>

<style scoped src="../../styles/chat-panel.css"></style>
<style scoped src="../../styles/feedback.css"></style>

<style scoped>
.resize-handle { position: absolute; bottom: 0; left: 0; width: 28px; height: 28px; padding: 0; border: 0; background: transparent; cursor: nesw-resize; touch-action: none; clip-path: polygon(0 0, 0 100%, 100% 100%); }
.resize-handle::after { content: ""; position: absolute; left: 7px; bottom: 7px; width: 12px; height: 12px; background: repeating-linear-gradient(45deg, transparent 0 3px, var(--room-border, #687e88) 3px 4px); clip-path: polygon(0 0, 0 100%, 100% 100%); opacity: .65; }
.resize-handle:focus-visible { background: var(--room-heading, #e4eee9); outline-offset: -4px; }
.resizing { user-select: none; }
</style>
