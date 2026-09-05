import { enableAutoUnmount, flushPromises, shallowMount } from "@vue/test-utils";
import { ElMessage } from "element-plus";
import type { UploadRawFile, UploadRequestOptions } from "element-plus";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminApiKey } from "@/api/runtime";
import PhotoUpload from "@/components/PhotoUpload.vue";

enableAutoUnmount(afterEach);
beforeEach(() => { vi.spyOn(ElMessage, "error").mockImplementation(() => ({ close: () => undefined })); });
afterEach(() => vi.restoreAllMocks());

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const result = (id: string) => ({ list: [{ file_id: id, url: `/uploads/${id}.png` }] });
function photo(name = "现场.png", type = "image/png"): UploadRawFile {
  return Object.assign(new File(["image"], name, { type }), { uid: Math.random() });
}
function mountUpload(overrides: { modelValue?: string[]; address?: string; lat?: number; lng?: number; limit?: number; disabled?: boolean } = {}, uploadImages = vi.fn().mockResolvedValue(result("one"))) {
  const onUploading = vi.fn();
  const wrapper = shallowMount(PhotoUpload, {
    props: { modelValue: [], address: "  测试村机井  ", lat: 36.45, lng: 115.98, ...overrides, onUploading },
    global: { provide: { [adminApiKey as symbol]: { attachments: { uploadImages } } }, renderStubDefaultSlot: true },
  });
  const uploader = wrapper.findComponent({ name: "ElUpload" });
  const before = uploader.exists() ? uploader.props("beforeUpload") as (file: UploadRawFile) => boolean : undefined;
  const request = uploader.exists() ? uploader.props("httpRequest") as (input: UploadRequestOptions) => Promise<unknown> : undefined;
  const upload = (file = photo()) => request!({ file } as UploadRequestOptions);
  return { wrapper, uploadImages, before: before!, upload, onUploading };
}

