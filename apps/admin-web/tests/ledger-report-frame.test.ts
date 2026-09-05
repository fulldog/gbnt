import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import LedgerReportFrame from "@/components/ledger/LedgerReportFrame.vue";

const ButtonStub = defineComponent({
  props: { disabled: Boolean, loading: Boolean },
  setup(props, { slots, attrs }) { return () => h("button", { ...attrs, disabled: props.disabled || props.loading }, slots.default?.()); },
});

afterEach(() => vi.restoreAllMocks());

describe("报表工具栏", () => {
  it("筛选显隐、刷新和导出都绑定实际行为，导出传入当前表格", async () => {
    const wrapper = mount(LedgerReportFrame, {
      props: { title: "街道台账", loading: false, exportDisabled: false },
      slots: { filters: '<div class="test-filter">筛选条件</div>', default: "<table><tbody><tr><td>真实数据</td></tr></tbody></table>" },
      global: { stubs: { ElButton: ButtonStub } },
    });
    expect(wrapper.get(".test-filter").element.parentElement!.style.display).not.toBe("none");
    await wrapper.get("[aria-label='隐藏筛选']").trigger("click");
    expect(wrapper.get(".test-filter").element.parentElement!.style.display).toBe("none");
    await wrapper.get("[aria-label='显示筛选']").trigger("click");
    expect(wrapper.get(".test-filter").element.parentElement!.style.display).not.toBe("none");
    await wrapper.get("[aria-label='刷新报表']").trigger("click");
    expect(wrapper.emitted("refresh")).toHaveLength(1);
    await wrapper.findAll("button")[0]!.trigger("click");
    expect(wrapper.emitted("export")?.[0]?.[0]).toBe(wrapper.get("table").element);
    expect(wrapper.get("[role='region']").attributes("tabindex")).toBe("0");
    wrapper.unmount();
  });

  it("全屏调用浏览器 API，禁用状态不能导出", async () => {
    const wrapper = mount(LedgerReportFrame, {
      props: { title: "街道台账", loading: false, exportDisabled: true },
      global: { stubs: { ElButton: ButtonStub } },
    });
    const element = wrapper.element as HTMLElement;
    const request = vi.fn(async () => undefined);
    element.requestFullscreen = request;
    await wrapper.get("[aria-label='全屏查看']").trigger("click");
    await flushPromises();
    expect(request).toHaveBeenCalledOnce();
    expect(wrapper.findAll("button")[0]!.attributes("disabled")).toBeDefined();
    wrapper.unmount();
  });
});
