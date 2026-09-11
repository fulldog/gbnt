import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { validateApiBaseUrl } from "../build/api-base-url";

const configMocks = vi.hoisted(() => ({
  loadEnv: vi.fn(),
  uniPlugin: vi.fn(() => ({ name: "test-uni" })),
}));

// 配置接线测试不读取本地环境文件、不加载真实 UniApp 插件，也不发起网络请求。
vi.mock("vite", () => ({
  defineConfig: (config: unknown) => config,
  loadEnv: configMocks.loadEnv,
}));
vi.mock("@dcloudio/vite-plugin-uni", () => ({ default: configMocks.uniPlugin }));

describe("miniapp API Origin validation", () => {
  it.each([undefined, "", "  \n  "])("rejects a missing Origin: %j", (value) => {
    expect(() => validateApiBaseUrl(value, "development")).toThrow("缺少 VITE_API_BASE_URL");
  });

  it.each(["not a URL", "/api", "//api.gbnt.test", "https://", "https://[invalid]"])(
    "rejects malformed or relative URLs: %s",
    (value) => {
      expect(() => validateApiBaseUrl(value, "development")).toThrow("必须是有效的 http(s) Origin");
    },
  );

  it.each([
    "ftp://api.gbnt.test",
    "https://api.gbnt.test/api",
    "https://api.gbnt.test//",
    "https://api.gbnt.test?env=test",
    "https://api.gbnt.test#api",
    "https://user@api.gbnt.test",
    "https://user:secret-fixture@api.gbnt.test",
  ])("rejects a non-Origin value: %s", (value) => {
    expect(() => validateApiBaseUrl(value, "development")).toThrow("不能包含路径、凭据、查询或片段");
  });

  it.each([
    "https://example.com",
    "https://api.example.com",
    "https://EXAMPLE.COM./",
    "https://api.example.com.",
    "https://api.invalid",
    "https://api.invalid.",
  ])("rejects placeholder addresses: %s", (value) => {
    expect(() => validateApiBaseUrl(value, "development")).toThrow("示例占位地址");
  });

  it.each([
    "localhost",
    "LOCALHOST.",
    "api.localhost",
    "a.b.localhost.",
    "%6cocalhost",
    "127.0.0.1",
    "127.0.0.0",
    "127.42.9.8",
    "127.255.255.255",
    "127.1",
    "2130706433",
    "0x7f000001",
    "0177.0.0.1",
    "0.0.0.0",
    "0",
    "[::1]",
    "[0:0:0:0:0:0:0:1]",
    "[::]",
    "[0:0:0:0:0:0:0:0]",
    "[::ffff:127.0.0.1]",
    "[::ffff:127.255.255.255]",
    "[0:0:0:0:0:ffff:7f00:1]",
    "[::ffff:0.0.0.0]",
    "[::127.0.0.1]",
  ])("rejects local-only production addresses: %s", (host) => {
    expect(() => validateApiBaseUrl(`https://${host}:8443/`, "production"))
      .toThrow("不能使用本机回环或未指定地址");
  });

  it("requires HTTPS for production", () => {
    expect(() => validateApiBaseUrl("http://api.gbnt.test", "production")).toThrow("必须使用 HTTPS");
  });

  it.each([
    ["http://localhost:8080/", "http://localhost:8080"],
    ["http://api.localhost/", "http://api.localhost"],
    ["http://127.0.0.1:8080/", "http://127.0.0.1:8080"],
    ["http://[::1]:8080/", "http://[::1]:8080"],
    ["https://[::ffff:127.0.0.1]/", "https://[::ffff:7f00:1]"],
  ])("preserves local development: %s", (value, expected) => {
    expect(validateApiBaseUrl(value, "development")).toBe(expected);
  });

  it.each([
    ["  HTTPS://API.GBNT.TEST:443/  ", "https://api.gbnt.test"],
    ["https://api.gbnt.test:8443/", "https://api.gbnt.test:8443"],
    ["https://localhost.gbnt.test/", "https://localhost.gbnt.test"],
    ["https://127.api.gbnt.test/", "https://127.api.gbnt.test"],
    ["https://198.51.100.4/", "https://198.51.100.4"],
    ["https://[2001:db8::1]/", "https://[2001:db8::1]"],
    ["https://[::ffff:198.51.100.4]/", "https://[::ffff:c633:6404]"],
  ])("returns only the normalized production Origin: %s", (value, expected) => {
    expect(validateApiBaseUrl(value, "production")).toBe(expected);
  });

  it("does not echo raw credentials in a configuration error", () => {
    const value = "https://private-user:secret-fixture@api.gbnt.test";
    let error: unknown;
    try { validateApiBaseUrl(value, "production"); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).not.toContain("private-user");
    expect(String(error)).not.toContain("secret-fixture");
  });
});

describe("Vite API Origin injection", () => {
  beforeEach(() => {
    configMocks.loadEnv.mockReset();
    configMocks.uniPlugin.mockClear();
  });

  async function configuredVite(mode: string) {
    const { default: config } = await import("../vite.config");
    if (typeof config !== "function") throw new Error("Expected a Vite configuration factory");
    return config({ mode, command: mode === "production" ? "build" : "serve" });
  }

  it("injects the validated normalized Origin instead of the original env value", async () => {
    configMocks.loadEnv.mockReturnValue({ VITE_API_BASE_URL: " HTTPS://API.GBNT.TEST:443/ " });
    const config = await configuredVite("production");
    expect(config.define?.["import.meta.env.VITE_API_BASE_URL"]).toBe('"https://api.gbnt.test"');
    expect(configMocks.loadEnv).toHaveBeenCalledWith("production", expect.stringMatching(/apps\/miniapp\/$/), "VITE_");
    expect(configMocks.uniPlugin).toHaveBeenCalledTimes(1);
  });

  it.each(["development", "production"])("keeps port 8443 from the checked-in example in %s builds", async (mode) => {
    const example = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
    const origin = /^VITE_API_BASE_URL=(.*)$/m.exec(example)?.[1];
    expect(origin).toBe("https://nt.kfqzhsq.cn:8443");
    configMocks.loadEnv.mockReturnValue({ VITE_API_BASE_URL: origin });
    const config = await configuredVite(mode);
    expect(config.define?.["import.meta.env.VITE_API_BASE_URL"]).toBe('"https://nt.kfqzhsq.cn:8443"');
  });

  it("rejects an unsafe production address before initializing the compilation plugin", async () => {
    configMocks.loadEnv.mockReturnValue({ VITE_API_BASE_URL: "https://127.0.0.1" });
    await expect(configuredVite("production")).rejects.toThrow("不能使用本机回环或未指定地址");
    expect(configMocks.uniPlugin).not.toHaveBeenCalled();
  });

  it("continues to require explicit configuration instead of adding a fallback address", async () => {
    configMocks.loadEnv.mockReturnValue({});
    await expect(configuredVite("development")).rejects.toThrow("缺少 VITE_API_BASE_URL");
    expect(configMocks.uniPlugin).not.toHaveBeenCalled();
  });
});
