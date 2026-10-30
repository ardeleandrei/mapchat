<template>
    <nav v-if="chat.user?.registered || chat.sidebarRooms.length || chat.sidebarError" class="minimized-chats" aria-label="Chatrooms">
      <p v-if="chat.sidebarError || chat.unreadError" class="sidebar-error" role="status">{{ chat.sidebarError || chat.unreadError }} <button @click="chat.refreshSidebar">Retry</button></p>
      <section v-if="chat.user?.registered" class="sidebar-section" aria-labelledby="my-chatrooms-title">
        <h2 id="my-chatrooms-title" class="sidebar-label">My Chatrooms</h2>
        <ChatSidebarItem v-for="room in chat.myChatrooms" :key="room.id" :room="room" />
        <p v-if="!chat.myChatrooms.length" class="empty-section">Your created chatrooms will appear here.</p>
      </section>
      <section class="sidebar-section" aria-labelledby="recent-chats-title">
        <h2 id="recent-chats-title" class="sidebar-label">Recent Chats</h2>
        <ChatSidebarItem v-for="room in chat.recentChatrooms" :key="room.id" :room="room" />
        <p v-if="!chat.recentChatrooms.length" class="empty-section">Chats you message in will appear here.</p>
      </section>
    </nav>
</template>

<script setup lang="ts">
import { useChat } from "../../stores/chat";
import ChatSidebarItem from "./ChatSidebarItem.vue";
const chat = useChat();
</script>


<style scoped>
.minimized-chats { position: absolute; top: 90px; left: 12px; z-index: 100000; display: flex; flex-direction: column; gap: 8px; width: 174px; max-width: calc(100% - 24px); max-height: calc(100% - 140px); overflow-y: auto; padding: 10px; border: 1px solid #ffffffa0; border-radius: 18px; background: #ffffffe0; backdrop-filter: blur(14px); box-shadow: 0 8px 28px #1e293b20; }
.sidebar-section { display: flex; flex-direction: column; gap: 8px; flex-shrink: 0; }
.sidebar-section + .sidebar-section { margin-top: 6px; padding-top: 12px; border-top: 1px solid #26303a16; }
.sidebar-label { margin: 0; font-size: 11px; color: #65717b; padding: 0 4px 2px; font-weight: 600; }
.empty-section { margin: 0; padding: 2px 4px 5px; font-size: 11px; color: #65717b; line-height: 1.5; }
.sidebar-error { margin: 0; padding: 4px; font-size: 11px; color: #9a352d; }
.sidebar-error button { padding: 0; border: 0; background: transparent; text-decoration: underline; font: inherit; }
</style>
