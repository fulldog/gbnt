import { flushPromises, shallowMount } from "@vue/test-utils";
import { ElMessage } from "element-plus";
import type { Issue, QuizType } from "@gbnt/api-client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { adminApiKey } from "@/api/runtime";
import PhotoUpload from "@/components/PhotoUpload.vue";
import RectifyDialog from "@/views/issues/RectifyDialog.vue";

const showSlots = { template: "<div><slot /><slot name='footer' /></div>" };
function issue(id = 1, history: QuizType[] = []): Issue {
  return {
    id, type: "well", status: "pending", address: "测试村机井", lat: 36.45, lng: 115.98,
    type_ext: { checklist: [
      { type: "water_out", value: false, desc: "不出水", files: [] },
      { type: "pipe_ok", value: false, desc: "连接破损", files: [] },
    ] },
    rectify_records: history.map((quiz_type, index) => ({ id: index + 1, quiz_type, note: "历史反馈", photos: [] })),
  } as unknown as Issue;
}
function mountDialog(record = issue(), rectify = vi.fn().mockResolvedValue(issue())) {
  const wrapper = shallowMount(RectifyDialog, {
    props: { modelValue: true, issue: record },
    global: { provide: { [adminApiKey as symbol]: { issues: { rectify } } }, renderStubDefaultSlot: true, stubs: { ElDialog: showSlots } },
  });
  const submit = () => wrapper.findAllComponents({ name: "ElButton" }).at(-1)!;
  async function select(index: number, checked = true) {
    wrapper.findAllComponents({ name: "ElCheckbox" })[index]!.vm.$emit("update:modelValue", checked);
    await flushPromises();
  }
  async function fill(index: number, note = "  已修好  ") {
    wrapper.findAllComponents({ name: "ElInput" })[index]!.vm.$emit("update:modelValue", note);
    wrapper.findAllComponents(PhotoUpload)[index]!.vm.$emit("update:modelValue", [`photo-${index}`]);
    await flushPromises();
  }
  return { wrapper, rectify, submit, select, fill };
}
afterEach(() => vi.restoreAllMocks());

