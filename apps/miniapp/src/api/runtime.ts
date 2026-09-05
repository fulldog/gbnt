import { createMiniappApi } from "./index";
import {
  clearSession,
  readAccessToken,
  writeAccessToken,
} from "./session";
import type { UniRequest } from "./transport";
import type { UniUploadFile } from "./attachments";

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim() ?? "";

/** 微信小程序没有 Vite 代理，开发、测试和生产均须显式注入 API Origin。 */
export const apiBaseUrl = configuredBaseUrl;

let redirectingToLogin = false;

function currentPageRoute(): string {
  if (typeof getCurrentPages !== "function") return "";
  const pages = getCurrentPages();
  return pages.length ? pages[pages.length - 1]?.route ?? "" : "";
}

function redirectToLogin(): void {
  if (redirectingToLogin || currentPageRoute() === "pages/login/index") return;
  redirectingToLogin = true;
  uni.reLaunch({
    url: "/pages/login/index",
    complete: () => {
      redirectingToLogin = false;
    },
  });
}

const request: UniRequest = (options) => {
  if (!apiBaseUrl) {
    options.fail({ errMsg: "未配置 VITE_API_BASE_URL" });
    return undefined;
  }
  return (uni.request as unknown as UniRequest)(options);
};

const uploadFile: UniUploadFile = (options) => {
  if (!apiBaseUrl) {
    options.fail({ errMsg: "未配置 VITE_API_BASE_URL" });
    return undefined;
  }
  return (uni.uploadFile as unknown as UniUploadFile)(options);
};

export const miniappApi = createMiniappApi({
  baseUrl: apiBaseUrl,
  timeoutMs: 30_000,
  request,
  uploadFile,
  getAccessToken: readAccessToken,
  onTokenRenewed: (token, expiresAt) => writeAccessToken(token, expiresAt),
  onUnauthorized: () => {
    clearSession();
    redirectToLogin();
  },
});

export function toAssetUrl(path: string | null | undefined): string {
  const value = path?.trim() ?? "";
  if (!value) return "";
  if (/^(?:https?:|data:|wxfile:|blob:)/i.test(value) || value.startsWith("//")) {
    return value;
  }

  const normalizedPath = value.startsWith("/") ? value : `/${value}`;
  return `${apiBaseUrl.replace(/\/+$/, "")}${normalizedPath}`;
}
