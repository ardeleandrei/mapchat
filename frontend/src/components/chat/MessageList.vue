<template>
        <div ref="thread" class="thread" role="log" :aria-label="'Messages in ' + room.title" aria-live="polite"
          aria-relevant="additions" :aria-busy="state.loading">
          <button v-if="state.before" class="load-older"
            :disabled="state.loading" @click="older">Load earlier messages</button>
          <p v-if="state.loading && !state.loaded" class="thread-note"
            role="status">Loading messages…</p>
          <p v-else-if="state.loaded && !state.items.length"
            class="thread-note">No messages yet.</p>
          <article v-for="message in state.items" :key="message.id" class="message">
            <strong class="message-user">{{ message.username }}:</strong>
            <div class="message-content">
              <p>{{ message.text }}</p>
              <time :datetime="message.createdAt" :title="fullDate(message.createdAt)">{{ date(message.createdAt) }}</time>
            </div>
          </article>
        </div>
        <div v-if="state.error" class="notice error" role="alert">
          {{ state.error }}
          <button @click="chat.loadHistory(room.id)">Refresh</button>
        </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch, onMounted } from "vue";
import { useChat } from "../../stores/chat";
import type { Room } from "../../types";
const props = defineProps<{ room: Room }>();
const chat = useChat();
const state = computed(() => chat.history(props.room.id));
const thread = ref<HTMLDivElement | null>(null);

const date = (value: string) => new Intl.DateTimeFormat(undefined, {
  day: "2-digit", month: "2-digit", year: "numeric",
}).format(new Date(value));

const fullDate = (value: string) => new Date(value).toLocaleString();

async function older() {
  if (!thread.value) return;
  const oldHeight = thread.value.scrollHeight, oldTop = thread.value.scrollTop;
  await chat.loadHistory(props.room.id, true); await nextTick();
  if (thread.value) thread.value.scrollTop = thread.value.scrollHeight - oldHeight + oldTop;
}
watch(() => state.value.items.at(-1)?.id, async () => {
  const nearBottom = !thread.value ||
    thread.value.scrollHeight - thread.value.scrollTop - thread.value.clientHeight < 80;
  await nextTick();
  if (nearBottom && thread.value) thread.value.scrollTop = thread.value.scrollHeight;
}, { flush: "pre" });
onMounted(() => { if (thread.value) thread.value.scrollTop = thread.value.scrollHeight; });

</script>

<style scoped src="../../styles/feedback.css"></style>

<style scoped>
.thread { flex: 1; min-height: 0; overflow-y: auto; padding: 18px 16px 8px; scrollbar-width: thin; scrollbar-color: #26303a30 transparent; }
.thread-note { margin: 0; padding: 22px 0; color: #65717b; text-align: center; font-size: 13px; }
.message { display: grid; grid-template-columns: 80px minmax(0, 1fr); gap: 10px; margin-bottom: 18px; line-height: 1.5; }
.message-user { overflow-wrap: anywhere; font-size: 12px; font-weight: 600; }
.message-content { min-width: 0; padding-bottom: 12px; border-bottom: 1px solid #26303a0d; }
.message-content p { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.message-content time { display: block; margin-top: 7px; font-size: 11px; color: #65717b; text-align: right; font-variant-numeric: tabular-nums; }
.load-older { border: 0; padding: 2px 4px; background: transparent; font: inherit; text-decoration: underline; }
.load-older { display: block; margin: 0 auto 14px; padding: 6px 10px; border: 1px solid #26303a12; border-radius: 20px; background: #ffffff70; font-size: 12px; text-decoration: none; }
@media (max-width: 600px) {
  .message { grid-template-columns: 64px minmax(0, 1fr); }
}
</style>
