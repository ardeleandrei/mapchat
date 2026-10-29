<template>
        <form class="composer" @submit.prevent="send">
          <label class="sr-only" :for="'display-name-' + room.id">Your name</label>
          <input :id="'display-name-' + room.id" v-model="username" type="text" maxlength="40"
            placeholder="write your user name here" autocomplete="nickname" required @blur="saveName" />
          <p v-if="nameError" class="field-error" role="alert">{{ nameError }}</p>
          <div class="message-row">
            <label class="sr-only" :for="'message-' + room.id">Your message</label>
            <input :id="'message-' + room.id" v-model="draft" type="text" maxlength="2000"
              placeholder="write message here" autocomplete="off" required />
            <button type="submit" :disabled="!canSend">
              {{ chat.sending[room.id] ? "Sending…" : "Submit" }}
            </button>
          </div>
        </form>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useChat } from "../../stores/chat";
import type { Room } from "../../types";
const props = defineProps<{ room: Room }>();
const chat = useChat();
const username = ref(chat.user?.username ?? ""), nameError = ref("");
const draft = computed({
  get: () => chat.drafts[props.room.id] ?? "",

  set: value => { chat.drafts[props.room.id] = value; },
});
const canSend = computed(() => chat.ready && username.value.trim().length > 0 &&
  draft.value.trim().length > 0 && !chat.sending[props.room.id]);

async function saveName() {
  nameError.value = "";
  if (!username.value.trim() || !chat.ready) return;
  try { await chat.saveName(username.value); }
  catch (cause) { nameError.value = cause instanceof Error ? cause.message : "Name could not be saved."; }
}

async function send() {
  const id = props.room.id, text = draft.value;
  if (!canSend.value) return;
  if (await chat.send(id, username.value, text)) {
    if (chat.drafts[id] === text) chat.drafts[id] = "";
  }
}

watch(() => [chat.user?.id, chat.user?.username], () => { username.value = chat.user?.username ?? ""; });
</script>

<style scoped src="../../styles/form-controls.css"></style>
<style scoped src="../../styles/feedback.css"></style>

<style scoped>
.composer { flex-shrink: 0; padding: 14px 16px 16px; border-top: 1px solid #26303a0b; background: #ffffff24; }
.message-row { display: flex; gap: 9px; margin-top: 10px; }
.message-row input { flex: 1; width: 0; }
.message-row button { flex-shrink: 0; min-width: 72px; padding: 7px 12px; border: 1px solid #26303a; border-radius: 11px; background: #26303a; color: #fff; font-size: 13px; font-weight: 600; }
.message-row button:hover:not(:disabled) { background: #3c4855; }
@media (max-width: 600px) {
  .composer { padding: 12px; }
}
</style>
