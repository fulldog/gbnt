import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { computed, defineComponent, h, inject, provide, type Component, type ComputedRef, type PropType } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StreetLedgerView from "@/views/ledger/StreetLedgerView.vue";
import SurveyLedgerView from "@/views/ledger/SurveyLedgerView.vue";
import StreetLedgerSheet from "@/components/ledger/StreetLedgerSheet.vue";
import SurveyLedgerSheet from "@/components/ledger/SurveyLedgerSheet.vue";
import LedgerFilters from "@/components/ledger/LedgerFilters.vue";
import LedgerReportFrame from "@/components/ledger/LedgerReportFrame.vue";
import { exportLedgerTable } from "@/utils/ledger-export";
import { streetReportRow, surveyReportRow } from "./fixtures/ledger-report";
import { allLedgerQuery, streetParts, surveyParts } from "./fixtures/ledger-report-parts";
import type { LedgerAppliedQuery } from "@/api/ledger-report-types";
import UserView from "@/views/system/UserView.vue";
import UserFormDialog from "@/views/system/UserFormDialog.vue";
import OrgView from "@/views/system/OrgView.vue";
import RoleView from "@/views/system/RoleView.vue";
import OpLogView from "@/views/system/OpLogView.vue";
import WorkbenchView from "@/views/workbench/WorkbenchView.vue";

