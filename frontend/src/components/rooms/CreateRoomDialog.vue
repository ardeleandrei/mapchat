<template>
  <dialog ref="dialog" class="room-dialog" aria-label="Create a chatroom" @cancel="cancel">
    <RoomForm ref="form" v-model:title="title" heading="Create a chatroom" submit-label="Create"
      :busy="busy" :error="error" @submit="create" @cancel="cancel()" />
  </dialog>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useChat } from "../../stores/chat";
import RoomForm from "./RoomForm.vue";

const props = defineProps<{ location: { longitude: number; latitude: number } }>();
const emit = defineEmits<{ close: [] }>();
const chat = useChat();
const title = ref("New chatroom");
const dialog = ref<HTMLDialogElement | null>(null);
const form = ref<InstanceType<typeof RoomForm> | null>(null);
const busy = ref(false), error = ref("");
onMounted(() => { dialog.value?.showModal(); form.value?.focusTitle(); });

function cancel(event?: Event) {
  event?.preventDefault();
  if (!busy.value) emit("close");
}

async function create() {
  if (busy.value || !title.value.trim()) return;
  busy.value = true; error.value = "";
  try {
    if (await chat.createRoom(props.location.longitude, props.location.latitude, false, title.value.trim())) {
      emit("close");
    } else error.value = chat.error || "Could not create the room. Try again.";
  } catch (cause) { error.value = cause instanceof Error ? cause.message : "Could not create the room."; }
  finally { busy.value = false; }
}
</script>

<style scoped src="../../styles/room-dialog.css"></style>
