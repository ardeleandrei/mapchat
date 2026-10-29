import { ref } from "vue";
import { defineStore } from "pinia";
import type { User } from "../types";
export const useSession = defineStore("session", () => {
  const user = ref<User | null>(null), ready = ref(false), starting = ref(false), savingName = ref(false);
  return { user, ready, starting, savingName };
});
