import type { AuthUser, LoginResult } from "@gbnt/api-client";

const TOKEN_KEY = "gbnt.admin.token";
const EXPIRES_AT_KEY = "gbnt.admin.expires-at";
const USER_KEY = "gbnt.admin.user";
const REMEMBERED_ACCOUNT_KEY = "gbnt.admin.remembered-account";

export function readAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function writeAccessToken(token: string, expiresAt?: string | null): void {
  localStorage.setItem(TOKEN_KEY, token);
  if (expiresAt) {
    localStorage.setItem(EXPIRES_AT_KEY, expiresAt);
  }
}

export function readStoredUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;

  try {
    const value = JSON.parse(raw) as unknown;
    if (typeof value === "object" && value !== null && "id" in value) {
      return value as AuthUser;
    }
  } catch {
    localStorage.removeItem(USER_KEY);
  }
  return null;
}

export function writeStoredUser(user: AuthUser): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function writeSession(result: LoginResult): void {
  writeAccessToken(result.token, result.expires_at);
  writeStoredUser(result.user);
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EXPIRES_AT_KEY);
  localStorage.removeItem(USER_KEY);
}

export function readRememberedAccount(): string {
  return localStorage.getItem(REMEMBERED_ACCOUNT_KEY) ?? "";
}

export function writeRememberedAccount(account: string | null): void {
  if (account) {
    localStorage.setItem(REMEMBERED_ACCOUNT_KEY, account);
    return;
  }
  localStorage.removeItem(REMEMBERED_ACCOUNT_KEY);
}
