<template>
    <nav v-if="minimized.length" class="minimized-chats" aria-label="Minimized chats">
      <span class="sidebar-label">Chats</span>
      <div v-for="{ room } in minimized" :key="room.id" class="minimized-chat" :style="roomTheme(room.id, room.color)">
        <button class="restore-chat" :aria-label="'Restore ' + room.title" @click="chat.selectRoom(room)">
          <span class="chat-color" aria-hidden="true"></span><span>{{ room.title }}</span>
        </button>
        <button class="close-minimized" :aria-label="'Close ' + room.title" @click="chat.closeRoom(room.id)">×</button>
      </div>
    </nav>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useChat } from "../../stores/chat";
import { roomTheme } from "../../utils/roomTheme";
const chat = useChat();
const minimized = computed(() => chat.openChats.filter(item => item.entry.minimized));
</script>


<style scoped>
.minimized-chats { position: absolute; top: 90px; left: 12px; z-index: 100000; display: flex; flex-direction: column; gap: 8px; width: 174px; max-width: calc(100% - 24px); max-height: calc(100% - 140px); overflow-y: auto; padding: 10px; border: 1px solid #ffffffa0; border-radius: 18px; background: #ffffffe0; backdrop-filter: blur(14px); box-shadow: 0 8px 28px #1e293b20; }
.sidebar-label { font-size: 11px; color: #65717b; padding: 0 4px 2px; font-weight: 600; }
.minimized-chat { display: flex; min-height: 38px; flex-shrink: 0; border: 1px solid var(--room-pin); border-radius: 11px; background: var(--room-tint); }
.restore-chat { display: flex; flex: 1; min-width: 0; align-items: center; gap: 8px; padding: 9px; background: transparent; border: 0; text-align: left; font-size: 12px; }
.restore-chat>span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chat-color { width: 8px; height: 8px; flex-shrink: 0; border-radius: 50%; background: var(--room-pin); }
.close-minimized { border: 0; background: transparent; padding: 4px 9px; border-radius: 10px; font-size: 18px; }
</style>
