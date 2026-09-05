import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { MiniappLoginResult } from "@/api/types";
import { writeSession } from "@/api/session";
import { useAuthStore } from "@/stores/auth";

const api = vi.hoisted(() => ({ getMe: vi.fn(), login: vi.fn(), logout: vi.fn(), changePassword: vi.fn() }));
vi.mock("@/api/runtime", () => ({ miniappApi: { auth: api } }));
const storage = new Map<string, unknown>();
vi.stubGlobal("uni", {
  getStorageSync: (key: string) => storage.get(key) ?? "",
  setStorageSync: (key: string, value: unknown) => storage.set(key, value),
  removeStorageSync: (key: string) => storage.delete(key),
});

function session(id: number): MiniappLoginResult {
  return { token: `token-${id}`, expires_at: "2099-01-01T00:00:00Z", user: {
    id, username: `account-${id}`, name: `人员${id}`, org_id: id, role_id: 1,
    phone: "", is_super_admin: false, apis: [], org_name: null, org_path: null, role_name: null,
  } };
}

beforeEach(() => {
  storage.clear();
  vi.clearAllMocks();
  setActivePinia(createPinia());
  writeSession(session(1));
});

describe("authenticated profile request isolation", () => {
  it("ignores a profile response that finishes after switching accounts", async () => {
    let resolveProfile: (user: MiniappLoginResult["user"]) => void = () => {};
    api.getMe.mockImplementationOnce(() => new Promise((resolve) => { resolveProfile = resolve; }));
    api.login.mockResolvedValueOnce(session(2));
    const store = useAuthStore();
    const refresh = store.refreshUser();
    await store.signIn({ username: "account-2", password: "fixture" });
    resolveProfile(session(1).user);
    await refresh;
    expect(store.user?.id).toBe(2);
    expect(store.token).toBe("token-2");
  });

  it("does not restore a signed-out user when a cold-start request finishes late", async () => {
    let resolveProfile: (user: MiniappLoginResult["user"]) => void = () => {};
    api.getMe.mockImplementationOnce(() => new Promise((resolve) => { resolveProfile = resolve; }));
    const store = useAuthStore();
    const restoring = store.restore();
    store.reset();
    resolveProfile(session(1).user);
    await restoring;
    expect(store.user).toBeNull();
    expect(store.token).toBeNull();
  });

  it("does not persist a pending login after the session has been reset", async () => {
    let resolveLogin: (result: MiniappLoginResult) => void = () => {};
    api.login.mockImplementationOnce(() => new Promise((resolve) => { resolveLogin = resolve; }));
    const store = useAuthStore();
    const pending = store.signIn({ username: "account-2", password: "fixture" });
    store.reset();
    resolveLogin(session(2));
    await expect(pending).rejects.toThrow("登录请求已失效");
    expect(store.isAuthenticated).toBe(false);
    expect(store.loading).toBe(false);
  });
});
