import {
  ApiError,
  type AuthUser,
  type MiniappLoginInput,
  type PasswordInput,
} from "@gbnt/api-client";
import { defineStore } from "pinia";
import { computed, shallowRef } from "vue";
import { miniappApi } from "@/api/runtime";
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
  const user = shallowRef<AuthUser | null>(readStoredUser());
  const initialized = shallowRef(false);
  const loading = shallowRef(false);
  let restorePromise: Promise<void> | null = null;

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

  async function signIn(input: MiniappLoginInput): Promise<void> {
    loading.value = true;
    try {
      const result = await miniappApi.auth.login(input);
      writeSession(result);
      token.value = result.token;
      user.value = result.user;
      initialized.value = true;
    } finally {
      loading.value = false;
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

    restorePromise = (async () => {
      try {
        applyUser(await miniappApi.auth.getMe());
      } catch (error) {
        if (isUnauthorizedSessionError(error)) {
          reset();
        }
      }
    })().finally(() => {
      initialized.value = true;
      restorePromise = null;
    });

    return restorePromise;
  }

  async function refreshUser(): Promise<void> {
    if (!token.value) {
      reset();
      return;
    }
    applyUser(await miniappApi.auth.getMe());
  }

  async function changePassword(input: PasswordInput): Promise<void> {
    await miniappApi.auth.changePassword(input);
    reset();
  }

  async function signOut(): Promise<void> {
    try {
      if (token.value) await miniappApi.auth.logout();
    } finally {
      reset();
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
