import type { ApiClient } from "@gbnt/api-client";
import { describe, expect, it, vi } from "vitest";
import { createAdminAttachmentsApi } from "@/api/attachments";

function setup() {
  const result = { list: [{ file_id: "image-id", url: "/uploads/image.png" }] };
  const request = vi.fn().mockResolvedValue(result);
  const api = createAdminAttachmentsApi({ request: request as ApiClient["request"], raw: vi.fn() });
  function form(): FormData {
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0]![0]).toBe("/api/attachments/images");
    expect(request.mock.calls[0]![1]).toMatchObject({ method: "POST", body: expect.any(FormData) });
    return request.mock.calls[0]![1].body as FormData;
  }
  return { api, result, form };
}

describe("图片上传 multipart 契约", () => {
  it("签名明确发送字符串 false，不遗漏水印开关或附加位置", async () => {
    const { api, result, form } = setup();
    const signature = new File(["signature"], "signature.png", { type: "image/png" });
    expect(await api.uploadImages({ files: [signature], watermark: false })).toEqual(result);
    const body = form();
    expect(body.get("watermark")).toBe("false");
    expect(body.get("files")).toMatchObject({ name: signature.name, type: signature.type, size: signature.size });
    expect(body.has("lat")).toBe(false);
    expect(body.has("lng")).toBe(false);
    expect(body.has("address")).toBe(false);
  });

  it("现场水印位置按原值传递，单个零坐标不能被布尔判断丢弃", async () => {
    const { api, form } = setup();
    await api.uploadImages({
      files: [new File(["photo"], "site.png", { type: "image/png" })],
      watermark: true, lat: "0", lng: "115.98", address: "现场地址",
    });
    const body = form();
    expect(body.get("watermark")).toBe("true");
    expect(body.get("lat")).toBe("0");
    expect(body.get("lng")).toBe("115.98");
    expect(body.get("address")).toBe("现场地址");
  });

  it("多文件保持后端 files 字段和原文件名", async () => {
    const { api, form } = setup();
    await api.uploadImages({ files: [
      new File(["one"], "before.png", { type: "image/png" }),
      new File(["two"], "after.jpg", { type: "image/jpeg" }),
    ], watermark: false });
    expect(form().getAll("files").map((file) => (file as File).name)).toEqual(["before.png", "after.jpg"]);
  });
});
