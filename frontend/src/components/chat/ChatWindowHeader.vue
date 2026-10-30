<template>
        <div :ref="movable.handle" class="room-heading" :class="{ 'is-dragging': movable.dragging.value }" tabindex="0" aria-label="Move chat window with arrow keys"
          title="Drag to move; double-click to focus the pin; use arrow keys to move"
          @dblclick.stop.prevent="emit('focusPin')"
          @keydown="movable.keyMove">
          <div class="room-title-row">
            <h1>{{ room.title }}</h1>
          </div>
          <div class="window-actions">
            <button type="button" :aria-label="'Minimize ' + room.title" title="Minimize" @click="emit('minimize')">−</button>
            <button type="button" :aria-label="'Close ' + room.title" title="Close" @click="emit('close')">×</button>
          </div>
          <button v-if="canEdit" class="edit-room" title="Edit title and color"
            aria-label="Edit chatroom" @click="emit('edit')">Edit</button>
        </div>
</template>

<script setup lang="ts">
import type { Room } from "../../types";
import type { useDraggablePanel } from "../../composables/useDraggablePanel";
defineProps<{ room: Room; canEdit: boolean; movable: ReturnType<typeof useDraggablePanel> }>();
const emit = defineEmits<{ focusPin: []; edit: []; minimize: []; close: [] }>();
</script>

<style scoped>
.room-heading {
  position: relative; padding: 22px 12px 10px; flex-shrink: 0;
  background: color-mix(in srgb, var(--room-heading, #eef2f5) 65%, transparent);
  border-bottom: 1px solid #26303a0b;
  cursor: grab; touch-action: none; user-select: none;
}
.room-heading::before { content: ""; position: absolute; top: 9px; left: calc(50% - 14px); width: 28px; height: 3px; border-radius: 8px; background: #26303a26; }
.room-heading.is-dragging { cursor: grabbing; }
.room-heading:focus-visible { outline: 2px solid #237abb; outline-offset: -5px; border-radius: 18px 18px 0 0; }
.room-title-row { display: flex; align-items: center; gap: 8px; padding-right: 60px; }
h1 { flex: 1; min-width: 0; margin: 0; padding: 0; font-size: 16px; line-height: 1.35; font-weight: 650; letter-spacing: -.25px; text-align: left; overflow-wrap: anywhere; }
.window-actions { position: absolute; top: 12px; right: 10px; display: flex; gap: 4px; }
.window-actions button { width: 25px; height: 25px; display: grid; place-items: center; padding: 0; border: 1px solid #26303a15; border-radius: 50%; background: #ffffff70; font-size: 18px; line-height: 1; }
.window-actions button:hover { background: #ffffffd0; }
.edit-room { display: block; margin-top: 8px; padding: 3px 8px; border: 1px solid #26303a12; border-radius: 20px; background: #ffffff70; font-size: 12px; font-weight: 500; }
.edit-room:hover { background: #ffffffb8; }
</style>
