import type { AdminLoginInput, AuthUser } from "@gbnt/api-client";
import { defineStore } from "pinia";
import { computed, shallowRef } from "vue";
import { adminApi } from "@/api/runtime";
import {
  clearSession,
  readAccessToken,
  readRememberedAccount,
  readStoredUser,
  writeRememberedAccount,
  writeSession,
  writeStoredUser,
} from "@/api/session";

export const useAuthStore = defineStore("auth", () => {
  const token = shallowRef<string | null>(readAccessToken());
  const user = shallowRef<AuthUser | null>(readStoredUser());
  const initialized = shallowRef(false);
  const loading = shallowRef(false);
  const rememberedAccount = shallowRef(readRememberedAccount());

  const isAuthenticated = computed(() => Boolean(token.value && user.value));

  function applyUser(nextUser: AuthUser): void {
    user.value = nextUser;
    writeStoredUser(nextUser);
  }

  function reset(): void {
    clearSession();
    token.value = null;
    user.value = null;
  }

  async function signIn(input: AdminLoginInput, remember: boolean): Promise<void> {
    loading.value = true;
    try {
      const result = await adminApi.auth.login(input);
      writeSession(result);
      token.value = result.token;
      user.value = result.user;
      rememberedAccount.value = remember ? input.username : "";
      writeRememberedAccount(remember ? input.username : null);
    } finally {
      loading.value = false;
    }
  }

  async function restore(): Promise<void> {
    if (initialized.value) return;
    initialized.value = true;

    if (!token.value) {
      reset();
      return;
    }

    try {
      applyUser(await adminApi.auth.getMe());
    } catch {
      reset();
    }
  }

  async function signOut(): Promise<void> {
    try {
      if (token.value) await adminApi.auth.logout();
    } finally {
      reset();
    }
  }

  return {
    initialized,
    isAuthenticated,
    loading,
    rememberedAccount,
    token,
    user,
    applyUser,
    reset,
    restore,
    signIn,
    signOut,
  };
});
