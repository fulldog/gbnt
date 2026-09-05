import { flushPromises, shallowMount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import BusinessUserSelect from "@/components/BusinessUserSelect.vue";
import AsyncError from "@/components/AsyncError.vue";
import type { UserOptionResult } from "@/api/types";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const result = (id = 1): UserOptionResult => ({
  list: [{ id, name: `人员${id}`, username: `user${id}` }], total: 1, page: 1, size: 20, selected: null,
});

describe("专项整改人员候选", () => {
  it("分页检索并独立回显不在当前页的已选人员", async () => {
    const load = vi.fn().mockResolvedValue({
      ...result(2), total: 1001, selected: { id: 1500, name: "早期用户", username: "older" },
    });
    const wrapper = shallowMount(BusinessUserSelect, {
      props: { scopeKey: 1, modelValue: 1500, loadOptions: load },
      global: { renderStubDefaultSlot: true },
    });
    await flushPromises();
    expect(load).toHaveBeenLastCalledWith({ page: 1, size: 20, selected_id: 1500, keyword: undefined });
    expect(wrapper.findAllComponents({ name: "ElOption" }).map((option) => option.props("value"))).toContain(1500);
    expect(wrapper.emitted("ready")?.at(-1)).toEqual([true]);

    wrapper.findComponent({ name: "ElPagination" }).vm.$emit("current-change", 2);
    await flushPromises();
    expect(load).toHaveBeenLastCalledWith({ page: 2, size: 20, selected_id: 1500, keyword: undefined });
    const search = wrapper.findComponent({ name: "ElSelect" }).props("remoteMethod") as (value: string) => void;
    search("  新用户  ");
    await flushPromises();
    expect(load).toHaveBeenLastCalledWith({ page: 1, size: 20, selected_id: 1500, keyword: "新用户" });
    wrapper.unmount();
  });

  it("切换组织时立即撤销旧候选，迟到成功不能恢复旧选项", async () => {
    const old = deferred<UserOptionResult>();
    const latest = deferred<UserOptionResult>();
    const load = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
    const wrapper = shallowMount(BusinessUserSelect, {
      props: { scopeKey: 1, modelValue: 1, loadOptions: load },
      global: { renderStubDefaultSlot: true },
    });
    await wrapper.setProps({ scopeKey: 2 });
    latest.resolve(result(2));
    await flushPromises();
    old.resolve(result(1));
    await flushPromises();
    expect(wrapper.findAllComponents({ name: "ElOption" }).map((option) => option.props("value"))).toEqual([2]);
    expect(wrapper.emitted("ready")?.at(-1)).toEqual([false]);
    expect(wrapper.text()).toContain("当前已选人员不在可选范围内");
    wrapper.unmount();
  });

  it("查询失败清空有效状态，可重试；旧失败不能覆盖新成功", async () => {
    const old = deferred<UserOptionResult>();
    const load = vi.fn().mockResolvedValueOnce(result()).mockRejectedValueOnce(new Error("无权查询"))
      .mockReturnValueOnce(old.promise).mockResolvedValueOnce(result());
    const wrapper = shallowMount(BusinessUserSelect, { props: { scopeKey: 1, modelValue: 1, loadOptions: load } });
    await flushPromises();
    const search = wrapper.findComponent({ name: "ElSelect" }).props("remoteMethod") as (value: string) => void;
    search("失败");
    await flushPromises();
    expect(wrapper.findComponent(AsyncError).props("message")).toContain("无权查询");
    expect(wrapper.emitted("ready")?.at(-1)).toEqual([false]);
    wrapper.findComponent(AsyncError).vm.$emit("retry");
    search("最新");
    await flushPromises();
    old.reject(new Error("旧请求失败"));
    await flushPromises();
    expect(wrapper.findComponent(AsyncError).exists()).toBe(false);
    expect(wrapper.emitted("ready")?.at(-1)).toEqual([true]);
    wrapper.unmount();
  });
});
