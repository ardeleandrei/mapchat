<template>
  <button ref="profileButton" type="button" class="profile-button" :disabled="!chat.ready"
    aria-label="Open your profile" aria-haspopup="dialog" :aria-expanded="open" aria-controls="user-profile-dialog"
    @click="open = true">
    <span class="profile-avatar" aria-hidden="true">{{ initial }}</span>
    <span class="profile-label"><span>{{ chat.user?.registered ? "Your profile" : "Wolfchatter" }}</span><strong>{{ chat.user?.registered ? chat.user.username : "Sign in / Create account" }}</strong></span>
  </button>
  <ProfileDialog v-if="open && profileMode" @close="close" />
  <AuthDialog v-else-if="open" @close="close" />
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useChat } from "../../stores/chat";
import ProfileDialog from "./ProfileDialog.vue";
import AuthDialog from "./AuthDialog.vue";

const open = defineModel<boolean>("open", { default: false });
const chat = useChat();
const profileMode = ref(false);
watch(open, value => { if (value) profileMode.value = Boolean(chat.user?.registered); }, { immediate: true, flush: "sync" });
const profileButton = ref<HTMLButtonElement | null>(null);
const initial = computed(() => [...(chat.user?.username.trim() || "?")][0]?.toUpperCase());

async function close() {
  open.value = false;
  await nextTick();
  profileButton.value?.focus({ preventScroll: true });
}
</script>

<style scoped>
.profile-button { position: absolute; top: 14px; left: 56px; z-index: 900; display: flex; align-items: center; gap: 9px; max-width: min(260px, calc(100% - 112px)); padding: 7px 13px 7px 8px; border: 1px solid #ffffffc0; border-radius: 16px; background: #fffffff0; box-shadow: 0 4px 18px #1e293b18; text-align: left; }
.profile-button:hover:not(:disabled) { background: #fff; }
.profile-avatar { display: grid; place-items: center; flex-shrink: 0; width: 32px; height: 32px; border-radius: 11px; background: #e4eee9; color: #345b4a; font-size: 15px; font-weight: 650; }
.profile-label { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.profile-label>span { font-size: 10px; color: #65717b; }
.profile-label strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; font-weight: 600; }
</style>
