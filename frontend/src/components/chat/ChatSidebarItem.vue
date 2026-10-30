<template>
  <div class="sidebar-chat" :style="roomTheme(room.id, room.color)">
    <button class="open-chat" :aria-label="'Open ' + room.title + (count ? ', ' + badge + ' unread messages' : '')" @click="chat.selectRoom(room)">
      <span class="chat-color" aria-hidden="true"></span><span class="chat-title">{{ room.title }}</span>
      <span v-if="count" class="unread-badge" aria-hidden="true">{{ badge }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useChat } from "../../stores/chat";
import { roomTheme } from "../../utils/roomTheme";
import type { Room } from "../../types";

const props = defineProps<{ room: Room }>();
const chat = useChat();
const count = computed(() => chat.unreadCounts[props.room.id] ?? 0);
const badge = computed(() => count.value > 99 ? "99+" : String(count.value));
</script>

<style scoped>
.sidebar-chat { display: flex; min-height: 38px; flex-shrink: 0; border: 1px solid var(--room-pin); border-radius: 11px; background: var(--room-tint); }
.open-chat { display: flex; flex: 1; min-width: 0; align-items: center; gap: 8px; padding: 9px; background: transparent; border: 0; text-align: left; font-size: 12px; }
.chat-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chat-color { width: 8px; height: 8px; flex-shrink: 0; border-radius: 50%; background: var(--room-pin); }
.unread-badge { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; margin-left: auto; width: 26px; height: 26px; border-radius: 50%; background: var(--room-border); color: #fff; font-size: 10px; font-weight: 700; line-height: 1; }
</style>
