<template>
        <form v-if="chat.user?.registered" class="composer" @submit.prevent="send">
          <div class="sender-row">
            <span class="sender-name">Chatting as <strong>{{ chat.user.username }}</strong></span>
            <button type="button" class="edit-profile" :disabled="!chat.ready || chat.authBusy" @click="emit('editProfile')">
              Edit profile
            </button>
          </div>
          <div class="message-row">
            <label class="sr-only" :for="'message-' + room.id">Your message</label>
            <input :id="'message-' + room.id" v-model="draft" type="text" maxlength="2000"
              placeholder="write message here" autocomplete="off" required :disabled="!chat.ready || chat.authBusy" />
            <button type="submit" :disabled="!canSend">
              {{ chat.sending[room.id] ? "Sending…" : "Submit" }}
            </button>
          </div>
        </form>
        <div v-else class="composer guest-composer">
          <p>Sign in to join the conversation.</p>
          <button type="button" class="sign-in" :disabled="!chat.ready || chat.authBusy" aria-haspopup="dialog"
            @click="emit('editProfile')">Sign in</button>
        </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useChat } from "../../stores/chat";
import type { Room } from "../../types";
const props = defineProps<{ room: Room }>();
const emit = defineEmits<{ editProfile: [] }>();
const chat = useChat();
const draft = computed({
  get: () => chat.drafts[props.room.id] ?? "",

  set: value => { chat.drafts[props.room.id] = value; },
});
const canSend = computed(() => chat.ready && chat.user?.registered && Boolean(chat.user.username.trim()) &&
  draft.value.trim().length > 0 && !chat.authBusy && !chat.savingName && !chat.sending[props.room.id]);

async function send() {
  const id = props.room.id, text = draft.value;
  if (!canSend.value) return;
  if (await chat.send(id, text)) {
    if (chat.drafts[id] === text) chat.drafts[id] = "";
  }
}

</script>

<style scoped src="../../styles/form-controls.css"></style>
<style scoped src="../../styles/feedback.css"></style>

<style scoped>
.composer { flex-shrink: 0; padding: 14px 16px 16px; border-top: 1px solid #26303a0b; background: #ffffff24; }
.sender-row { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; font-size: 11px; }
.sender-name { min-width: 0; color: #65717b; overflow-wrap: anywhere; }
.sender-name strong { color: #26303a; font-weight: 600; }
.edit-profile { flex-shrink: 0; border: 0; padding: 3px 0; background: transparent; font-size: 11px; color: #40576a; text-decoration: underline; }
.message-row { display: flex; gap: 9px; margin-top: 10px; }
.message-row input { flex: 1; width: 0; }
.message-row button { flex-shrink: 0; min-width: 72px; padding: 7px 12px; border: 1px solid #26303a; border-radius: 11px; background: #26303a; color: #fff; font-size: 13px; font-weight: 600; }
.message-row button:hover:not(:disabled) { background: #3c4855; }
.guest-composer { display: flex; align-items: center; justify-content: space-between; gap: 14px; }
.guest-composer p { margin: 0; color: #65717b; font-size: 12px; line-height: 1.5; }
.sign-in { flex-shrink: 0; padding: 8px 12px; border: 1px solid #26303a; border-radius: 11px; background: #26303a; color: #fff; font-size: 13px; font-weight: 600; }
.sign-in:hover:not(:disabled) { background: #3c4855; }
@media (max-width: 600px) {
  .composer { padding: 12px; }
}
</style>
