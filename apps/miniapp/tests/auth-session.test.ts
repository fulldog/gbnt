import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type LoginResult } from "@gbnt/api-client";
import {
  MINIAPP_EXPIRES_AT_KEY,
  MINIAPP_TOKEN_KEY,
  clearSession,
  readAccessToken,
  readStoredUser,
  writeSession,
} from "@/api/session";
import { normalizeMineScope } from "@/composables/mine/useMineIssueList";
import { isUnauthorizedSessionError } from "@/stores/auth";

const storage = new Map<string, unknown>();

vi.stubGlobal("uni", {
  getStorageSync: (key: string) => storage.get(key) ?? "",
  setStorageSync: (key: string, value: unknown) => storage.set(key, value),
  removeStorageSync: (key: string) => storage.delete(key),
});

const loginResult: LoginResult = {
  token: "token-1",
  expires_at: "2099-01-01T00:00:00Z",
  user: {
    id: 7,
    username: "inspector",
    name: "巡查人员",
    phone: "",
    org_id: 21,
    role_id: 3,
    is_super_admin: false,
    apis: [],
  },
};

beforeEach(() => {
  storage.clear();
});

describe("miniapp session storage", () => {
  it("clears sessions only for explicit unauthorized responses", () => {
    expect(
      isUnauthorizedSessionError(new ApiError("凭证失效", { status: 401 })),
    ).toBe(true);
    expect(
      isUnauthorizedSessionError(
        new ApiError("业务层凭证失效", { status: 200, code: 401 }),
      ),
    ).toBe(true);
    expect(
      isUnauthorizedSessionError(new ApiError("网络请求失败", { status: 0 })),
    ).toBe(false);
  });

  it("writes and reads the authenticated session", () => {
    writeSession(loginResult);

    expect(readAccessToken()).toBe("token-1");
    expect(readStoredUser()).toEqual({ ...loginResult.user, org_name: null, org_path: null, role_name: null });
  });

  it("clears an expired session before returning a token", () => {
    storage.set(MINIAPP_TOKEN_KEY, "expired-token");
    storage.set(MINIAPP_EXPIRES_AT_KEY, "2000-01-01T00:00:00Z");

    expect(readAccessToken()).toBeNull();
    expect(storage.has(MINIAPP_TOKEN_KEY)).toBe(false);
  });

  it("clears all persisted authentication data", () => {
    writeSession(loginResult);
    clearSession();

    expect(readAccessToken()).toBeNull();
    expect(readStoredUser()).toBeNull();
  });
});

describe("mine scope", () => {
  it("accepts only backend-supported scope values", () => {
    expect(normalizeMineScope("reported")).toBe("reported");
    expect(normalizeMineScope("pending")).toBe("pending");
    expect(normalizeMineScope("done")).toBe("done");
    expect(normalizeMineScope("inspected")).toBe("reported");
  });
});
