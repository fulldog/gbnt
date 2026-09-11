import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadEnv } from "vite";
import viteConfig from "../vite.config";

vi.mock("vite", async (importOriginal) => ({
  ...await importOriginal<typeof import("vite")>(),
  loadEnv: vi.fn(),
}));

afterEach(() => {
  vi.clearAllMocks();
});

async function proxyOptions(env: Record<string, string>) {
  vi.mocked(loadEnv).mockReturnValue(env);
  if (typeof viteConfig !== "function") throw new Error("Vite 配置应按环境解析");
  const config = await viteConfig({ mode: "test", command: "serve" });
  return config.server?.proxy;
}

describe("管理端 Vite API 与资源代理", () => {
  it.each<Record<string, string>>([{}, { VITE_API_PROXY_TARGET: "" }, { VITE_API_PROXY_TARGET: "  " }])(
    "未配置代理时，API 和上传资源默认使用 HTTPS 8443 入口：%j",
    async (env) => {
      expect(await proxyOptions(env)).toEqual({
        "/api": { target: "https://nt.kfqzhsq.cn:8443", changeOrigin: true },
        "/uploads": { target: "https://nt.kfqzhsq.cn:8443", changeOrigin: true },
      });
    },
  );

  it("示例配置保持同源请求，代理完整保留 HTTPS 8443 端口", async () => {
    const example = readFileSync(".env.example", "utf8");
    const target = /^VITE_API_PROXY_TARGET=(.*)$/m.exec(example)?.[1];
    expect(example).toMatch(/^VITE_API_BASE_URL=$/m);
    expect(target).toBe("https://nt.kfqzhsq.cn:8443");
    expect(await proxyOptions({ VITE_API_PROXY_TARGET: target! })).toEqual(await proxyOptions({}));
  });

  it("保留显式配置的本机 HTTP 后端，不关闭 TLS 证书校验", async () => {
    expect(await proxyOptions({ VITE_API_PROXY_TARGET: " http://127.0.0.1:8080 " })).toEqual({
      "/api": { target: "http://127.0.0.1:8080", changeOrigin: true },
      "/uploads": { target: "http://127.0.0.1:8080", changeOrigin: true },
    });
  });
});
