<template>
  <dialog id="user-profile-dialog" ref="dialog" class="room-dialog auth-dialog" aria-labelledby="auth-title"
    aria-describedby="auth-description" @cancel="cancel">
    <form @submit.prevent="submit" :aria-busy="chat.authBusy">
      <h2 id="auth-title">{{ registering ? "Create your account" : "Sign in" }}</h2>
      <p id="auth-description">{{ registering ? "Choose a username and password to join the conversation." : "Sign in to chat and manage your rooms from any browser." }}</p>
      <label for="auth-username">Username</label>
      <input id="auth-username" ref="usernameInput" v-model="username" type="text" maxlength="40"
        autocomplete="username" required :disabled="chat.authBusy" @input="error = ''" />
      <label for="auth-password">Password</label>
      <input id="auth-password" v-model="password" type="password" :minlength="registering ? 8 : 1" maxlength="128"
        :autocomplete="registering ? 'new-password' : 'current-password'" required :disabled="chat.authBusy"
        :aria-describedby="registering ? 'password-hint' : undefined" @input="error = ''" />
      <p v-if="registering" id="password-hint" class="hint">Use 8–128 characters. A memorable passphrase works well.</p>
      <template v-if="registering">
        <label for="auth-confirm">Confirm password</label>
        <input id="auth-confirm" v-model="confirmation" type="password" autocomplete="new-password" required
          maxlength="128" :disabled="chat.authBusy" @input="error = ''" />
      </template>
      <p v-if="error" class="field-error" role="alert">{{ error }}</p>
      <div class="actions">
        <button type="button" :disabled="chat.authBusy" @click="cancel()">Cancel</button>
        <button type="submit" :disabled="chat.authBusy || chat.starting || !username.trim() || !password">
          {{ chat.authBusy ? "Please wait…" : registering ? "Create account" : "Sign in" }}
        </button>
      </div>
      <p class="switch-mode">
        {{ registering ? "Already have an account?" : "New to Wolfchatter?" }}
        <button type="button" :disabled="chat.authBusy" @click="switchMode">{{ registering ? "Sign in" : "Create an account" }}</button>
      </p>
    </form>
  </dialog>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { useChat } from "../../stores/chat";

const emit = defineEmits<{ close: [] }>();
const chat = useChat();
const dialog = ref<HTMLDialogElement | null>(null);
const usernameInput = ref<HTMLInputElement | null>(null);
const registering = ref(false), username = ref(chat.user?.username ?? "");
const password = ref(""), confirmation = ref(""), error = ref("");

onMounted(() => { dialog.value?.showModal(); usernameInput.value?.focus(); });
onUnmounted(() => { password.value = ""; confirmation.value = ""; });

function cancel(event?: Event) {
  event?.preventDefault();
  if (!chat.authBusy) emit("close");
}

function switchMode() {
  registering.value = !registering.value;
  password.value = ""; confirmation.value = ""; error.value = "";
  usernameInput.value?.focus();
}

async function submit() {
  if (chat.authBusy || chat.starting) return;
  error.value = "";
  if (registering.value && password.value !== confirmation.value) {
    error.value = "Passwords do not match.";
    return;
  }
  try {
    await chat.authenticate(registering.value ? "register" : "login", username.value, password.value);
    password.value = ""; confirmation.value = "";
    emit("close");
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "Could not sign in. Please try again.";
    password.value = ""; confirmation.value = "";
  }
}
</script>

<style scoped src="../../styles/room-dialog.css"></style>
<style scoped src="../../styles/form-controls.css"></style>
<style scoped src="../../styles/feedback.css"></style>

<style scoped>
h2 { margin: 0 0 12px; font-size: 20px; letter-spacing: -.4px; }
#auth-description { margin: 0 0 22px; color: #65717b; line-height: 1.5; }
label { display: block; margin: 16px 0 8px; font-size: 12px; font-weight: 600; }
.hint { margin: 8px 0 0; color: #65717b; font-size: 12px; line-height: 1.5; }
.actions { display: flex; justify-content: flex-end; gap: 9px; margin-top: 24px; }
.actions button { padding: 9px 14px; border: 1px solid #26303a21; border-radius: 11px; background: #f0f3f6; font-size: 13px; font-weight: 600; }
.actions button[type=submit] { border-color: #26303a; background: #26303a; color: #fff; }
.switch-mode { margin: 22px 0 0; text-align: center; font-size: 12px; color: #65717b; }
.switch-mode button { padding: 3px; border: 0; background: transparent; color: #345b4a; text-decoration: underline; font: inherit; }
</style>
