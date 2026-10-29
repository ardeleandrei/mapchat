<template>
  <dialog ref="dialog" class="room-dialog" aria-label="Edit chatroom" @cancel="cancel">
    <RoomForm ref="form" v-model:title="title" v-model:color="color" heading="Edit chatroom" submit-label="Save changes"
      :busy="busy" :error="error" @submit="save" @cancel="cancel()" />
    <button v-if="original.createdBy === chat.user?.id" type="button" class="delete-room" :disabled="busy"
      @click="emit('delete', original.id)">Delete chatroom…</button>
  </dialog>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useChat } from "../../stores/chat";
import { roomColor } from "../../utils/roomTheme";
import type { Room } from "../../types";
import RoomForm from "./RoomForm.vue";

const props = defineProps<{ room: Room }>();
const emit = defineEmits<{ close: []; delete: [id: string] }>();
const chat = useChat();
// Keep the revision captured when editing began so concurrent changes cause a conflict.
const original = props.room;
const title = ref(original.title), color = ref(roomColor(original.id, original.color));
const dialog = ref<HTMLDialogElement | null>(null);
const form = ref<InstanceType<typeof RoomForm> | null>(null);
const busy = ref(false), error = ref("");
onMounted(() => { dialog.value?.showModal(); form.value?.focusTitle(); });

function cancel(event?: Event) {
  event?.preventDefault();
  if (!busy.value) emit("close");
}

async function save() {
  if (busy.value || !title.value.trim()) return;
  busy.value = true; error.value = "";
  try {
    await chat.updateRoom(original, title.value, color.value);
    emit("close");
  } catch (cause) { error.value = cause instanceof Error ? cause.message : "Could not save the room."; }
  finally { busy.value = false; }
}
</script>

<style scoped src="../../styles/room-dialog.css"></style>

<style scoped>
.delete-room { display: block; width: 100%; margin-top: 22px; padding: 10px; border: 1px solid #b23c3640; border-radius: 11px; background: #fff1ec; color: #9b3227; font-size: 13px; }
.delete-room:hover:not(:disabled) { background: #ffe3db; }
</style>