describe("管理端分项整改", () => {
  it("至少选择一项；只提交选中的有效项，未选项为空不阻止提交", async () => {
    const error = vi.spyOn(ElMessage, "error").mockImplementation(() => ({ close: () => undefined }));
    const { wrapper, rectify, submit, select, fill } = mountDialog();
    expect(submit().props("disabled")).toBe(true);
    submit().vm.$emit("click");
    await flushPromises();
    expect(rectify).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith("请至少选择一项本次处理的异常项");
    await select(0);
    await fill(0);
    submit().vm.$emit("click");
    await flushPromises();
    expect(rectify).toHaveBeenCalledExactlyOnceWith(1, {
      expected_round: 0,
      rectify_list: [{ type: "water_out", note: "已修好", file_uuids: ["photo-0"] }],
    });
    expect(wrapper.emitted("saved")).toEqual([[1]]);
    wrapper.unmount();
  });

  it("所选项说明和照片必填，取消选择后不再校验或发送该项", async () => {
    vi.spyOn(ElMessage, "error").mockImplementation(() => ({ close: () => undefined }));
    const { wrapper, rectify, submit, select, fill } = mountDialog();
    await select(0);
    await select(1);
    await fill(0);
    submit().vm.$emit("click");
    await flushPromises();
    expect(rectify).not.toHaveBeenCalled();
    wrapper.findAllComponents({ name: "ElInput" })[1]!.vm.$emit("update:modelValue", "有说明但无照片");
    submit().vm.$emit("click");
    await flushPromises();
    expect(rectify).not.toHaveBeenCalled();
    await select(1, false);
    submit().vm.$emit("click");
    await flushPromises();
    expect(rectify).toHaveBeenCalledOnce();
    expect(rectify.mock.calls[0]![1].rectify_list).toHaveLength(1);
    wrapper.unmount();
  });

  it("历史已反馈仅作标记，重新整改时依然能选中并重复反馈", async () => {
    const reopened = { ...issue(7, ["water_out"]), rectify_round: 1 };
    const { wrapper, rectify, submit, select, fill } = mountDialog(reopened);
    expect(wrapper.findAllComponents({ name: "ElCheckbox" })).toHaveLength(2);
    expect(wrapper.findAllComponents({ name: "ElTag" }).map((tag) => tag.text())).toEqual(["历史轮已反馈"]);
    expect(wrapper.findComponent({ name: "ElAlert" }).props("description")).toContain("不表示本轮已经完成");
    await select(0);
    await fill(0);
    submit().vm.$emit("click");
    await flushPromises();
    expect(rectify).toHaveBeenCalledWith(7, expect.objectContaining({ expected_round: 1, rectify_list: [expect.objectContaining({ type: "water_out" })] }));
    wrapper.unmount();
  });

  it("按当前轮次标记本轮与历史反馈，不隐藏任何可提交题项", async () => {
    const record = issue(7, ["water_out", "pipe_ok", "water_out"]);
    record.rectify_round = 2;
    record.rectify_records[0]!.round = 2;
    record.rectify_records[1]!.round = 1;
    record.rectify_records[2]!.round = 0;
    const { wrapper } = mountDialog(record);
    const articles = wrapper.findAll("article");
    expect(articles).toHaveLength(2);
    expect(articles[0]!.text()).toContain("本轮已反馈");
    expect(articles[0]!.text()).toContain("历史轮已反馈");
    expect(articles[1]!.text()).not.toContain("本轮已反馈");
    expect(articles[1]!.text()).toContain("历史轮已反馈");
    expect(wrapper.findComponent({ name: "ElAlert" }).props("description")).toContain("第 3 轮整改");
    expect(wrapper.findAllComponents({ name: "ElCheckbox" }).every((checkbox) => !checkbox.props("disabled"))).toBe(true);
    wrapper.unmount();
  });

  it("旧服务缺少轮次按初始轮读取；同一问题推进轮次后清除旧提交草稿", async () => {
    const { wrapper, select, fill, submit } = mountDialog(issue(7, ["water_out"]));
    expect(wrapper.findAllComponents({ name: "ElTag" }).map((tag) => tag.text())).toEqual(["本轮已反馈"]);
    await select(0);
    await fill(0);
    expect(submit().props("disabled")).toBe(false);
    await wrapper.setProps({ issue: { ...issue(7, ["water_out"]), rectify_round: 1 } });
    expect(submit().props("disabled")).toBe(true);
    expect(wrapper.findAllComponents({ name: "ElCheckbox" })[0]!.props("modelValue")).toBe(false);
    expect(wrapper.findAllComponents({ name: "ElInput" })[0]!.props("modelValue")).toBe("");
    expect(wrapper.findAllComponents({ name: "ElTag" }).map((tag) => tag.text())).toEqual(["历史轮已反馈"]);
    wrapper.unmount();
  });

  it("传递问题位置，任意照片仍在上传时都禁止提交", async () => {
    vi.spyOn(ElMessage, "error").mockImplementation(() => ({ close: () => undefined }));
    const { wrapper, rectify, submit, select, fill } = mountDialog();
    await select(0);
    await select(1);
    await fill(0);
    await fill(1);
    const uploads = wrapper.findAllComponents(PhotoUpload);
    expect(wrapper.text()).toContain("在基础编辑中补齐后再上传");
    expect(uploads[0]!.props()).toMatchObject({ address: "测试村机井", lat: 36.45, lng: 115.98, disabled: false });
    uploads[0]!.vm.$emit("uploading", true);
    uploads[1]!.vm.$emit("uploading", true);
    await flushPromises();
    expect(submit().props("disabled")).toBe(true);
    uploads[0]!.vm.$emit("uploading", false);
    await flushPromises();
    expect(submit().props("disabled")).toBe(true);
    submit().vm.$emit("click");
    await flushPromises();
    expect(rectify).not.toHaveBeenCalled();
    uploads[1]!.vm.$emit("uploading", false);
    await flushPromises();
    expect(submit().props("disabled")).toBe(false);
    wrapper.unmount();
  });

  it("关闭重开相同问题会重置草稿，忽略旧上传实例的迟到事件", async () => {
    const { wrapper, submit, select, fill } = mountDialog();
    await select(0);
    await fill(0);
    const oldUpload = wrapper.findAllComponents(PhotoUpload)[0]!;
    const oldListener = oldUpload.vm.$attrs.onUploading as (value: boolean) => void;
    oldUpload.vm.$emit("uploading", true);
    await wrapper.setProps({ modelValue: false });
    await wrapper.setProps({ modelValue: true });
    await select(0);
    await fill(0);
    // 直接保留的监听器模拟旧网络任务回调，而非向新组件伪造事件。
    const staleCallback = oldListener ?? oldUpload.vm.$.vnode.props?.onUploading;
    if (typeof staleCallback !== "function") throw new Error("上传回调未绑定");
    staleCallback(true);
    await flushPromises();
    expect(submit().props("disabled")).toBe(false);
    wrapper.unmount();
  });

  it("提交期间锁定照片和选择，切换问题后迟到响应不关闭新弹窗", async () => {
    let resolve!: (value: Issue) => void;
    const pending = new Promise<Issue>((done) => { resolve = done; });
    const { wrapper, submit, select, fill } = mountDialog(issue(), vi.fn().mockReturnValue(pending));
    await select(0);
    await fill(0);
    submit().vm.$emit("click");
    await flushPromises();
    expect(wrapper.findAllComponents(PhotoUpload).every((upload) => upload.props("disabled"))).toBe(true);
    expect(wrapper.findAllComponents({ name: "ElCheckbox" }).every((checkbox) => checkbox.props("disabled"))).toBe(true);
    await wrapper.setProps({ issue: issue(2) });
    resolve(issue());
    await flushPromises();
    expect(wrapper.emitted("saved")).toBeUndefined();
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    expect(submit().props("loading")).toBe(false);
    wrapper.unmount();
  });

  it("请求失败保留所选内容供重试，不伪造完成状态", async () => {
    vi.spyOn(ElMessage, "error").mockImplementation(() => ({ close: () => undefined }));
    const { wrapper, rectify, submit, select, fill } = mountDialog(issue(), vi.fn().mockRejectedValueOnce(new Error("失败")).mockResolvedValueOnce(issue()));
    await select(1);
    await fill(1);
    submit().vm.$emit("click");
    await flushPromises();
    expect(wrapper.findAllComponents({ name: "ElCheckbox" })[1]!.props("modelValue")).toBe(true);
    expect(wrapper.findAllComponents({ name: "ElInput" })[1]!.props("modelValue")).toBe("  已修好  ");
    expect(wrapper.emitted("saved")).toBeUndefined();
    submit().vm.$emit("click");
    await flushPromises();
    expect(rectify).toHaveBeenCalledTimes(2);
    expect(rectify.mock.calls[0]).toEqual(rectify.mock.calls[1]);
    wrapper.unmount();
  });
});
