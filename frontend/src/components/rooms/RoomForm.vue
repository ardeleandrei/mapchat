<template>
  <form class="room-form" @submit.prevent="submit" :aria-busy="busy">
    <h2>{{ heading }}</h2>
    <label :for="id + '-title'">Chatroom name</label>
    <input :id="id + '-title'" ref="titleInput" v-model="title" maxlength="80" required autofocus :disabled="busy" />
    <template v-if="color !== undefined">
      <label :for="id + '-color'">Room and pin color</label>
      <div class="color-fields">
        <input :id="id + '-color'" v-model="color" type="color" :disabled="busy" />
        <label class="sr-only" :for="id + '-hex'">Color hex code</label>
        <input :id="id + '-hex'" v-model="color" pattern="#[a-fA-F0-9]{6}" maxlength="7"
          placeholder="#3f97ce" required :disabled="busy" />
      </div>
    </template>
    <p v-if="error || validationError" class="field-error" role="alert">{{ error || validationError }}</p>
    <div class="dialog-actions">
      <button type="button" :disabled="busy" @click="emit('cancel')">Cancel</button>
      <button type="submit" :disabled="busy || !title.trim()">{{ busy ? "Saving…" : submitLabel }}</button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { ref, useId } from "vue";

defineProps<{ heading: string; submitLabel: string; busy: boolean; error: string }>();
const emit = defineEmits<{ submit: []; cancel: [] }>();
const title = defineModel<string>("title", { required: true });
const color = defineModel<string>("color");
const id = useId();
const titleInput = ref<HTMLInputElement | null>(null);
const validationError = ref("");

function submit() {
  validationError.value = "";
  if (!title.value.trim()) { validationError.value = "Enter a chatroom name."; return; }
  emit("submit");
}
defineExpose({ focusTitle: () => titleInput.value?.select() });
</script>

<style scoped src="../../styles/form-controls.css"></style>
<style scoped src="../../styles/feedback.css"></style>

<style scoped>
.room-form h2 { margin: 0 0 22px; font-size: 19px; letter-spacing: -.4px; font-weight: 650; }
.room-form label { display: block; margin: 16px 0 7px; font-size: 12px; font-weight: 600; color: #56616c; }
.room-form input[type=color] { width: 54px; height: 38px; padding: 4px; cursor: pointer; }
.color-fields { display: flex; align-items: center; gap: 10px; }
.color-fields input[type=color] { flex-shrink: 0; }
.dialog-actions { display: flex; justify-content: flex-end; gap: 9px; margin-top: 26px; }
.dialog-actions button { padding: 9px 14px; border: 1px solid #26303a21; border-radius: 11px; background: #f0f3f6; font-size: 13px; font-weight: 600; }
.dialog-actions button[type=submit] { border-color: #26303a; background: #26303a; color: #fff; }
</style>
