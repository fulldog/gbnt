import type { AuthUser, LoginResult } from "@gbnt/api-client";
import { parseAuthUser } from "./response";
import type { MiniappAuthUser } from "./types";

export const MINIAPP_TOKEN_KEY = "gbnt.miniapp.token";
export const MINIAPP_EXPIRES_AT_KEY = "gbnt.miniapp.expires-at";
export const MINIAPP_USER_KEY = "gbnt.miniapp.user";
let sessionRevision = 0;

/** 仅登录/退出更换会话；同一会话的 Token 续期不淘汰并发请求。 */
export function getSessionRevision(): number {
  return sessionRevision;
}

function readStorage<T>(key: string): T | null {
  try {
    const value = uni.getStorageSync<T>(key);
    return value === "" || value === null || value === undefined ? null : value;
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: unknown): void {
  try {
    uni.setStorageSync(key, value);
  } catch {
    // Storage can be unavailable in restricted runtimes; the in-memory store
    // still keeps the current page session usable.
  }
}

function removeStorage(key: string): void {
  try {
    uni.removeStorageSync(key);
  } catch {
    // Removing an already unavailable storage entry is safe to ignore.
  }
}

export function readAccessToken(): string | null {
  const token = readStorage<unknown>(MINIAPP_TOKEN_KEY);
  if (typeof token !== "string" || !token.trim()) return null;

  const expiresAt = readStorage<unknown>(MINIAPP_EXPIRES_AT_KEY);
  if (typeof expiresAt === "string") {
    const expiresAtMs = Date.parse(expiresAt);
    if (Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()) {
      clearSession();
      return null;
    }
  }

  return token;
}

export function writeAccessToken(token: string, expiresAt?: string | null): void {
  writeStorage(MINIAPP_TOKEN_KEY, token);
  if (expiresAt) {
    writeStorage(MINIAPP_EXPIRES_AT_KEY, expiresAt);
  } else {
    removeStorage(MINIAPP_EXPIRES_AT_KEY);
  }
}

export function readStoredUser(): MiniappAuthUser | null {
  const value = readStorage<unknown>(MINIAPP_USER_KEY);
  try {
    return parseAuthUser(value);
  } catch {
    return null;
  }
}

export function writeStoredUser(user: AuthUser): void {
  writeStorage(MINIAPP_USER_KEY, user);
}

export function writeSession(result: LoginResult): void {
  sessionRevision += 1;
  writeAccessToken(result.token, result.expires_at);
  writeStoredUser(result.user);
}

export function clearSession(): void {
  sessionRevision += 1;
  removeStorage(MINIAPP_TOKEN_KEY);
  removeStorage(MINIAPP_EXPIRES_AT_KEY);
  removeStorage(MINIAPP_USER_KEY);
}