const api = vi.hoisted(() => ({
  ledger: { getStreetReport: vi.fn(), getSurveyReport: vi.fn(), getStreetRows: vi.fn(), getStreetStatistics: vi.fn(),
    getSurveyRows: vi.fn(), getSurveyStatistics: vi.fn(), listStreetOrgOptions: vi.fn(), listSurveyOrgOptions: vi.fn() },
  users: { list: vi.fn(), remove: vi.fn(), create: vi.fn(), update: vi.fn() },
  orgs: { list: vi.fn() },
  roles: { list: vi.fn(), listApis: vi.fn(), getPermissions: vi.fn(), updatePermissions: vi.fn() },
  opLogs: { list: vi.fn() },
  workbench: {
    getStats: vi.fn(),
    getTrend: vi.fn().mockResolvedValue({ points: [], undated_completed: 0 }),
    getTodos: vi.fn().mockResolvedValue({ list: [], total: 0, page: 1, size: 20, today: "2026-09-05" }),
  },
}));
vi.mock("@/api/runtime", () => ({ useAdminApi: () => api }));
vi.mock("@/utils/ledger-export", () => ({ exportLedgerTable: vi.fn() }));
vi.mock("@/stores/permission", () => ({ usePermissionStore: () => ({ can: () => true }) }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ user: null }) }));
vi.mock("@/components/TypeDistributionChart.vue", () => ({ default: { template: "<div />" } }));
vi.mock("element-plus", async (importOriginal) => ({
  ...await importOriginal<typeof import("element-plus")>(),
  ElMessageBox: { confirm: vi.fn().mockResolvedValue("confirm") },
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

type Row = Record<string, unknown>;
const TableStub = defineComponent({
  name: "ElTable",
  props: { data: { type: Array as PropType<Row[]>, default: () => [] } },
  setup(props, { slots }) {
    provide("test-table-rows", computed(() => props.data));
    return () => h("div", { "data-testid": "table" }, slots.default?.());
  },
});
const ColumnStub = defineComponent({
  name: "ElTableColumn",
  props: { prop: String, label: String },
  setup(props, { slots }) {
    const rows = inject<ComputedRef<Row[]>>("test-table-rows")!;
    return () => h("div", { "data-column": props.label }, rows.value.map((row, $index) =>
      h("div", slots.default ? slots.default({ row, $index }) : String(row[props.prop ?? ""] ?? "")),
    ));
  },
});
const ButtonStub = defineComponent({
  name: "ElButton", props: { disabled: Boolean, loading: Boolean, nativeType: String },
  setup(props, { slots, attrs }) {
    return () => h("button", { ...attrs, type: props.nativeType ?? "button", disabled: props.disabled || props.loading }, slots.default?.());
  },
});
const PanelStub = defineComponent({
  props: { modelValue: Boolean },
  setup(props, { slots }) { return () => props.modelValue ? h("div", [slots.default?.(), slots.footer?.()]) : null; },
});
const FormStub = defineComponent({
  setup(_, { slots, expose }) {
    expose({ validate: () => Promise.resolve(true), clearValidate: () => undefined });
    return () => h("form", slots.default?.());
  },
});
const passthrough = { template: "<div><slot /></div>" };
const AlertStub = { props: ["title"], template: "<div>{{ title }}<slot /></div>" };
const wrappers: VueWrapper[] = [];
function render(component: Component) {
  const wrapper = mount(component, {
    global: { stubs: {
      ElTable: TableStub, ElTableColumn: ColumnStub, ElButton: ButtonStub,
      ElDialog: PanelStub, ElDrawer: PanelStub, ElForm: FormStub, ElFormItem: passthrough,
      ElSelect: true, ElOption: true, ElDatePicker: true, ElInput: true, ElRadioGroup: true, ElRadio: true,
      ElTag: passthrough, ElIcon: passthrough, ElUpload: true, ElPagination: true, ElTree: true,
      ElInputNumber: true, ElSkeleton: true, ElAlert: AlertStub, OrgTreeSelect: true,
      WorkbenchTrendChart: true,
    } },
  });
  wrappers.push(wrapper);
  return wrapper;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}
async function click(wrapper: VueWrapper, text: string) {
  const button = wrapper.findAll("button").find((item) => item.text() === text);
  expect(button, `找不到按钮 ${text}`).toBeDefined();
  await button!.trigger("click");
}
const user = {
  id: 2, username: "worker", name: "张三", phone: "", org_id: 3, role_id: 2,
  is_super_admin: false, status: 1, created_at: "2026-09-05T00:00:00Z", updated_at: "2026-09-05T00:00:00Z",
  org_name: "北城街道", org_path: "区 / 北城街道", role_name: "街道管理员",
};
const role = { id: 2, name: "街道管理员", desc: "", status: 1, created_at: "", updated_at: "" };

beforeEach(() => {
  vi.clearAllMocks();
  for (const group of Object.values(api)) for (const method of Object.values(group)) method.mockReset();
  api.ledger.listStreetOrgOptions.mockResolvedValue([]);
  api.ledger.listSurveyOrgOptions.mockResolvedValue([]);
  api.ledger.getStreetReport.mockResolvedValue({ street_org_id: 0, rows: [], notes: [] });
  api.ledger.getSurveyReport.mockResolvedValue({ street_org_id: 0, rows: [], notes: [] });
  for (const request of [api.ledger.getStreetRows, api.ledger.getStreetStatistics, api.ledger.getSurveyRows, api.ledger.getSurveyStatistics]) {
    request.mockImplementation(async (query: LedgerAppliedQuery) => ({ query, rows: [], notes: [] }));
  }
  api.users.list.mockResolvedValue({ list: [], total: 0, page: 1, size: 20 });
  api.users.remove.mockResolvedValue(null);
  api.orgs.list.mockResolvedValue([]);
  api.roles.list.mockResolvedValue([]);
  api.roles.listApis.mockResolvedValue([]);
  api.roles.getPermissions.mockResolvedValue({ api_ids: [] });
  api.opLogs.list.mockResolvedValue({ list: [], total: 0 });
});
afterEach(() => { for (const wrapper of wrappers.splice(0)) wrapper.unmount(); });

describe("汇总表真实状态", () => {
  it.each([
    ["街道台账", StreetLedgerView, api.ledger.getStreetRows],
    ["排查汇总", SurveyLedgerView, api.ledger.getSurveyRows],
  ] as const)("%s 的加载、成功空结果和失败分别展示，不将失败伪造为零", async (_, component, request) => {
    const wrapper = render(component);
    expect(wrapper.get("tbody").text()).toContain("正在加载");
    await flushPromises();
    expect(wrapper.get("tbody").text()).toContain("当前筛选条件下暂无");
    expect(wrapper.findComponent(TableStub).exists()).toBe(false);
    const pending = deferred<{ rows: [] }>();
    request.mockReturnValueOnce(pending.promise);
    await click(wrapper, "查询");
    expect(wrapper.get("tbody").text()).toContain("正在加载");
    pending.reject(new Error("服务暂不可用"));
    await flushPromises();
    expect(wrapper.text()).toContain("服务暂不可用");
    expect(wrapper.get("tbody").text()).toContain("加载失败");
    expect(wrapper.get("tbody").text()).not.toContain("暂无");
    expect(wrapper.findAll("button").find((button) => button.text() === "导出 Excel")!.attributes("disabled")).toBeDefined();
  });

  it("街道台账直接展示行名称且候选失败可重试，不调用系统组织接口", async () => {
    const parts = streetParts([streetReportRow()], allLedgerQuery, ["缺少资产基表"]);
    api.ledger.getStreetRows.mockResolvedValue(parts.base);
    api.ledger.getStreetStatistics.mockResolvedValue(parts.statistics);
    api.ledger.listStreetOrgOptions.mockRejectedValueOnce(new Error("无候选权限"));
    const wrapper = render(StreetLedgerView);
    await flushPromises();
    expect(wrapper.text()).toContain("北城街道");
    expect(wrapper.getComponent(StreetLedgerSheet).props("rows")).toHaveLength(1);
    expect(wrapper.get("tfoot").text()).toContain("缺少资产基表");
    expect(wrapper.text()).toContain("无候选权限");
    expect(api.orgs.list).not.toHaveBeenCalled();
    await click(wrapper, "重新加载");
    await flushPromises();
    expect(api.ledger.listStreetOrgOptions).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).not.toContain("无候选权限");
  });

  it("连续查询仅保留最新响应，旧失败不能清空新结果", async () => {
    const old = deferred<{ rows: Row[] }>();
    const parts = surveyParts([surveyReportRow()]);
    api.ledger.getSurveyRows.mockReturnValueOnce(old.promise).mockResolvedValueOnce(parts.base);
    api.ledger.getSurveyStatistics.mockResolvedValue(parts.statistics);
    const wrapper = render(SurveyLedgerView);
    await click(wrapper, "查询");
    await flushPromises();
    old.reject(new Error("旧请求失败"));
    await flushPromises();
    expect(wrapper.getComponent(SurveyLedgerSheet).props("rows")).toEqual([surveyReportRow()]);
    expect(wrapper.text()).not.toContain("旧请求失败");
  });

  it("查询日期快照随结果写入报表，修改未查询条件不污染当前导出口径", async () => {
    const wrapper = render(StreetLedgerView);
    await flushPromises();
    const filters = wrapper.getComponent(LedgerFilters);
    filters.vm.$emit("update:streetOrgId", 2);
    filters.vm.$emit("update:dateRange", ["2026-01-01", "2026-08-31"]);
    await flushPromises();
    const parts = streetParts([streetReportRow()], { street_org_id: 2, date_from: "2026-01-01", date_to: "2026-08-31" }, ["非去重资产总量"]);
    const pending = deferred<typeof parts.base>();
    api.ledger.getStreetRows.mockReturnValueOnce(pending.promise);
    api.ledger.getStreetStatistics.mockResolvedValueOnce(parts.statistics);
    await click(wrapper, "查询");
    expect(api.ledger.getStreetRows).toHaveBeenLastCalledWith({ street_org_id: 2, date_from: "2026-01-01", date_to: "2026-08-31" });
    expect(api.ledger.getStreetStatistics).toHaveBeenLastCalledWith({ street_org_id: 2, date_from: "2026-01-01", date_to: "2026-08-31" });
    filters.vm.$emit("update:dateRange", ["2025-01-01", "2025-12-31"]);
    pending.resolve(parts.base);
    await flushPromises();
    expect(wrapper.get("tfoot").text()).toContain("2026-01-01 至 2026-08-31");
    expect(wrapper.get("tfoot").text()).not.toContain("2025-01-01");
    expect(wrapper.get("thead").text()).toContain("北城街道台账");
  });

  it.each(["street", "survey"] as const)("%s 两页导出 handler 二次保护，并只使用已提交的筛选与完整表格", async (kind) => {
    const component = kind === "street" ? StreetLedgerView : SurveyLedgerView;
    const readRows = kind === "street" ? api.ledger.getStreetRows : api.ledger.getSurveyRows;
    const readStatistics = kind === "street" ? api.ledger.getStreetStatistics : api.ledger.getSurveyStatistics;
    const makeParts = (query: LedgerAppliedQuery) => kind === "street"
      ? streetParts([streetReportRow()], query) : surveyParts([surveyReportRow()], query);
    const parts = makeParts(allLedgerQuery);
    const pending = deferred<typeof parts.base>();
    readRows.mockReturnValueOnce(pending.promise);
    readStatistics.mockResolvedValueOnce(parts.statistics);
    const wrapper = render(component);
    const frame = wrapper.getComponent(LedgerReportFrame);
    const emitExport = () => frame.vm.$emit("export", wrapper.get("table").element);
    emitExport(); expect(exportLedgerTable).not.toHaveBeenCalled();
    pending.resolve(parts.base); await flushPromises();
    expect(frame.props("exportDisabled")).toBe(false);
    emitExport();
    const label = kind === "street" ? "街道台账" : "街道排查汇总";
    expect(exportLedgerTable).toHaveBeenLastCalledWith(wrapper.get("table").element, `${label}_全部街道_全部日期`);

    const query = { street_org_id: 2, date_from: "2026-01-01", date_to: "2026-08-31" };
    const filters = wrapper.getComponent(LedgerFilters);
    filters.vm.$emit("update:streetOrgId", query.street_org_id);
    filters.vm.$emit("update:dateRange", [query.date_from, query.date_to]);
    await flushPromises();
    emitExport();
    expect(exportLedgerTable).toHaveBeenLastCalledWith(wrapper.get("table").element, `${label}_全部街道_全部日期`);
    expect(wrapper.get("tfoot").text()).toContain("全部日期");

    const selectedParts = makeParts(query);
    readRows.mockResolvedValueOnce(selectedParts.base); readStatistics.mockResolvedValueOnce(selectedParts.statistics);
    await click(wrapper, "查询"); await flushPromises(); emitExport();
    expect(exportLedgerTable).toHaveBeenLastCalledWith(wrapper.get("table").element, `${label}_街道2_2026-01-01至2026-08-31`);
    expect(wrapper.get("thead").text()).toContain("北城街道");
    expect(wrapper.get("tfoot").text()).toContain("2026-01-01 至 2026-08-31");
    const exportsBeforeFailure = vi.mocked(exportLedgerTable).mock.calls.length;
    readRows.mockRejectedValueOnce(new Error("基础行失败"));
    readStatistics.mockResolvedValueOnce(selectedParts.statistics);
    frame.vm.$emit("refresh"); emitExport();
    expect(exportLedgerTable).toHaveBeenCalledTimes(exportsBeforeFailure);
    await flushPromises(); emitExport();
    expect(exportLedgerTable).toHaveBeenCalledTimes(exportsBeforeFailure);
    expect(frame.props("exportDisabled")).toBe(true);
    expect(wrapper.get("tbody").text()).toContain("加载失败");
    expect(api.ledger.getStreetReport).not.toHaveBeenCalled();
    expect(api.ledger.getSurveyReport).not.toHaveBeenCalled();
  });

  it.each(["street", "survey"] as const)("%s 合法空态同样不能通过直接事件导出", async (kind) => {
    const wrapper = render(kind === "street" ? StreetLedgerView : SurveyLedgerView);
    await flushPromises();
    const frame = wrapper.getComponent(LedgerReportFrame);
    frame.vm.$emit("export", wrapper.get("table").element);
    expect(exportLedgerTable).not.toHaveBeenCalled();
    expect(frame.props("exportDisabled")).toBe(true);
  });
});

describe("工作人员展示与表单候选", () => {
  it("字典无权限不影响名称展示，超管不显示组织 #0 或角色 #0", async () => {
    api.users.list.mockResolvedValue({ list: [user, { ...user, id: 1, username: "admin", org_id: 0, role_id: 0, org_path: null, org_name: null, role_name: null, is_super_admin: true }], total: 2 });
    api.orgs.list.mockRejectedValue(new Error("组织读取未授权"));
    api.roles.list.mockRejectedValue(new Error("角色读取未授权"));
    const wrapper = render(UserView);
    await flushPromises();
    expect(wrapper.get('[data-column="所属组织"]').text()).toContain("区 / 北城街道");
    expect(wrapper.get('[data-column="角色"]').text()).toContain("街道管理员");
    expect(wrapper.get('[data-column="角色"]').text()).toContain("超级管理员");
    expect(wrapper.text()).not.toMatch(/组织 #0|角色 #0/);
    expect(wrapper.text()).toContain("组织读取未授权");
    await click(wrapper, "新增人员");
    const form = wrapper.getComponent(UserFormDialog);
    expect(form.props("optionsReady")).toBe(false);
    const save = wrapper.findAll("button").find((button) => button.text() === "保存")!;
    expect(save.attributes("disabled")).toBeDefined();
    expect(api.users.create).not.toHaveBeenCalled();
  });

  it("改每页条数回到第一页，删除最后一页最后一条时退到有效页", async () => {
    api.users.list.mockResolvedValue({ list: [user], total: 21 });
    const wrapper = render(UserView);
    await flushPromises();
    let pagination = wrapper.getComponent({ name: "ElPagination" });
    pagination.vm.$emit("update:current-page", 2);
    pagination.vm.$emit("current-change", 2);
    await flushPromises();
    expect(api.users.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, size: 20 }));
    api.users.list.mockResolvedValueOnce({ list: [], total: 20 }).mockResolvedValueOnce({ list: [user], total: 20 });
    await click(wrapper, "删除");
    await flushPromises();
    expect(api.users.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, size: 20 }));
    pagination = wrapper.getComponent({ name: "ElPagination" });
    pagination.vm.$emit("update:page-size", 50);
    pagination.vm.$emit("size-change", 50);
    await flushPromises();
    expect(api.users.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, size: 50 }));
  });
});

