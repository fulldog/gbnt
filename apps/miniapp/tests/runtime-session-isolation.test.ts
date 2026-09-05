import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UniRequestOptions } from "@/api/transport";
import type { UniUploadFileOptions } from "@/api/attachments";

const storage = new Map<string, unknown>();
let requestOptions: UniRequestOptions | undefined;
let uploadOptions: UniUploadFileOptions | undefined;
const reLaunch = vi.fn();

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("VITE_API_BASE_URL", "https://api.example.test");
  storage.clear();
  reLaunch.mockClear();
  vi.stubGlobal("uni", {
    getStorageSync: (key: string) => storage.get(key) ?? "",
    setStorageSync: (key: string, value: unknown) => storage.set(key, value),
    removeStorageSync: (key: string) => storage.delete(key),
    request: (options: UniRequestOptions) => { requestOptions = options; },
    uploadFile: (options: UniUploadFileOptions) => { uploadOptions = options; },
    reLaunch,
  });
});
afterEach(() => { vi.unstubAllEnvs(); });

async function setup() {
  const session = await import("@/api/session");
  const runtime = await import("@/api/runtime");
  session.writeSession({ token: "old-token", expires_at: "2099-01-01T00:00:00Z", user: {} as never });
  return { session, runtime };
}

describe("old-session HTTP callbacks", () => {
  it("does not let an old 401 or renewal header clear or replace a newer session", async () => {
    const { session, runtime } = await setup();
    const pending = runtime.miniappApi.mine.getStats();
    session.writeSession({ token: "new-token", expires_at: "2099-01-01T00:00:00Z", user: {} as never });
    requestOptions!.success({
      statusCode: 401,
      data: { code: 401, data: null, message: "旧账号失效", trace_id: "old-trace", cost_ms: 0 },
      header: { "X-New-Token": "old-renewed-token" },
    });
    await expect(pending).rejects.toMatchObject({ cause: { message: "会话已变更，请重新加载" } });
    expect(session.readAccessToken()).toBe("new-token");
    expect(reLaunch).not.toHaveBeenCalled();
  });

  it("does not invalidate concurrent responses for ordinary token renewal", async () => {
    const { session, runtime } = await setup();
    const pending = runtime.miniappApi.mine.getStats();
    session.writeAccessToken("renewed-token", "2099-01-01T00:00:00Z");
    requestOptions!.success({ statusCode: 200, data: { code: 0, data: { reported: 1, pending: 0, done: 1 }, message: "", cost_ms: 0, trace_id: "test" } });
    await expect(pending).resolves.toEqual({ reported: 1, pending: 0, done: 1 });
  });

  it("also prevents a stale upload response from clearing the new session", async () => {
    const { session, runtime } = await setup();
    const pending = runtime.miniappApi.attachments.uploadImages({ files: [{ filePath: "wxfile://fixture" }], watermark: false });
    session.writeSession({ token: "new-token", expires_at: "2099-01-01T00:00:00Z", user: {} as never });
    uploadOptions!.success({ statusCode: 401, data: JSON.stringify({ code: 401, data: null, message: "旧登录失效", trace_id: "old", cost_ms: 0 }) });
    await expect(pending).rejects.toThrow("会话已变更，请重新上传");
    expect(session.readAccessToken()).toBe("new-token");
    expect(reLaunch).not.toHaveBeenCalled();
  });
});
