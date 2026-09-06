import { createApiClient, type ApiTransport, type TransportResponse } from "@gbnt/api-client";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import ElementPlus from "element-plus";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWorkbenchApi, type WorkbenchTodoResult, type WorkbenchTrendRange, type WorkbenchTrendResult } from "@/api/workbench";
import WorkbenchView from "@/views/workbench/WorkbenchView.vue";
import WorkbenchTodos from "@/views/workbench/WorkbenchTodos.vue";

const runtime = vi.hoisted(() => ({ workbench: { getStats: vi.fn(), getTrend: vi.fn(), getTodos: vi.fn() } }));
vi.mock("@/api/runtime", () => ({ useAdminApi: () => runtime }));

function trend(range: WorkbenchTrendRange = "week7"): WorkbenchTrendResult {
  const count = range === "week7" ? 7 : range === "month1" ? 30 : range === "halfyear" ? 6 : 1;
  return {
    range, granularity: range === "halfyear" ? "month" : range === "all" ? "year" : "day", timezone: "Asia/Shanghai", undated_completed: 1,
    points: Array.from({ length: count }, (_, i) => ({
      period: range === "all" ? "2026" : range === "halfyear" ? `2026-${String(i + 1).padStart(2, "0")}` : `2026-01-${String(i + 1).padStart(2, "0")}`,
      reported: i, completed: i % 2,
    })),
  };
}
const emptyTodos: WorkbenchTodoResult = { list: [], total: 0, page: 1, size: 20, today: "2026-01-02" };
const todo = {
  id: 1, issue_key: "ISSUE-1", code: "WELL-1", type: "well" as const, status: "new" as const,
  org_id: 4, org_name: "南村", org_path: "北城街道 / 南村", assignee_user: 6, assignee_user_name: "张三", plan_date: "2025-12-31", days_left: -2,
};
const sqlError = "Error 1054 (42S22): Unknown column 'r.round' in 'where clause'";
const sqlTraceId = "b0b92153-4110-461c-9371-1108f5b44312";
function trendFailure(status: number): TransportResponse<unknown> {
  return { status, headers: {}, data: { code: 500, data: null, message: sqlError, cost_ms: 1, trace_id: sqlTraceId } };
}
function apiWith(data: unknown) {
  const request = vi.fn().mockResolvedValue({ status: 200, headers: {}, data: { code: 0, data, message: "ok", trace_id: "workbench-test" } } satisfies TransportResponse<unknown>);
  return { request, api: createWorkbenchApi(createApiClient({ baseUrl: "", transport: { request: request as ApiTransport["request"] } })) };
}

describe("工作台新增正式 API", () => {
  it.each(["week7", "month1", "halfyear", "all"] as const)("趋势范围 %s 严格对应后端时间桶", async (range) => {
    const data = trend(range);
    const { api, request } = apiWith(data);
    expect(await api.getTrend(range)).toEqual(data);
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "GET", url: `/api/workbench/trend?range=${range}` }));
  });
  it.each([
    null,
    { ...trend(), timezone: "UTC" },
    { ...trend(), points: [] },
    { ...trend(), points: [trend().points[0], ...trend().points.slice(0, 6)] },
    { ...trend(), undated_completed: -1 },
    { ...trend(), points: trend().points.map((p) => ({ ...p, completed: "0" })) },
  ])("异常趋势不能降为假零统计", async (value) => {
    await expect(apiWith(value).api.getTrend()).rejects.toThrow("格式异常");
  });
  it.each([500, 200])("HTTP %i 的数据库错误保留失败信封，不能返回空趋势", async (status) => {
    const { api, request } = apiWith(null);
    request.mockResolvedValue(trendFailure(status));
    await expect(api.getTrend()).rejects.toMatchObject({ status, code: 500, message: sqlError, traceId: sqlTraceId });
  });
  it("待办独立接口只需要工作台权限、日期/姓名/期限与后端一致", async () => {
    const data = { ...emptyTodos, list: [todo], total: 1, page: 2 };
    const { api, request } = apiWith(data);
    expect(await api.getTodos({ page: 2, size: 20 })).toEqual(data);
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "GET", url: "/api/workbench/todos?page=2&size=20" }));
  });
  it.each([
    { ...emptyTodos, list: null },
    { ...emptyTodos, today: "2026-02-30" },
    { ...emptyTodos, list: [{ ...todo, status: "done" }] },
    { ...emptyTodos, list: [{ ...todo, days_left: "-1" }] },
    { ...emptyTodos, list: [{ ...todo, org_path: undefined }] },
  ])("异常待办不能展示为暂无待办", async (value) => {
    await expect(apiWith(value).api.getTodos()).rejects.toThrow("格式异常");
  });
});

const wrappers: VueWrapper[] = [];
function render() {
  const wrapper = mount(WorkbenchView, { global: { plugins: [ElementPlus], stubs: { WorkbenchTrendChart: { props: ["data"], template: '<div aria-label="趋势测试">{{ data.range }}</div>' } } } });
  wrappers.push(wrapper);
  return wrapper;
}
beforeEach(() => {
  runtime.workbench.getStats.mockResolvedValue({ total: 10, new: 2, pending: 3, done: 5, complete_rate: 50, by_type: { well: 2, road: 3, bridge: 1, forest: 2, transformer: 2 } });
  runtime.workbench.getTrend.mockImplementation(async (range) => trend(range));
  runtime.workbench.getTodos.mockResolvedValue({ ...emptyTodos, list: [todo], total: 25 });
});
afterEach(() => { wrappers.splice(0).forEach((w) => w.unmount()); vi.resetAllMocks(); });

