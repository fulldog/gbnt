import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveAssetUrl } from "@/utils/asset";

beforeEach(() => {
  vi.stubEnv("VITE_API_BASE_URL", "");
  vi.stubGlobal("window", { location: { origin: "http://localhost:5173" } });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("管理端资源 HTTPS 地址", () => {
  it.each([undefined, null, ""])("空地址不生成请求：%s", (url) => {
    expect(resolveAssetUrl(url)).toBe("");
  });

  it("同源模式保留上传路径，让开发代理或线上同源服务处理", () => {
    expect(resolveAssetUrl("/uploads/photo.png")).toBe("/uploads/photo.png");
    expect(resolveAssetUrl("uploads/signature.png")).toBe("/uploads/signature.png");
  });

  it("独立部署用 HTTPS API 地址补全图片和签名路径", () => {
    vi.stubEnv("VITE_API_BASE_URL", " https://api.example.com/ ");
    expect(resolveAssetUrl("/uploads/photo.png")).toBe("https://api.example.com/uploads/photo.png");
    expect(resolveAssetUrl("uploads/signature.png")).toBe("https://api.example.com/uploads/signature.png");
  });

  it("升级与 HTTPS API 同主机的历史 HTTP 图片，保留查询与片段", () => {
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.com");
    expect(resolveAssetUrl("http://api.example.com/uploads/photo.png?v=2#preview"))
      .toBe("https://api.example.com/uploads/photo.png?v=2#preview");
  });

  it("API base 为空时，升级与当前 HTTPS 页面同主机的历史图片", () => {
    vi.stubGlobal("window", { location: { origin: "https://admin.example.com" } });
    expect(resolveAssetUrl("http://admin.example.com/uploads/photo.png"))
      .toBe("https://admin.example.com/uploads/photo.png");
  });

  it("不将不同主机的第三方 HTTP 图片强制改为 HTTPS", () => {
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.com");
    expect(resolveAssetUrl("http://other.example.com/uploads/photo.png"))
      .toBe("http://other.example.com/uploads/photo.png");
  });

  it("本地 HTTP API 配置继续支持本机联调", () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://127.0.0.1:8080");
    expect(resolveAssetUrl("/uploads/photo.png")).toBe("http://127.0.0.1:8080/uploads/photo.png");
    expect(resolveAssetUrl("http://127.0.0.1:8080/uploads/photo.png"))
      .toBe("http://127.0.0.1:8080/uploads/photo.png");
  });

  it("协议相对地址使用 HTTPS API 配置的协议", () => {
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.com");
    expect(resolveAssetUrl("//cdn.example.com/photo.png")).toBe("https://cdn.example.com/photo.png");
  });

  it("同源部署的协议相对地址使用当前页面协议", () => {
    vi.stubGlobal("window", { location: { origin: "https://admin.example.com" } });
    expect(resolveAssetUrl("//cdn.example.com/photo.png")).toBe("https://cdn.example.com/photo.png");
  });

  it.each([
    "blob:http://localhost:5173/image-id",
    "data:image/png;base64,aGVsbG8=",
    "wxfile://tmp_photo.png",
    "file:///tmp/photo.png",
    "http://tmp/photo.png",
  ])("不改写本地预览路径：%s", (url) => {
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.com");
    expect(resolveAssetUrl(url)).toBe(url);
  });

  it("无 window 的构建检查环境仍可解析资源", () => {
    vi.stubGlobal("window", undefined);
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.com");
    expect(resolveAssetUrl("/uploads/photo.png")).toBe("https://api.example.com/uploads/photo.png");
  });
});