describe("其他列表回归", () => {
  it.each([
    ["组织", OrgView, api.orgs.list, [{ id: 1, parent_id: 0, type: "root", name: "测试组织", sort: 0 }]],
    ["角色", RoleView, api.roles.list, [role]],
    ["日志", OpLogView, api.opLogs.list, { list: [{ id: 1, username: "测试账号" }], total: 1 }],
  ] as const)("%s 刷新失败时清除旧表并显示可重试错误", async (_, component, request, response) => {
    request.mockResolvedValueOnce(response);
    const wrapper = render(component);
    await flushPromises();
    expect(wrapper.getComponent(TableStub).props("data")).toHaveLength(1);
    request.mockRejectedValueOnce(new Error("刷新失败"));
    await click(wrapper, "刷新");
    await flushPromises();
    expect(wrapper.getComponent(TableStub).props("data")).toEqual([]);
    expect(wrapper.text()).toContain("刷新失败");
  });

  it("权限读取失败不能把旧勾选或空选择保存到角色", async () => {
    api.roles.list.mockResolvedValue([role]);
    api.roles.getPermissions.mockRejectedValueOnce(new Error("权限读取失败"));
    const wrapper = render(RoleView);
    await flushPromises();
    await click(wrapper, "授权");
    await flushPromises();
    expect(wrapper.text()).toContain("权限读取失败");
    const save = wrapper.findAll("button").find((button) => button.text() === "保存权限")!;
    expect(save.attributes("disabled")).toBeDefined();
    expect(api.roles.updatePermissions).not.toHaveBeenCalled();
  });

  it("工作台刷新失败后隐藏之前成功的指标", async () => {
    api.workbench.getStats.mockResolvedValueOnce({ total: 99, new: 10, pending: 20, done: 69, complete_rate: 69.7, by_type: [] });
    const wrapper = render(WorkbenchView);
    await flushPromises();
    expect(wrapper.find('[aria-label="核心指标"]').exists()).toBe(true);
    api.workbench.getStats.mockRejectedValueOnce(new Error("统计不可用"));
    await click(wrapper, "刷新数据");
    await flushPromises();
    expect(wrapper.find('[aria-label="核心指标"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("统计不可用");
  });
});
