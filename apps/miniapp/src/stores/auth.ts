import {
  ApiError,
  type MiniappLoginInput,
  type PasswordInput,
} from "@gbnt/api-client";
import { defineStore } from "pinia";
import { computed, shallowRef } from "vue";
import { miniappApi } from "@/api/runtime";
import type { MiniappAuthUser } from "@/api/types";
import {
  clearSession,
  readAccessToken,
  readStoredUser,
  writeSession,
  writeStoredUser,
} from "@/api/session";

/*
 * getMe 的网络错误不代表凭证失效。只有服务端明确返回 401 时，
 * 才删除本地会话，避免用户在弱网冷启动后被强制退出。
 */
export function isUnauthorizedSessionError(error: unknown): boolean {
  return (
    error instanceof ApiError && (error.status === 401 || error.code === 401)
  );
}

export const useAuthStore = defineStore("auth", () => {
  const token = shallowRef<string | null>(readAccessToken());
  const user = shallowRef<MiniappAuthUser | null>(readStoredUser());
  const initialized = shallowRef(false);
  const loading = shallowRef(false);
  let restorePromise: Promise<void> | null = null;
  let sessionVersion = 0;

  const isAuthenticated = computed(() => Boolean(token.value && user.value));

  function applyUser(nextUser: MiniappAuthUser): void {
    user.value = nextUser;
    writeStoredUser(nextUser);
  }

  function reset(): void {
    sessionVersion += 1;
    restorePromise = null;
    clearSession();
    token.value = null;
    user.value = null;
    loading.value = false;
  }

  async function signIn(input: MiniappLoginInput): Promise<void> {
    const version = ++sessionVersion;
    loading.value = true;
    try {
      const result = await miniappApi.auth.login(input);
      if (version !== sessionVersion) throw new Error("登录请求已失效，请重新登录");
      writeSession(result);
      token.value = result.token;
      user.value = result.user;
      initialized.value = true;
    } finally {
      if (version === sessionVersion) loading.value = false;
    }
  }

  function restore(): Promise<void> {
    const storedToken = readAccessToken();
    if (!storedToken) {
      reset();
      initialized.value = true;
      return Promise.resolve();
    }
    token.value = storedToken;
    if (initialized.value && user.value) return Promise.resolve();
    if (restorePromise) return restorePromise;

    const version = sessionVersion;
    const pendingRestore = (async () => {
      try {
        const restoredUser = await miniappApi.auth.getMe();
        if (version === sessionVersion && token.value === storedToken) applyUser(restoredUser);
      } catch (error) {
        if (version === sessionVersion && isUnauthorizedSessionError(error)) {
          reset();
        }
      }
    })().finally(() => {
      if (version === sessionVersion) initialized.value = true;
      if (restorePromise === pendingRestore) restorePromise = null;
    });
    restorePromise = pendingRestore;
    return restorePromise;
  }

  async function refreshUser(): Promise<void> {
    if (!token.value) {
      reset();
      return;
    }
    const version = sessionVersion;
    const requestedToken = token.value;
    const refreshedUser = await miniappApi.auth.getMe();
    if (version === sessionVersion && token.value === requestedToken) applyUser(refreshedUser);
  }

  async function changePassword(input: PasswordInput): Promise<void> {
    const version = sessionVersion;
    await miniappApi.auth.changePassword(input);
    if (version === sessionVersion) reset();
  }

  async function signOut(): Promise<void> {
    const version = sessionVersion;
    try {
      if (token.value) await miniappApi.auth.logout();
    } finally {
      if (version === sessionVersion) reset();
    }
  }

  return {
    initialized,
    isAuthenticated,
    loading,
    token,
    user,
    applyUser,
    changePassword,
    refreshUser,
    reset,
    restore,
    signIn,
    signOut,
  };
});
