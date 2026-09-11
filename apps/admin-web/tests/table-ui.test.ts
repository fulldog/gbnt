import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { computed, defineComponent, h, inject, provide, type Component, type ComputedRef, type PropType } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import { ElCheckbox, ElMessage, ElMessageBox, ElSwitch } from "element-plus";
import PermissionMatrix from "@/components/PermissionMatrix.vue";
import RoleFormDialog from "@/views/system/RoleFormDialog.vue";
import { roleCatalog, sysRole } from "./fixtures/roles";
import StreetLedgerView from "@/views/ledger/StreetLedgerView.vue";
import SurveyLedgerView from "@/views/ledger/SurveyLedgerView.vue";
import StreetLedgerSheet from "@/components/ledger/StreetLedgerSheet.vue";
import SurveyLedgerSheet from "@/components/ledger/SurveyLedgerSheet.vue";
import LedgerFilters from "@/components/ledger/LedgerFilters.vue";
import LedgerReportFrame from "@/components/ledger/LedgerReportFrame.vue";
import { exportLedgerTable } from "@/utils/ledger-export";
import { downloadBlob } from "@/utils/download";
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
  auth: { getMe: vi.fn() },
  ledger: { getStreetReport: vi.fn(), getSurveyReport: vi.fn(), getStreetRows: vi.fn(), getStreetStatistics: vi.fn(),
    getSurveyRows: vi.fn(), getSurveyStatistics: vi.fn(), listStreetOrgOptions: vi.fn(), listSurveyOrgOptions: vi.fn() },
  users: { list: vi.fn(), remove: vi.fn(), create: vi.fn(), update: vi.fn(), updateStatus: vi.fn(), resetPassword: vi.fn() },
  orgs: { list: vi.fn(), remove: vi.fn() },
  roles: { list: vi.fn(), listApis: vi.fn(), getPermissions: vi.fn(), updatePermissions: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  opLogs: { list: vi.fn() },
  workbench: {
    getStats: vi.fn(),
    getTrend: vi.fn().mockResolvedValue({ points: [], undated_completed: 0 }),
    getTodos: vi.fn().mockResolvedValue({ list: [], total: 0, page: 1, size: 20, today: "2026-09-05" }),
  },
}));
const session = vi.hoisted(() => ({
  auth: { user: null as { role_id: number } | null, applyUser: vi.fn(), reset: vi.fn() },
  permission: { can: vi.fn(() => true), reset: vi.fn(), loadCatalog: vi.fn(), catalogAvailable: false, catalog: [] as import("@gbnt/api-client").SysApi[] },
  router: { replace: vi.fn() },
}));
vi.mock("@/api/runtime", () => ({ useAdminApi: () => api }));
vi.mock("@/utils/ledger-export", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/utils/ledger-export")>();
  return { ...actual, exportLedgerTable: vi.fn(actual.exportLedgerTable) };
});
vi.mock("@/utils/download", () => ({ downloadBlob: vi.fn() }));
vi.mock("@/stores/permission", () => ({ usePermissionStore: () => session.permission }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => session.auth }));
vi.mock("vue-router", async (importOriginal) => ({ ...await importOriginal<typeof import("vue-router")>(), useRouter: () => session.router }));
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
    function flatten(rows: Row[]): Row[] {
      return rows.flatMap((row) => [row, ...flatten((row.children ?? []) as Row[])]);
    }
    provide("test-table-rows", computed(() => flatten(props.data)));
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
const TreeStub = defineComponent({
  name: "ElTree",
  setup(_, { expose }) {
    expose({ filter: vi.fn() });
    return () => h("div");
  },
});
const AlertStub = { props: ["title"], template: "<div>{{ title }}<slot /></div>" };
const wrappers: VueWrapper[] = [];
function render(component: Component, stubs: Record<string, Component | boolean> = {}) {
  const wrapper = mount(component, {
    global: { stubs: {
      ElTable: TableStub, ElTableColumn: ColumnStub, ElButton: ButtonStub,
      ElDialog: PanelStub, ElDrawer: PanelStub, ElForm: FormStub, ElFormItem: passthrough,
      ElSelect: true, ElOption: true, ElDatePicker: true, ElInput: true, ElRadioGroup: true, ElRadio: true,
      ElTag: passthrough, ElIcon: passthrough, ElUpload: true, ElPagination: true, ElTree: TreeStub,
      ElInputNumber: true, ElSkeleton: true, ElAlert: AlertStub, OrgTreeSelect: true,
      WorkbenchTrendChart: true,
      ...stubs,
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
  const button = wrapper.findAll("button").find((item) => item.text() === text || item.attributes("aria-label") === text);
  expect(button, `找不到按钮 ${text}`).toBeDefined();
  await button!.trigger("click");
}
function readBlobBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}
const user = {
  id: 2, username: "worker", name: "张三", phone: "", org_id: 3, role_id: 2,
  is_super_admin: false, status: 1, created_at: "2026-09-05T00:00:00Z", updated_at: "2026-09-05T00:00:00Z",
  org_name: "北城街道", org_path: "区 / 北城街道", role_name: "街道管理员",
};
const role = { id: 2, code: "street-admin", name: "街道管理员", desc: "", status: 1, created_at: "", updated_at: "" };

beforeEach(() => {
  vi.clearAllMocks();
  session.auth.user = null;
  session.permission.catalogAvailable = false;
  session.permission.catalog = [];
  session.permission.can.mockReset().mockReturnValue(true);
  vi.mocked(exportLedgerTable).mockReset().mockResolvedValue(undefined);
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
  api.roles.update.mockResolvedValue(role);
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
    expect(wrapper.text()).not.toContain("缺少资产基表");
    expect(wrapper.text()).not.toContain("数据口径");
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

  it("保留查询日期快照，修改未查询条件不污染结果且不再生成日期脚注", async () => {
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
    expect(wrapper.get("tfoot").text()).not.toContain("2026-01-01");
    expect(wrapper.get("tfoot").text()).not.toContain("2025-01-01");
    expect(wrapper.text()).not.toContain("上报日期范围");
    expect(wrapper.text()).not.toContain("非去重资产总量");
    expect(wrapper.get("thead").text()).toContain("北城街道台账");
    await click(wrapper, "导出 Excel");
    expect(exportLedgerTable).toHaveBeenLastCalledWith(wrapper.get("table").element, "街道台账_街道2_2026-01-01至2026-08-31");
  });

  it.each(["street", "survey"] as const)("%s 页面与实际导出 XLSX 均不含动态口径行，保留原始备注、标题和数据", async (kind) => {
    const actualExport = await vi.importActual<typeof import("@/utils/ledger-export")>("@/utils/ledger-export");
    vi.mocked(exportLedgerTable).mockImplementation(actualExport.exportLedgerTable);
    const component = kind === "street" ? StreetLedgerView : SurveyLedgerView;
    const readRows = kind === "street" ? api.ledger.getStreetRows : api.ledger.getSurveyRows;
    const readStatistics = kind === "street" ? api.ledger.getStreetStatistics : api.ledger.getSurveyStatistics;
    const notes = ["基础资料未采集，不代表零。", "统计只按上报记录，不代表去重资产。", "上报日期：服务端动态备注。"];
    const makeParts = (query: LedgerAppliedQuery) => {
      const parts = kind === "street" ? streetParts([streetReportRow()], query, [notes[0]!]) : surveyParts([surveyReportRow()], query, [notes[0]!]);
      return { ...parts, statistics: { ...parts.statistics, notes: notes.slice(1) } };
    };
    readRows.mockImplementation(async (query: LedgerAppliedQuery) => makeParts(query).base);
    readStatistics.mockImplementation(async (query: LedgerAppliedQuery) => makeParts(query).statistics);
    const wrapper = render(component);
    await flushPromises();
    const filters = wrapper.getComponent(LedgerFilters);
    filters.vm.$emit("update:streetOrgId", 2);
    filters.vm.$emit("update:dateRange", ["2026-01-01", "2026-08-31"]);
    await flushPromises();
    await click(wrapper, "查询");
    await flushPromises();
    expect(wrapper.findAll("tfoot tr")).toHaveLength(1);
    await click(wrapper, "导出 Excel");
    await vi.mocked(exportLedgerTable).mock.results.at(-1)!.value;
    const label = kind === "street" ? "街道台账" : "街道排查汇总";
    expect(downloadBlob).toHaveBeenLastCalledWith(expect.any(Blob), `${label}_街道2_2026-01-01至2026-08-31.xlsx`);
    const [blob] = vi.mocked(downloadBlob).mock.calls.at(-1)!;
    const buffer = await readBlobBuffer(blob);
    expect(Array.from(new Uint8Array(buffer).slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.getWorksheet(1)!;
    const values: string[] = [];
    sheet.eachRow((row) => row.eachCell((cell) => values.push(cell.text)));
    if (kind === "street") {
      expect(wrapper.find(".ledger-report-notice").exists()).toBe(false);
      expect(wrapper.text()).not.toContain("按上报日期筛选");
      expect(wrapper.find('[title*="口径"]').exists()).toBe(false);
    } else {
      expect(wrapper.text()).toContain("按上报日期筛选");
    }
    for (const note of ["统计口径", "数据口径", "上报日期范围", ...notes]) expect(wrapper.text()).not.toContain(note);
    for (const text of [wrapper.get("table").text(), values.join("\n")]) {
      expect(text).toContain("北城街道");
      expect(text).toContain(wrapper.get("thead tr:first-child th").text());
      expect(text).toContain("上报表格加盖所属街道办事处公章及主要负责人及分管负责人签字。");
      if (kind === "survey") expect(text).toContain("注：排查范围是2010年以来高标范围内所有机井、桥涵、道路。");
      else expect(text).toContain("1.25");
      for (const note of ["统计口径", "数据口径", "上报日期", ...notes]) expect(text).not.toContain(note);
    }
    const columns = kind === "street" ? 17 : 22;
    expect(sheet.columnCount).toBe(columns);
    expect(sheet.getCell(1, columns).isMerged).toBe(true);
    expect(sheet.getCell(1, columns).master.address).toBe("A1");
  });

  it.each(["street", "survey"] as const)("%s 异步导出期间显示独立加载，按钮与直接事件均不能重复导出", async (kind) => {
    const parts = kind === "street" ? streetParts([streetReportRow()]) : surveyParts([surveyReportRow()]);
    const readRows = kind === "street" ? api.ledger.getStreetRows : api.ledger.getSurveyRows;
    const readStatistics = kind === "street" ? api.ledger.getStreetStatistics : api.ledger.getSurveyStatistics;
    readRows.mockResolvedValue(parts.base);
    readStatistics.mockResolvedValue(parts.statistics);
    const wrapper = render(kind === "street" ? StreetLedgerView : SurveyLedgerView);
    await flushPromises();
    const frame = wrapper.getComponent(LedgerReportFrame);
    const pending = deferred<void>();
    vi.mocked(exportLedgerTable).mockReturnValueOnce(pending.promise);
    frame.vm.$emit("export", wrapper.get("table").element);
    frame.vm.$emit("export", wrapper.get("table").element);
    expect(exportLedgerTable).toHaveBeenCalledOnce();
    await flushPromises();
    expect(frame.props("exporting")).toBe(true);
    expect(frame.props("loading")).toBe(false);
    const button = wrapper.findAll("button").find((item) => item.text() === "导出 Excel")!;
    expect(button.attributes("disabled")).toBeDefined();
    await button.trigger("click");
    expect(exportLedgerTable).toHaveBeenCalledOnce();
    pending.resolve(undefined);
    await flushPromises();
    expect(frame.props("exporting")).toBe(false);
    expect(button.attributes("disabled")).toBeUndefined();
    expect(ElMessage.error).not.toHaveBeenCalled();
    await button.trigger("click");
    await flushPromises();
    expect(exportLedgerTable).toHaveBeenCalledTimes(2);
  });

  it.each(["street", "survey"] as const)("%s 捕获异步导出失败，恢复按钮并保留当前数据供重试", async (kind) => {
    const parts = kind === "street" ? streetParts([streetReportRow()]) : surveyParts([surveyReportRow()]);
    const readRows = kind === "street" ? api.ledger.getStreetRows : api.ledger.getSurveyRows;
    const readStatistics = kind === "street" ? api.ledger.getStreetStatistics : api.ledger.getSurveyStatistics;
    readRows.mockResolvedValue(parts.base);
    readStatistics.mockResolvedValue(parts.statistics);
    const wrapper = render(kind === "street" ? StreetLedgerView : SurveyLedgerView);
    await flushPromises();
    const frame = wrapper.getComponent(LedgerReportFrame);
    const body = wrapper.get("tbody").text();
    const pending = deferred<void>();
    vi.mocked(exportLedgerTable).mockReturnValueOnce(pending.promise);
    await click(wrapper, "导出 Excel");
    expect(frame.props("exporting")).toBe(true);
    pending.reject(new Error("工作簿生成失败"));
    await flushPromises();
    expect(ElMessage.error).toHaveBeenCalledExactlyOnceWith("工作簿生成失败");
    expect(frame.props("exporting")).toBe(false);
    expect(frame.props("exportDisabled")).toBe(false);
    expect(wrapper.get("tbody").text()).toBe(body);
    const button = wrapper.findAll("button").find((item) => item.text() === "导出 Excel")!;
    expect(button.attributes("disabled")).toBeUndefined();
    await button.trigger("click");
    await flushPromises();
    expect(exportLedgerTable).toHaveBeenCalledTimes(2);
    expect(frame.props("exporting")).toBe(false);
    expect(ElMessage.error).toHaveBeenCalledTimes(1);
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
    expect(wrapper.get("tfoot").text()).not.toContain("全部日期");

    const selectedParts = makeParts(query);
    readRows.mockResolvedValueOnce(selectedParts.base); readStatistics.mockResolvedValueOnce(selectedParts.statistics);
    await click(wrapper, "查询"); await flushPromises(); emitExport();
    expect(exportLedgerTable).toHaveBeenLastCalledWith(wrapper.get("table").element, `${label}_街道2_2026-01-01至2026-08-31`);
    expect(wrapper.get("thead").text()).toContain("北城街道");
    expect(wrapper.get("tfoot").text()).not.toContain("2026-01-01 至 2026-08-31");
    expect(wrapper.get("tfoot").text()).not.toContain("数据口径");
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
  it("组织树选中和清空会重新查询，并回到第一页", async () => {
    const wrapper = render(UserView);
    await flushPromises();
    const pagination = wrapper.getComponent({ name: "ElPagination" });
    pagination.vm.$emit("update:current-page", 3);
    pagination.vm.$emit("current-change", 3);
    await flushPromises();
    wrapper.getComponent(TreeStub).vm.$emit("node-click", { id: 3 });
    await flushPromises();
    expect(api.users.list).toHaveBeenLastCalledWith(expect.objectContaining({ org_id: 3, page: 1 }));
    await click(wrapper, "全部");
    await flushPromises();
    expect(api.users.list).toHaveBeenLastCalledWith(expect.objectContaining({ org_id: undefined, page: 1 }));
  });

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

describe("组织和人员操作栏对齐原型", () => {
  it("组织行依次为新增单位、修改、删除，根删除与末级新增禁用，父单位删除给出提示", async () => {
    api.orgs.list.mockResolvedValue([
      { id: 1, parent_id: 0, type: "root", name: "根组织", sort: 1 },
      { id: 2, parent_id: 1, type: "district", name: "区", sort: 1 },
      { id: 3, parent_id: 2, type: "street", name: "街道", sort: 1 },
      { id: 4, parent_id: 3, type: "village", name: "村", sort: 1 },
    ]);
    const wrapper = render(OrgView);
    await flushPromises();
    const rows = wrapper.findAll(".table-actions");
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      const buttons = row.findAll("button");
      expect(buttons.map((button) => button.text())).toEqual(["新增单位", "修改", "删除"]);
      expect(buttons.every((button) => button.attributes("icon") === undefined)).toBe(true);
    }
    expect(rows[0]!.findAll("button")[2]!.attributes("disabled")).toBeDefined();
    expect(rows[3]!.findAll("button")[0]!.attributes("disabled")).toBeDefined();
    await rows[1]!.findAll("button")[2]!.trigger("click");
    expect(ElMessage.warning).toHaveBeenCalledWith("请先删除下级单位");
    expect(ElMessageBox.confirm).not.toHaveBeenCalled();
    expect(api.orgs.remove).not.toHaveBeenCalled();
    await rows[3]!.findAll("button")[2]!.trigger("click");
    await flushPromises();
    expect(api.orgs.remove).toHaveBeenCalledWith(4);
  });

  it("组织按钮继续按新增、修改、删除权限分别控制", async () => {
    session.permission.can.mockImplementation((...args: unknown[]) => args[1] === "edit");
    api.orgs.list.mockResolvedValue([{ id: 1, parent_id: 0, type: "root", name: "根组织", sort: 1 }]);
    const wrapper = render(OrgView);
    await flushPromises();
    expect(wrapper.get(".table-actions").findAll("button").map((button) => button.text())).toEqual(["修改"]);
  });

  it("人员操作只有重置密码、编辑、删除，重置使用主色并保留二次确认", async () => {
    api.users.list.mockResolvedValue({ list: [user], total: 1, page: 1, size: 20 });
    const wrapper = render(UserView);
    await flushPromises();
    const actions = wrapper.get('[data-column="操作"]');
    expect(actions.attributes("width")).toBe("220");
    expect(wrapper.findAllComponents(ButtonStub).filter((button) => button.element.closest('[data-column="操作"]')).map((button) => [button.text(), button.vm.$attrs.type])).toEqual([
      ["重置密码", "primary"], ["编辑", "primary"], ["删除", "danger"],
    ]);
    vi.mocked(ElMessageBox.confirm).mockRejectedValueOnce("cancel");
    await click(wrapper, "重置密码");
    await flushPromises();
    expect(api.users.resetPassword).not.toHaveBeenCalled();
    await click(wrapper, "重置密码");
    await flushPromises();
    expect(ElMessageBox.confirm).toHaveBeenLastCalledWith(expect.stringContaining("密码将重置为账号"), "重置密码", expect.anything());
    expect(api.users.resetPassword).toHaveBeenCalledWith(user.id);
  });

  it.each([0, 1])("状态%s切换只写状态，等待期间锁定同一行且不能重复提交", async (initial) => {
    api.users.list.mockResolvedValueOnce({ list: [{ ...user, status: initial }], total: 1, page: 1, size: 20 })
      .mockResolvedValue({ list: [{ ...user, status: initial === 1 ? 0 : 1 }], total: 1, page: 1, size: 20 });
    const pending = deferred<null>();
    api.users.updateStatus.mockReturnValueOnce(pending.promise);
    const wrapper = render(UserView);
    await flushPromises();
    const control = wrapper.getComponent(ElSwitch);
    await control.trigger("click");
    expect(control.props("loading")).toBe(true);
    expect(control.props("modelValue")).toBe(initial === 1);
    expect(wrapper.get(".table-actions").findAll("button").every((button) => button.attributes("disabled") !== undefined)).toBe(true);
    await control.props("beforeChange")?.();
    expect(api.users.updateStatus).toHaveBeenCalledExactlyOnceWith(user.id, { status: initial === 1 ? 0 : 1 });
    expect(api.users.update).not.toHaveBeenCalled();
    pending.resolve(null);
    await flushPromises();
    expect(wrapper.getComponent(ElSwitch).props("modelValue")).toBe(initial !== 1);
    expect(wrapper.getComponent(ElSwitch).props("loading")).toBe(false);
  });

  it("状态保存失败不改变开关，解锁后可重试", async () => {
    api.users.list.mockResolvedValue({ list: [user], total: 1, page: 1, size: 20 });
    api.users.updateStatus.mockRejectedValue(new Error("状态保存失败"));
    const wrapper = render(UserView);
    await flushPromises();
    const control = wrapper.getComponent(ElSwitch);
    await control.trigger("click");
    await flushPromises();
    expect(control.props("modelValue")).toBe(true);
    expect(control.props("loading")).toBe(false);
    expect(ElMessage.error).toHaveBeenCalledWith("状态保存失败");
    await control.trigger("click");
    await flushPromises();
    expect(api.users.updateStatus).toHaveBeenCalledTimes(2);
  });

  it("超级管理员和无修改权限账号的状态开关不可操作", async () => {
    session.permission.can.mockImplementation((...args: unknown[]) => args[1] !== "edit");
    api.users.list.mockResolvedValue({ list: [{ ...user, id: 1, is_super_admin: true }, user], total: 2, page: 1, size: 20 });
    const wrapper = render(UserView);
    await flushPromises();
    for (const control of wrapper.findAllComponents(ElSwitch)) {
      expect(control.props("disabled")).toBe(true);
      await control.props("beforeChange")?.();
    }
    expect(api.users.updateStatus).not.toHaveBeenCalled();
    expect(wrapper.get('[data-column="操作"]').text()).toContain("超级管理员");
    expect(wrapper.get('[data-column="操作"]').findAll("button").map((button) => button.text())).toEqual(["删除"]);
  });
});

describe("其他列表回归", () => {
  it("角色表七列、仅修改删除、查询条件显式应用且ID精确匹配", async () => {
    api.roles.list.mockResolvedValue([sysRole(7, "系统配置员"), sysRole(8, "系统配置员"), sysRole(9, "汇总管理员")]);
    api.roles.listApis.mockResolvedValue(roleCatalog);
    const wrapper = render(RoleView);
    await flushPromises();
    expect(wrapper.findAll("[data-column]").map((item) => item.attributes("data-column"))).toEqual(["序号", "角色名称", "角色ID", "备注", "创建时间", "状态", "操作"]);
    expect(wrapper.get('[data-column="操作"]').findAll("button").map((item) => item.text())).toEqual(["修改", "删除", "修改", "删除", "修改", "删除"]);
    const inputs = wrapper.findAllComponents({ name: "ElInput" });
    inputs[0]!.vm.$emit("update:modelValue", "系统配置");
    await flushPromises();
    expect(wrapper.getComponent(TableStub).props("data")).toHaveLength(3);
    await wrapper.get(".query-panel form").trigger("submit");
    expect((wrapper.getComponent(TableStub).props("data") as Row[]).map((row) => row.id)).toEqual([8, 7]);
    inputs[1]!.vm.$emit("update:modelValue", " TEST-7 ");
    await wrapper.get(".query-panel form").trigger("submit");
    expect((wrapper.getComponent(TableStub).props("data") as Row[]).map((row) => row.id)).toEqual([7]);
    expect(wrapper.get('[data-column="角色ID"]').text()).toContain("test-7");
    inputs[1]!.vm.$emit("update:modelValue", "1.2");
    await wrapper.get(".query-panel form").trigger("submit");
    expect(wrapper.getComponent(TableStub).props("data")).toHaveLength(1);
    await click(wrapper, "重置");
    expect(wrapper.getComponent(TableStub).props("data")).toHaveLength(3);
  });

  it("角色分页默认10条，删除末页末条回到有效页", async () => {
    const list = Array.from({ length: 11 }, (_, index) => sysRole(index + 2));
    api.roles.list.mockResolvedValueOnce(list).mockResolvedValueOnce(list.filter((row) => row.id !== 2));
    const wrapper = render(RoleView);
    await flushPromises();
    const pagination = wrapper.getComponent({ name: "ElPagination" });
    expect(pagination.props("pageSize")).toBe(10);
    pagination.vm.$emit("update:current-page", 2);
    await flushPromises();
    expect(wrapper.getComponent(TableStub).props("data")).toHaveLength(1);
    await click(wrapper, "删除");
    await flushPromises();
    expect(api.roles.remove).toHaveBeenCalledWith(2);
    expect(pagination.props("currentPage")).toBe(1);
    expect(wrapper.getComponent(TableStub).props("data")).toHaveLength(10);
  });

  it("状态开关仅发送status，失败不改变状态，内置管理员保持禁用", async () => {
    api.roles.list.mockResolvedValue([sysRole(1, "管理员"), sysRole(7)]);
    api.roles.listApis.mockResolvedValue(roleCatalog);
    api.roles.update.mockRejectedValueOnce(new Error("状态保存失败")).mockResolvedValueOnce({ ...sysRole(7), status: 0 });
    const wrapper = render(RoleView);
    await flushPromises();
    const switches = wrapper.findAllComponents(ElSwitch);
    expect(switches[1]!.props("disabled")).toBe(true);
    await switches[0]!.trigger("click");
    await flushPromises();
    expect(switches[0]!.props("modelValue")).toBe(true);
    expect(ElMessage.error).toHaveBeenCalledWith("状态保存失败");
    await switches[0]!.trigger("click");
    await flushPromises();
    expect(api.roles.update).toHaveBeenLastCalledWith(7, { status: 0 });
    expect(switches[0]!.props("modelValue")).toBe(false);
    expect(wrapper.get('[data-column="操作"]').findAll("button").slice(2).every((item) => item.attributes("disabled") !== undefined)).toBe(true);
  });

  it("只有新增没有修改授权能力时不能进入组合创建", async () => {
    session.permission.can.mockImplementation((...args: unknown[]) => args[1] !== "edit");
    const wrapper = render(RoleView);
    await flushPromises();
    expect(wrapper.findAll("button").find((item) => item.text() === "新增角色")?.attributes("disabled")).toBeDefined();
  });

  it.each([false, true])("修改自身角色刷新身份，失去角色页权限后跳转；请求失败=%s", async (failed) => {
    session.auth.user = { role_id: 7 };
    api.roles.listApis.mockResolvedValue(roleCatalog);
    const nextUser = { role_id: 7, apis: [1, 2] };
    if (failed) api.auth.getMe.mockRejectedValue(new Error("角色已停用"));
    else api.auth.getMe.mockResolvedValue(nextUser);
    const wrapper = render(RoleView);
    await flushPromises();
    wrapper.getComponent(RoleFormDialog).vm.$emit("saved", sysRole(7), false);
    await flushPromises();
    expect(api.auth.getMe).toHaveBeenCalledTimes(1);
    expect(session.router.replace).toHaveBeenCalledWith(failed ? "/login" : "/workbench");
    if (failed) expect(session.auth.reset).toHaveBeenCalled();
    else {
      expect(session.auth.applyUser).toHaveBeenCalledWith(nextUser);
      expect(session.permission.loadCatalog).toHaveBeenCalled();
      expect(session.permission.catalogAvailable).toBe(true);
      expect(session.permission.catalog).toEqual(roleCatalog);
    }
  });

  it("权限树只展示需要 RBAC 的接口，直接保存不扩展同组的部分勾选", async () => {
    api.roles.list.mockResolvedValue([role]);
    api.roles.listApis.mockResolvedValue([
      { id: 1, module: "web.rectify", action: "view", name: "列表", method: "GET", path: "/api/issues", sort: 1, is_jwt: true, is_rbac: true, role_code_supported: true, duty: { key: "rectify", label: "专项整改", role_name: "专项整改员", sort: 2 } },
      { id: 2, module: "web.rectify", action: "view", name: "详情", method: "GET", path: "/api/issues/:id", sort: 2, is_jwt: true, is_rbac: 1, role_code_supported: true, duty: { key: "rectify", label: "专项整改", role_name: "专项整改员", sort: 2 } },
      { id: 3, module: "web.auth", action: "view", name: "当前用户", method: "GET", path: "/api/me", sort: 3, is_jwt: true, is_rbac: false },
    ]);
    api.roles.getPermissions.mockResolvedValue({ api_ids: [1] });
    const wrapper = render(RoleView);
    await flushPromises();
    await click(wrapper, "修改");
    await flushPromises();
    const tree = wrapper.getComponent(PermissionMatrix);
    expect(tree.props("modelValue")).toEqual([1]);
    expect(tree.findAllComponents(ElCheckbox).find((item) => item.attributes("aria-label") === "专项整改：查")?.props("indeterminate")).toBe(true);
    expect(tree.text()).toContain("专项整改");
    expect(tree.text()).not.toContain("当前用户");
    await click(wrapper, "保存");
    await flushPromises();
    expect(api.roles.update).toHaveBeenCalledWith(role.id, { code: "street-admin", desc: "", api_ids: [1] });
    expect(api.roles.updatePermissions).not.toHaveBeenCalled();
  });

  it.each([
    ["组织", OrgView, api.orgs.list, [{ id: 1, parent_id: 0, type: "root", name: "测试组织", sort: 0 }], "刷新表格"],
    ["角色", RoleView, api.roles.list, [role], "刷新表格"],
    ["日志", OpLogView, api.opLogs.list, { list: [{ id: 1, username: "测试账号" }], total: 1 }, "刷新表格"],
  ] as const)("%s 刷新失败时清除旧表并显示可重试错误", async (_, component, request, response, refreshLabel) => {
    request.mockResolvedValueOnce(response);
    const wrapper = render(component);
    await flushPromises();
    expect(wrapper.getComponent(TableStub).props("data")).toHaveLength(1);
    request.mockRejectedValueOnce(new Error("刷新失败"));
    await click(wrapper, refreshLabel);
    await flushPromises();
    expect(wrapper.getComponent(TableStub).props("data")).toEqual([]);
    expect(wrapper.text()).toContain("刷新失败");
  });

  it("权限读取失败不能把旧勾选或空选择保存到角色", async () => {
    api.roles.list.mockResolvedValue([role]);
    api.roles.getPermissions.mockRejectedValueOnce(new Error("权限读取失败"));
    const wrapper = render(RoleView);
    await flushPromises();
    await click(wrapper, "修改");
    await flushPromises();
    expect(wrapper.text()).toContain("权限读取失败");
    const save = wrapper.findAll("button").find((button) => button.text() === "保存")!;
    expect(save.attributes("disabled")).toBeDefined();
    expect(api.roles.update).not.toHaveBeenCalled();
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
