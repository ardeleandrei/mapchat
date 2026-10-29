<template>
  <dialog ref="dialog" class="room-dialog" role="alertdialog" aria-labelledby="delete-room-title"
    aria-describedby="delete-room-description" @cancel="cancel">
    <form @submit.prevent="remove" :aria-busy="busy">
      <h2 id="delete-room-title">Delete chatroom?</h2>
      <p id="delete-room-description">Delete “{{ room.title }}” and all its messages for everyone? This cannot be undone.</p>
      <p v-if="error" class="field-error" role="alert">{{ error }}</p>
      <div class="delete-actions">
        <button ref="cancelButton" type="button" :disabled="busy" @click="cancel()">Cancel</button>
        <button type="submit" class="confirm-delete" :disabled="busy">{{ busy ? "Deleting…" : "Delete chatroom" }}</button>
      </div>
    </form>
  </dialog>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useChat } from "../../stores/chat";
import type { Room } from "../../types";

const props = defineProps<{ room: Room }>();
const emit = defineEmits<{ close: [] }>();
const chat = useChat();
const dialog = ref<HTMLDialogElement | null>(null), cancelButton = ref<HTMLButtonElement | null>(null);
const busy = ref(false), error = ref("");
onMounted(() => { dialog.value?.showModal(); cancelButton.value?.focus(); });

function cancel(event?: Event) {
  event?.preventDefault();
  if (!busy.value) emit("close");
}

async function remove() {
  if (busy.value) return;
  busy.value = true; error.value = "";
  try { await chat.deleteRoom(props.room.id); emit("close"); }
  catch (cause) { error.value = cause instanceof Error ? cause.message : "Could not delete the room. Try again."; }
  finally { busy.value = false; }
}
</script>

<style scoped src="../../styles/room-dialog.css"></style>
<style scoped src="../../styles/feedback.css"></style>

<style scoped>
h2 { margin: 0 0 16px; font-size: 19px; font-weight: 650; }
p { line-height: 1.6; overflow-wrap: anywhere; }
.delete-actions { display: flex; justify-content: flex-end; gap: 9px; margin-top: 24px; }
.delete-actions button { padding: 9px 14px; border: 1px solid #26303a21; border-radius: 11px; background: #f0f3f6; font-size: 13px; font-weight: 600; }
.delete-actions .confirm-delete { background: #9b3227; border-color: #9b3227; color: #fff; }
.confirm-delete:hover:not(:disabled) { background: #7b281f; }
</style>
