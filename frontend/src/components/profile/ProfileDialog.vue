<template>
  <dialog id="user-profile-dialog" ref="dialog" class="room-dialog profile-dialog" aria-labelledby="profile-title"
    aria-describedby="profile-description" @cancel="cancel">
    <form @submit.prevent="save" :aria-busy="busy">
      <h2 id="profile-title">Your profile</h2>
      <p id="profile-description">Your username is shared across all chatrooms.</p>
      <label for="profile-username">Username</label>
      <div class="username-row">
        <input id="profile-username" ref="usernameInput" v-model="username" type="text" maxlength="40"
          autocomplete="nickname" placeholder="Choose a username" required :disabled="busy" :readonly="!editing"
          :tabindex="editing ? 0 : -1" :aria-invalid="Boolean(error)"
          :aria-describedby="error ? 'profile-error' : 'profile-hint'" @input="error = ''" />
        <button v-if="!editing" ref="editButton" type="button" class="edit-username" aria-label="Edit username"
          :disabled="busy || !chat.ready" @click="edit">Edit</button>
      </div>
      <p id="profile-hint" class="profile-hint">Use this username to sign in. Earlier messages keep the name used when sent.</p>
      <p v-if="error" id="profile-error" class="field-error" role="alert">{{ error }}</p>
      <p v-if="!chat.ready" class="field-error" role="alert">Reconnect before saving your profile.</p>
      <div class="profile-actions">
        <button type="button" class="sign-out" :disabled="busy || chat.authBusy || chat.savingName" @click="logout">Sign out</button>
        <button ref="closeButton" type="button" :disabled="busy" @click="cancel()">{{ editing ? "Cancel" : "Close" }}</button>
        <button v-if="editing" type="submit" :disabled="busy || chat.savingName || !chat.ready || !username.trim()">
          {{ busy ? "Saving…" : "Save profile" }}
        </button>
      </div>
    </form>
  </dialog>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref } from "vue";
import { useChat } from "../../stores/chat";

const emit = defineEmits<{ close: [] }>();
const chat = useChat();
const dialog = ref<HTMLDialogElement | null>(null);
const usernameInput = ref<HTMLInputElement | null>(null);
const editButton = ref<HTMLButtonElement | null>(null);
const closeButton = ref<HTMLButtonElement | null>(null);
const username = ref(chat.user?.username ?? "");
const editing = ref(false), busy = ref(false), error = ref("");

onMounted(() => { dialog.value?.showModal(); closeButton.value?.focus({ preventScroll: true }); });

async function edit() {
  editing.value = true; error.value = "";
  await nextTick();
  usernameInput.value?.focus({ preventScroll: true });
}

async function cancel(event?: Event) {
  event?.preventDefault();
  if (busy.value) return;
  if (editing.value) {
    username.value = chat.user?.username ?? "";
    editing.value = false; error.value = "";
    await nextTick();
    editButton.value?.focus({ preventScroll: true });
  } else emit("close");
}

async function save() {
  if (!editing.value || busy.value || !chat.ready || chat.savingName) return;
  busy.value = true; error.value = "";
  try {
    await chat.saveName(username.value);
    emit("close");
  } catch (cause) { error.value = cause instanceof Error ? cause.message : "Your profile could not be saved."; }
  finally { busy.value = false; }
}

async function logout() {
  if (busy.value || chat.authBusy) return;
  busy.value = true; error.value = "";
  try { await chat.logout(); emit("close"); }
  catch (cause) { error.value = cause instanceof Error ? cause.message : "Could not sign out."; }
  finally { busy.value = false; }
}
</script>

<style scoped src="../../styles/room-dialog.css"></style>
<style scoped src="../../styles/form-controls.css"></style>
<style scoped src="../../styles/feedback.css"></style>

<style scoped>
h2 { margin: 0 0 12px; font-size: 20px; letter-spacing: -.4px; }
#profile-description { margin: 0 0 22px; color: #65717b; line-height: 1.5; }
label { display: block; margin-bottom: 8px; font-size: 12px; font-weight: 600; }
.username-row { display: flex; align-items: center; gap: 9px; }
.username-row input { flex: 1; }
.username-row input[readonly] { background: #f0f3f680; box-shadow: none; cursor: default; }
.edit-username { flex-shrink: 0; padding: 9px 12px; border: 1px solid #26303a21; border-radius: 11px; background: #f0f3f6; font-size: 13px; font-weight: 600; }
.profile-hint { margin: 8px 0 0; font-size: 12px; line-height: 1.5; color: #65717b; }
.profile-actions { display: flex; justify-content: flex-end; gap: 9px; margin-top: 24px; }
.profile-actions button { padding: 9px 14px; border: 1px solid #26303a21; border-radius: 11px; background: #f0f3f6; font-size: 13px; font-weight: 600; }
.profile-actions button[type=submit] { border-color: #26303a; background: #26303a; color: #fff; }
.profile-actions .sign-out { margin-right: auto; background: transparent; }
</style>
