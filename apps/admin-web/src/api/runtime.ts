import { inject } from "vue";
import type { InjectionKey } from "vue";
import { createAdminApi } from "./index";
import type { AdminApi } from "./index";
import { clearSession, readAccessToken, writeAccessToken } from "./session";

function redirectToLogin(): void {
  if (window.location.pathname === "/login") return;
  const redirect = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  window.location.assign(`/login?redirect=${encodeURIComponent(redirect)}`);
}

export const adminApi = createAdminApi({
  baseUrl: import.meta.env.VITE_API_BASE_URL?.trim() ?? "",
  timeoutMs: 30_000,
  getAccessToken: readAccessToken,
  onTokenRenewed: (token, expiresAt) => writeAccessToken(token, expiresAt),
  onUnauthorized: () => {
    clearSession();
    redirectToLogin();
  },
});

export const adminApiKey: InjectionKey<AdminApi> = Symbol("admin-api");

export function useAdminApi(): AdminApi {
  const api = inject(adminApiKey);
  if (!api) {
    throw new Error("管理端 API 尚未注入");
  }
  return api;
}
