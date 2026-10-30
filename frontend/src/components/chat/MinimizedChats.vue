<template>
    <nav v-if="chat.sidebarRooms.length || chat.sidebarError" class="minimized-chats" aria-label="Minimized chats">
      <span class="sidebar-label">Chats</span>
      <p v-if="chat.sidebarError || chat.unreadError" class="sidebar-error" role="status">{{ chat.sidebarError || chat.unreadError }} <button @click="chat.refreshSidebar">Retry</button></p>
      <div v-for="room in chat.sidebarRooms" :key="room.id" class="minimized-chat" :style="roomTheme(room.id, room.color)">
        <button class="restore-chat" :aria-label="'Restore ' + room.title + (chat.unreadCounts[room.id] ? ', ' + (chat.unreadCounts[room.id]! > 99 ? '99+' : chat.unreadCounts[room.id]) + ' unread messages' : '')" @click="chat.selectRoom(room)">
          <span class="chat-color" aria-hidden="true"></span><span class="chat-title">{{ room.title }}</span>
          <span v-if="chat.unreadCounts[room.id]" class="unread-badge" aria-hidden="true">{{ chat.unreadCounts[room.id]! > 99 ? "99+" : chat.unreadCounts[room.id] }}</span>
        </button>
      </div>
    </nav>
</template>

<script setup lang="ts">
import { useChat } from "../../stores/chat";
import { roomTheme } from "../../utils/roomTheme";
const chat = useChat();
</script>


<style scoped>
.minimized-chats { position: absolute; top: 90px; left: 12px; z-index: 100000; display: flex; flex-direction: column; gap: 8px; width: 174px; max-width: calc(100% - 24px); max-height: calc(100% - 140px); overflow-y: auto; padding: 10px; border: 1px solid #ffffffa0; border-radius: 18px; background: #ffffffe0; backdrop-filter: blur(14px); box-shadow: 0 8px 28px #1e293b20; }
.sidebar-label { font-size: 11px; color: #65717b; padding: 0 4px 2px; font-weight: 600; }
.minimized-chat { display: flex; min-height: 38px; flex-shrink: 0; border: 1px solid var(--room-pin); border-radius: 11px; background: var(--room-tint); }
.restore-chat { display: flex; flex: 1; min-width: 0; align-items: center; gap: 8px; padding: 9px; background: transparent; border: 0; text-align: left; font-size: 12px; }
.chat-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.unread-badge { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; margin-left: auto; width: 26px; height: 26px; border-radius: 50%; background: var(--room-border); color: #fff; font-size: 10px; font-weight: 700; line-height: 1; }
.sidebar-error { margin: 0; padding: 4px; font-size: 11px; color: #9a352d; }
.sidebar-error button { padding: 0; border: 0; background: transparent; text-decoration: underline; font: inherit; }
.chat-color { width: 8px; height: 8px; flex-shrink: 0; border-radius: 50%; background: var(--room-pin); }
</style>