describe("现场照片上传契约和生命周期", () => {
  it("传递真实位置和 watermark:true，成功照片可回显", async () => {
    const { wrapper, upload, uploadImages } = mountUpload();
    const file = photo();
    await upload(file);
    await flushPromises();
    expect(uploadImages).toHaveBeenCalledExactlyOnceWith({ files: [file], watermark: true, address: "测试村机井", lat: "36.45", lng: "115.98" });
    expect(wrapper.emitted("update:modelValue")).toEqual([[["one"]]]);
    expect(wrapper.findComponent({ name: "ElImage" }).props("src")).toBe("/uploads/one.png");
    expect(wrapper.emitted("uploading")).toEqual([[true], [false]]);
  });

  it.each([
    [{ address: "  " }, "定位地址"],
    [{ lat: undefined }, "有效纬度"],
    [{ lng: undefined }, "有效纬度"],
    [{ lat: Number.NaN }, "有效纬度"],
    [{ lat: 91 }, "有效纬度"],
    [{ lng: -181 }, "有效纬度"],
    [{ lat: 0, lng: 0 }, "未定位占位值"],
  ])("缺失、无效及双零定位明确阻止上传 %j", async (props, message) => {
    const { wrapper, before, upload, uploadImages } = mountUpload(props);
    expect(before(photo())).toBe(false);
    await expect(upload()).rejects.toThrow(message);
    expect(uploadImages).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain(message);
    expect(wrapper.findComponent({ name: "ElUpload" }).props("disabled")).toBe(true);
  });

  it.each([{ lat: 0, lng: 115.98 }, { lat: 36.45, lng: 0 }])("允许真实单零坐标 %j", async (props) => {
    const { before, upload, uploadImages } = mountUpload(props);
    expect(before(photo())).toBe(true);
    await upload();
    expect(uploadImages).toHaveBeenCalledWith(expect.objectContaining({ lat: String(props.lat), lng: String(props.lng) }));
  });

  it("拒绝非图片、空文件和超过 10MB 的文件", async () => {
    const { before, uploadImages } = mountUpload();
    const empty = Object.assign(new File([], "empty.png", { type: "image/png" }), { uid: 2 });
    const huge = photo();
    Object.defineProperty(huge, "size", { value: 10 * 1024 * 1024 + 1 });
    expect(before(photo("a.txt", "text/plain"))).toBe(false);
    expect(before(empty)).toBe(false);
    expect(before(huge)).toBe(false);
    expect(uploadImages).not.toHaveBeenCalled();
  });

  it("同批多文件聚合 busy，预留并发名额，先完成一张不会提前解锁", async () => {
    const first = deferred<ReturnType<typeof result>>();
    const second = deferred<ReturnType<typeof result>>();
    const api = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { wrapper, before, upload } = mountUpload({ limit: 2 }, api);
    // Element Plus 会先让同一批的 before-upload 均通过，再调用 http-request。
    expect(before(photo())).toBe(true);
    expect(before(photo())).toBe(true);
    const one = upload();
    const two = upload();
    await expect(upload()).rejects.toThrow("最多上传 2 张");
    expect(api).toHaveBeenCalledTimes(2);
    expect(wrapper.emitted("uploading")).toEqual([[true]]);
    first.resolve(result("one"));
    await one;
    expect(wrapper.emitted("uploading")).toEqual([[true]]);
    expect(before(photo())).toBe(false);
    second.resolve(result("two"));
    await two;
    expect(wrapper.emitted("uploading")).toEqual([[true], [false]]);
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual([["one", "two"]]);
  });

  it("两个响应同一轮完成且父组件尚未回传 v-model 时，照片不会互相覆盖", async () => {
    const pending = deferred<ReturnType<typeof result>>();
    const api = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValueOnce(result("two"));
    const { wrapper, upload } = mountUpload({}, api);
    const one = upload();
    pending.resolve(result("one"));
    const two = upload();
    await Promise.all([one, two]);
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual([["one", "two"]]);
  });

  it("部分失败释放名额，其他文件未完成时保持 busy，可重试失败文件", async () => {
    const first = deferred<ReturnType<typeof result>>();
    const second = deferred<ReturnType<typeof result>>();
    const api = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise).mockResolvedValue(result("retry"));
    const { wrapper, before, upload } = mountUpload({ limit: 2 }, api);
    const failed = upload();
    const failedAssertion = expect(failed).rejects.toThrow("网络失败");
    const waiting = upload();
    first.reject(new Error("网络失败"));
    await failedAssertion;
    expect(wrapper.emitted("uploading")).toEqual([[true]]);
    expect(before(photo())).toBe(true);
    await upload();
    expect(wrapper.emitted("uploading")).toEqual([[true]]);
    second.resolve(result("two"));
    await waiting;
    expect(wrapper.emitted("uploading")).toEqual([[true], [false]]);
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual([["retry", "two"]]);
  });

  it.each([{ list: [] }, { list: [{ file_id: "", url: "/a.png" }] }, { list: [{ file_id: "x", url: "" }] }])("响应异常不写入文件且结束 busy %j", async (response) => {
    const api = vi.fn().mockResolvedValueOnce(response).mockResolvedValue(result("retry"));
    const { wrapper, upload } = mountUpload({ limit: 1 }, api);
    await expect(upload()).rejects.toThrow("响应异常");
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    expect(wrapper.emitted("uploading")).toEqual([[true], [false]]);
    await upload();
    expect(wrapper.emitted("update:modelValue")).toEqual([[["retry"]]]);
  });

  it("卸载后旧成功响应不回写、不发迟到 busy，旧错误也不打扰新表单", async () => {
    const first = deferred<ReturnType<typeof result>>();
    const second = deferred<ReturnType<typeof result>>();
    const { wrapper, upload, onUploading } = mountUpload({}, vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise));
    const one = upload();
    const two = upload();
    const failedAssertion = expect(two).rejects.toThrow("旧上传失败");
    wrapper.unmount();
    expect(onUploading.mock.calls).toEqual([[true], [false]]);
    first.resolve(result("old"));
    second.reject(new Error("旧上传失败"));
    await one;
    await failedAssertion;
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    expect(onUploading.mock.calls).toEqual([[true], [false]]);
    expect(ElMessage.error).not.toHaveBeenCalled();
  });

  it("禁用时不能发起新请求或删除文件，外部 v-model 更新后数量同步", async () => {
    const { wrapper, before, upload, uploadImages } = mountUpload({ modelValue: ["existing"] });
    await wrapper.setProps({ disabled: true });
    expect(before(photo())).toBe(false);
    await expect(upload()).rejects.toThrow("当前不可上传");
    expect(uploadImages).not.toHaveBeenCalled();
    expect(wrapper.findComponent({ name: "ElUpload" }).exists()).toBe(false);
    expect(wrapper.findComponent({ name: "ElButton" }).exists()).toBe(false);
    await wrapper.setProps({ disabled: false, modelValue: [] });
    expect(wrapper.text()).toContain("已上传 0/6");
  });
});