describe("工作台原型结构与交互恢复", () => {
  it("趋势和类型排行并列、待办显示7列和后端姓名/倒计时", async () => {
    const wrapper = render();
    await flushPromises();
    expect(wrapper.find('.trend-grid').find('[aria-label="趋势测试"]').exists()).toBe(true);
    expect(wrapper.find('.trend-grid').find('[aria-label="类型排行列表"]').exists()).toBe(true);
    const panel = wrapper.findComponent(WorkbenchTodos);
    for (const label of ["类型", "编号", "行政区划", "整改人", "计划完成", "倒计时", "状态", "WELL-1", "北城街道 / 南村", "张三", "已逾期 2 天", "待整改"]) expect(panel.text()).toContain(label);
    expect(wrapper.text()).toContain("1 条已完成状态记录缺少本轮整改记录");
    expect(wrapper.text()).toContain("当前已完成问题、本轮最后一条整改记录时间");
  });
  it("切换范围及待办翻页会调用对应专用接口", async () => {
    const wrapper = render(); await flushPromises();
    await wrapper.findAll('button').find((b) => b.text() === "近半年")!.trigger("click"); await flushPromises();
    expect(runtime.workbench.getTrend).toHaveBeenLastCalledWith("halfyear");
    expect(wrapper.find('[aria-label="趋势测试"]').text()).toBe("halfyear");
    wrapper.findComponent(WorkbenchTodos).vm.$emit("page", 2); await flushPromises();
    expect(runtime.workbench.getTodos).toHaveBeenLastCalledWith({ page: 2, size: 20 });
  });
  it("趋势失败与待办失败独立呈现，不能误显示零值/空结果", async () => {
    runtime.workbench.getTrend.mockRejectedValue(new Error("趋势服务未部署"));
    runtime.workbench.getTodos.mockRejectedValue(new Error("待办读取失败"));
    const wrapper = render(); await flushPromises();
    expect(wrapper.text()).toContain("趋势服务未部署"); expect(wrapper.text()).toContain("待办读取失败");
    expect(wrapper.find('[aria-label="趋势测试"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="核心指标"]').exists()).toBe(true);
    expect(wrapper.findComponent(WorkbenchTodos).text()).not.toContain("暂无待办");
  });
  it.each([500, 200])("HTTP %i 的数据库错误显示安全空态，重试成功恢复趋势且不影响其它区域", async (status) => {
    const { api, request } = apiWith(null);
    request.mockResolvedValue(trendFailure(status));
    runtime.workbench.getTrend.mockImplementation(api.getTrend);
    const wrapper = render();
    await flushPromises();
    const panel = wrapper.find('.trend-grid');
    expect(panel.text()).toContain("暂无可展示数据");
    expect(panel.find('[role="status"]').text()).toBe("整改趋势暂时无法加载，请稍后重试");
    for (const detail of ["Error 1054", "42S22", "r.round", "where clause", "Trace ID", sqlTraceId]) {
      expect(wrapper.html()).not.toContain(detail);
    }
    expect(wrapper.find('[aria-label="趋势测试"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain("所选时段暂无上报或有完成日期的整改记录");
    expect(wrapper.find('[aria-label="核心指标"]').text()).toContain("10");
    expect(wrapper.find('[aria-label="类型排行列表"]').exists()).toBe(true);
    expect(wrapper.findComponent(WorkbenchTodos).text()).toContain("WELL-1");

    request.mockResolvedValue({ status: 200, headers: {}, data: { code: 0, data: trend(), message: "ok" } });
    await panel.findAll('button').find((button) => button.text() === "重新加载")!.trigger("click");
    await flushPromises();
    expect(runtime.workbench.getTrend).toHaveBeenCalledTimes(2);
    expect(runtime.workbench.getTrend).toHaveBeenLastCalledWith("week7");
    expect(wrapper.find('[aria-label="趋势测试"]').text()).toBe("week7");
    expect(panel.text()).not.toContain("暂无可展示数据");
    expect(panel.find('[role="status"]').exists()).toBe(false);
  });
  it("已有趋势刷新失败后隐藏旧图，保留失败而非显示假零数据", async () => {
    const { api, request } = apiWith(trend());
    runtime.workbench.getTrend.mockImplementation(api.getTrend);
    const wrapper = render();
    await flushPromises();
    expect(wrapper.find('[aria-label="趋势测试"]').exists()).toBe(true);
    request.mockResolvedValue(trendFailure(500));
    await wrapper.findAll('button').find((button) => button.text() === "刷新数据")!.trigger("click");
    await flushPromises();
    expect(wrapper.find('[aria-label="趋势测试"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("暂无可展示数据");
    expect(wrapper.text()).not.toContain("所选时段暂无上报或有完成日期的整改记录");
  });
  it("未设期限/人员/组织缺失不展示 undefined 或虚构姓名", async () => {
    runtime.workbench.getTodos.mockResolvedValue({ ...emptyTodos, total: 1, list: [{ ...todo, assignee_user: 0, assignee_user_name: null, org_path: null, org_name: null, plan_date: "", days_left: null }] });
    const wrapper = render(); await flushPromises();
    expect(wrapper.text()).toContain("未设期限"); expect(wrapper.text()).toContain("未指派"); expect(wrapper.text()).toContain("组织 #4（信息不可用）");
    expect(wrapper.text()).not.toContain("undefined");
  });
  it("较旧时间范围请求后返回不能覆盖最近选择", async () => {
    let finishOld!: (value: WorkbenchTrendResult) => void;
    runtime.workbench.getTrend.mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; }));
    const wrapper = render(); await flushPromises();
    await wrapper.findAll('button').find((b) => b.text() === "全部")!.trigger("click"); await flushPromises();
    finishOld(trend("week7")); await flushPromises();
    expect(wrapper.find('[aria-label="趋势测试"]').text()).toBe("all");
  });
});
