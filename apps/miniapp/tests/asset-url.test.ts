import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveAssetUrl } from "@gbnt/api-client";
import type { UniRequestOptions } from "@/api/transport";
import type { UniUploadFileOptions } from "@/api/attachments";

const api = "https://api.gbnt.test";
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("共享 HTTPS 附件解析", () => {
  it.each([undefined, null, "", " \n "])("空地址不变成 API 首页: %j", (path) => {
    expect(resolveAssetUrl(path, api)).toBe("");
  });

  it.each([
    ["/uploads/image.jpg", `${api}/uploads/image.jpg`],
    ["uploads/signature.png", `${api}/uploads/signature.png`],
    [" /uploads/图片.png?q=a%2Fb#preview ", `${api}/uploads/图片.png?q=a%2Fb#preview`],
    ["http://api.gbnt.test/uploads/old.jpg", `${api}/uploads/old.jpg`],
    ["HTTP://API.GBNT.TEST:80/uploads/old.jpg?q=a%2Bb&sig=fixture#x", `${api}/uploads/old.jpg?q=a%2Bb&sig=fixture#x`],
    ["https://api.gbnt.test/uploads/secure.jpg", `${api}/uploads/secure.jpg`],
    ["//api.gbnt.test/uploads/image.jpg", `${api}/uploads/image.jpg`],
    ["//cdn.gbnt.test/image.jpg", "https://cdn.gbnt.test/image.jpg"],
  ])("解析接口附件且保留路径参数: %s", (path, expected) => {
    expect(resolveAssetUrl(path, ` ${api}/ `)).toBe(expected);
    expect(resolveAssetUrl(expected, api)).toBe(expected);
  });

  it.each([
    "wxfile://tmp/signature.png", "file:///tmp/photo.jpg", "http://tmp/photo.jpg", "http://usr/photo.jpg",
    "blob:https://api.gbnt.test/local", "data:image/png;base64,fixture",
    "http://cdn.gbnt.test/image.jpg", "http://api.gbnt.test.evil.test/image.jpg",
    "http://api.gbnt.test@evil.test/image.jpg", "http://api.gbnt.test:8080/image.jpg",
  ])("不猜测外域协议或破坏本地资源: %s", (path) => {
    expect(resolveAssetUrl(path, api)).toBe(path);
  });

  it("同端口非标准 HTTPS 与默认端口可正确匹配", () => {
    expect(resolveAssetUrl("http://api.gbnt.test:8443/a.png", `${api}:8443`)).toBe(`${api}:8443/a.png`);
    expect(resolveAssetUrl("http://api.gbnt.test/a.png", `${api}:443`)).toBe(`${api}/a.png`);
    expect(resolveAssetUrl("http://api.gbnt.test:8080/a.png", `${api}:8443`)).toBe("http://api.gbnt.test:8080/a.png");
  });

  it("管理端无 API 前缀时保留同源路径，并用页面 Origin 升级同主机旧图", () => {
    expect(resolveAssetUrl("uploads/a.png", "", api)).toBe("/uploads/a.png");
    expect(resolveAssetUrl("http://api.gbnt.test/a.png", "", api)).toBe(`${api}/a.png`);
    expect(resolveAssetUrl("//cdn.gbnt.test/a.png", "", api)).toBe("https://cdn.gbnt.test/a.png");
    expect(resolveAssetUrl("http://api.gbnt.test/a.png", "", "http://localhost:5173")).toBe("http://api.gbnt.test/a.png");
  });

  it("纯字符串实现不依赖微信运行时可能没有的 URL 或 window", () => {
    vi.stubGlobal("URL", undefined);
    vi.stubGlobal("window", undefined);
    expect(resolveAssetUrl("http://api.gbnt.test/a.png", api)).toBe(`${api}/a.png`);
  });
});

describe("小程序 HTTPS 接线", () => {
  it("同一个环境 Origin 用于普通接口、上传、照片和签名", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_API_BASE_URL", api);
    const request = vi.fn((options: UniRequestOptions) => options.fail({ errMsg: "fixture: no network" }));
    const uploadFile = vi.fn((options: UniUploadFileOptions) => options.fail({ errMsg: "fixture: no upload" }));
    vi.stubGlobal("uni", { getStorageSync: () => "", request, uploadFile });
    const { miniappApi, apiBaseUrl, toAssetUrl } = await import("@/api/runtime");
    expect(apiBaseUrl).toBe(api);
    await expect(miniappApi.auth.startSlider()).rejects.toThrow();
    expect(request.mock.calls[0]?.[0].url).toBe(`${api}/api/app/auth/slider/start`);
    await expect(miniappApi.attachments.uploadImages({ files: [{ filePath: "wxfile://tmp/photo.jpg" }], watermark: false })).rejects.toThrow();
    expect(uploadFile.mock.calls[0]?.[0].url).toBe(`${api}/api/attachments/images`);
    expect(toAssetUrl("/uploads/photo.jpg")).toBe(`${api}/uploads/photo.jpg`);
    expect(toAssetUrl("http://api.gbnt.test/uploads/signature.png")).toBe(`${api}/uploads/signature.png`);
    expect(toAssetUrl("http://tmp/photo.jpg")).toBe("http://tmp/photo.jpg");
  });

  it("历史草稿照片、预览和签名入口不会绕过 URL 解析器", () => {
    const photo = readFileSync(new URL("../src/components/media/PhotoPicker.vue", import.meta.url), "utf8");
    const report = readFileSync(new URL("../src/components/report/ReportTypeForm.vue", import.meta.url), "utf8");
    expect(photo).toContain(':src="toAssetUrl(photo.url)"');
    expect(photo).toContain("model.value.map((photo) => toAssetUrl(photo.url)");
    expect(report).toContain(':src="toAssetUrl(form.signaturePreviewUrl)"');
  });
});
