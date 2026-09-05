import { createApiClient } from "@gbnt/api-client";
import type { ApiTransport, TransportResponse, WorkbenchStats } from "@gbnt/api-client";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWorkbenchApi } from "@/api/workbench";
import WorkbenchView from "@/views/workbench/WorkbenchView.vue";

const runtime = vi.hoisted(() => ({ workbench: {
  getStats: vi.fn(),
  getTrend: vi.fn().mockResolvedValue({ points: [], undated_completed: 0 }),
  getTodos: vi.fn().mockResolvedValue({ list: [], total: 0, page: 1, size: 20, today: "2026-09-05" }),
} }));
vi.mock("@/api/runtime", () => ({ useAdminApi: () => runtime }));

const zero: WorkbenchStats = {
  total: 0, new: 0, pending: 0, done: 0, complete_rate: 0,
  by_type: { well: 0, road: 0, bridge: 0, forest: 0, transformer: 0 },
};
const populated: WorkbenchStats = {
  total: 10, new: 2, pending: 3, done: 5, complete_rate: 50,
  by_type: { well: 2, road: 3, bridge: 1, forest: 2, transformer: 2 },
};
function envelope(data: unknown): TransportResponse<unknown> {
  return { status: 200, headers: {}, data: { code: 0, data, message: "ok", cost_ms: 1, trace_id: "stats-ok" } };
}
const failure: TransportResponse<unknown> = {
  status: 500, headers: {},
  data: { code: 500, data: null, message: "统计查询失败", cost_ms: 1, trace_id: "stats-failed" },
};
function setup(response = envelope(zero)) {
  const request = vi.fn().mockResolvedValue(response);
  const client = createApiClient({ baseUrl: "", transport: { request: request as ApiTransport["request"] } });
  return { request, api: createWorkbenchApi(client) };
}

describe("工作台统计 API 契约", () => {
  it.each([zero, populated])("合法空统计和有数据统计保持原口径", async (value) => {
    const { api, request } = setup(envelope(value));
    expect(await api.getStats()).toEqual(value);
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ url: "/api/workbench/stats", method: "GET" }));
  });

  it.each([
    null,
    { ...zero, total: "0" },
    { ...zero, new: -1 },
    { ...zero, pending: undefined },
    { ...zero, done: 0.5 },
    { ...zero, complete_rate: NaN },
    { ...zero, complete_rate: null },
    { ...zero, complete_rate: 101 },
    { ...zero, by_type: [] },
    { ...zero, by_type: { ...zero.by_type, road: undefined } },
    { ...zero, by_type: { ...zero.by_type, well: "0" } },
  ])("错误数据不伪装为成功零统计：%j", async (value) => {
    await expect(setup(envelope(value)).api.getStats()).rejects.toThrow("格式异常");
  });

  it("保留后端 500 及 Trace ID，不把 data:null 归一为零", async () => {
    await expect(setup(failure).api.getStats()).rejects.toMatchObject({
      message: "统计查询失败", status: 500, code: 500, traceId: "stats-failed",
    });
  });

  it("HTTP 200 的业务错误也按失败处理", async () => {
    await expect(setup({ ...failure, status: 200 }).api.getStats()).rejects.toMatchObject({ code: 500, traceId: "stats-failed" });
  });
});

const wrappers: VueWrapper[] = [];
const Button = defineComponent({
  props: { loading: Boolean, disabled: Boolean },
  setup(props, { slots, attrs }) {
    return () => h("button", { ...attrs, disabled: props.disabled || props.loading }, slots.default?.());
  },
});
const Alert = defineComponent({
  props: { title: String },
  setup(props, { slots }) { return () => h("div", { role: "alert" }, [props.title, slots.default?.()]); },
});
function render() {
  const wrapper = mount(WorkbenchView, { global: { stubs: {
    ElButton: Button, ElAlert: Alert, ElIcon: { template: "<span />" }, ElSkeleton: true,
    ElEmpty: { props: ["description"], template: "<div>{{ description }}</div>" },
    WorkbenchTrendChart: true, WorkbenchTodos: true,
  } } });
  wrappers.push(wrapper);
  return wrapper;
}
async function click(wrapper: VueWrapper, label: string) {
  const button = wrapper.findAll("button").find((item) => item.text() === label);
  expect(button).toBeDefined();
  await button!.trigger("click");
  await flushPromises();
}
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  runtime.workbench.getStats.mockReset();
});

describe("工作台真实请求边界到页面的失败状态", () => {
  it("首次查询失败无指标/图表，重试空成功后才显示零统计", async () => {
    const { request, api } = setup(failure);
    runtime.workbench.getStats.mockImplementation(api.getStats);
    const wrapper = render();
    await flushPromises();
    expect(wrapper.text()).toContain("统计查询失败");
    expect(wrapper.text()).toContain("stats-failed");
    expect(wrapper.find('[aria-label="核心指标"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="类型排行列表"]').exists()).toBe(false);
    request.mockResolvedValue(envelope(zero));
    await click(wrapper, "重新加载");
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.findAll('[aria-label="核心指标"] article')).toHaveLength(5);
    expect(wrapper.find('[aria-label="类型排行列表"]').exists()).toBe(true);
  });

  it("成功后刷新遇到数据库失败，旧指标及图表一并隐藏", async () => {
    const { request, api } = setup(envelope(populated));
    runtime.workbench.getStats.mockImplementation(api.getStats);
    const wrapper = render();
    await flushPromises();
    expect(wrapper.find('[aria-label="核心指标"]').exists()).toBe(true);
    request.mockResolvedValue(failure);
    await click(wrapper, "刷新数据");
    expect(wrapper.find('[aria-label="核心指标"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="类型排行列表"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("统计查询失败");
  });
});
