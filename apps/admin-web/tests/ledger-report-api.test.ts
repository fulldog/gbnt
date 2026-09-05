import type { ApiClient, ApiRequestOptions } from "@gbnt/api-client";
import { describe, expect, it, vi } from "vitest";
import { createLedgerApi } from "@/api/ledger";
import { allLedgerQuery, goldenStreetParts, goldenSurveyParts } from "./fixtures/ledger-report-parts";

const location = {
  row_key: "2023:4", org_id: 4, org_name: "新村", street_org_id: 3, street_name: "街道",
  village_org_id: 4, village_name: "新村", natural_village: null, source_record_count: 4,
};
const streetRow = {
  ...location, project_year: 2023, well_handover: null, well_existing: null, bridge_handover: null, bridge_existing: null,
  road_km: 1.75, forest_handover: 100, forest_existing: 0, transformer_handover: null, transformer_existing: null, signer: null, phone: null,
};
const surveyRow = {
  ...location, survey_done: null, well_inspected: null, well_normal: null, well_problem_count: 2, well_rectified_count: 1,
  bridge_inspected: null, bridge_problem_count: 0, bridge_rectified_count: 0, road_inspected: null,
  road_problem_count: null, road_rectified_count: null, contact_name: null, contact_phone: null, leader_sign: null,
};
function setup(value: unknown) {
  const request = vi.fn<(path: string, options?: ApiRequestOptions) => Promise<unknown>>().mockResolvedValue(value);
  const client: ApiClient = { request: request as ApiClient["request"], raw: vi.fn() };
  return { request, ledger: createLedgerApi(client) };
}

describe("只读正式报表 API", () => {
  it("分别请求专用报表并完整保留 null、0、统计口径和筛选", async () => {
    const street = { street_org_id: 3, rows: [streetRow], notes: ["按上报记录统计，不是资产总数"] };
    const survey = { street_org_id: 3, rows: [surveyRow], notes: ["当前保存的排查清单口径"] };
    const { request, ledger } = setup(street);
    const query = { street_org_id: 3, date_from: "2026-09-01", date_to: "2026-09-05" };
    expect(await ledger.getStreetReport(query)).toEqual(street);
    expect(request).toHaveBeenLastCalledWith("/api/ledger/street/report", { query });
    request.mockResolvedValue(survey);
    expect(await ledger.getSurveyReport(query)).toEqual(survey);
    expect(request).toHaveBeenLastCalledWith("/api/ledger/survey/report", { query });
  });

  it("空结果是空报表，不假回退到旧普通汇总", async () => {
    const value = { street_org_id: 0, rows: [], notes: ["未采集字段为 —"] };
    const { ledger } = setup(value);
    expect(await ledger.getStreetReport()).toEqual(value);
    expect(await ledger.getSurveyReport()).toEqual(value);
  });

  it.each([
    { ...streetRow, road_km: "2" }, { ...streetRow, road_km: -1 },
    { ...streetRow, forest_existing: undefined }, { ...streetRow, source_record_count: 1.5 },
    { ...streetRow, natural_village: "凭地址猜测" }, { ...streetRow, well_existing: 4 },
    { ...streetRow, row_key: "" }, { ...streetRow, street_name: 5 },
  ])("坏字段不得伪装成 0 或成功：%j", async (row) => {
    await expect(setup({ street_org_id: 0, rows: [row], notes: [] }).ledger.getStreetReport()).rejects.toThrow("格式异常");
  });

  it.each([
    { ...surveyRow, well_rectified_count: 3 }, { ...surveyRow, road_rectified_count: 0 },
    { ...surveyRow, well_inspected: 3 }, { ...surveyRow, survey_done: true },
    { ...surveyRow, contact_name: "随便任选上报人" },
  ])("拒绝矛盾计数和无来源的推导：%j", async (row) => {
    await expect(setup({ street_org_id: 0, rows: [row], notes: [] }).ledger.getSurveyReport()).rejects.toThrow("格式异常");
  });

  it.each([{ street_org_id: 0, rows: null, notes: [] }, { street_org_id: 0, rows: [], notes: null }, { street_org_id: 0, rows: [], notes: [1] }])("新报表契约不兼容旧空值：%j", async (value) => {
    await expect(setup(value).ledger.getStreetReport()).rejects.toThrow("格式异常");
  });

  it("权限或服务端错误原样抛出，不降级为旧汇总", async () => {
    const { request, ledger } = setup(null);
    const failure = new Error("报表查询失败"); request.mockRejectedValue(failure);
    await expect(ledger.getSurveyReport()).rejects.toBe(failure);
    expect(request).toHaveBeenCalledTimes(1);
  });
});

const splitCases = [
  ["getStreetRows", "/api/ledger/street/rows", () => goldenStreetParts().base],
  ["getStreetStatistics", "/api/ledger/street/statistics", () => goldenStreetParts().statistics],
  ["getSurveyRows", "/api/ledger/survey/rows", () => goldenSurveyParts().base],
  ["getSurveyStatistics", "/api/ledger/survey/statistics", () => goldenSurveyParts().statistics],
] as const;

describe("四个拆分报表 GET 契约", () => {
  it.each(splitCases)("%s 使用对应 GET 路径、规范参数并保留数值/null", async (method, path, fixture) => {
    const value = fixture();
    const { request, ledger } = setup(value);
    expect(await ledger[method](value.query)).toEqual(value);
    expect(request).toHaveBeenLastCalledWith(path, { query: value.query });
    request.mockResolvedValue({ query: allLedgerQuery, rows: [], notes: [] });
    expect(await ledger[method]()).toEqual({ query: allLedgerQuery, rows: [], notes: [] });
    expect(request).toHaveBeenLastCalledWith(path, { query: allLedgerQuery });
    expect(request.mock.calls.every(([, options]) => !options?.method || options.method === "GET")).toBe(true);
  });

  it.each(splitCases)("%s 的每个既定字段均必填，缺失不能降级 null/0", async (method, _, fixture) => {
    const value = fixture();
    for (const key of Object.keys(value.rows[0]!)) {
      const row: Record<string, unknown> = { ...value.rows[0] };
      delete row[key];
      await expect(setup({ ...value, rows: [row] }).ledger[method](), `缺字段 ${key}`).rejects.toThrow();
    }
    for (const key of ["street_org_id", "date_from", "date_to"] as const) {
      const query: Record<string, unknown> = { ...value.query };
      delete query[key];
      await expect(setup({ ...value, query }).ledger[method](), `缺 query.${key}`).rejects.toThrow();
    }
  });

  it.each(splitCases)("%s 只保留其拥有的字段，不透传其他部分或未知字段", async (method, _, fixture) => {
    const value = fixture();
    const extra = method.endsWith("Rows")
      ? { source_record_count: 999, road_km: 999, well_problem_count: 999 }
      : { org_name: "覆盖名称", street_org_id: 999, project_year: 999 };
    const incoming = { ...value, surprise: true, query: { ...value.query, extra: "忽略" },
      rows: value.rows.map((row) => ({ ...row, surprise: true, ...extra })) };
    expect(await setup(incoming).ledger[method]()).toEqual(value);
  });

  it.each(splitCases)("%s 拒绝坏元数据和筛选回显", async (method, _, fixture) => {
    const value = fixture();
    for (const change of [
      { rows: null }, { notes: null }, { notes: [1] }, { query: null },
      { query: { ...value.query, street_org_id: "3" } },
      { query: { ...value.query, street_org_id: Number.MAX_SAFE_INTEGER + 1 } },
      { query: { ...value.query, date_from: "2026-02-30" } },
      { query: { ...value.query, date_to: "2025-09-01" } },
    ]) await expect(setup({ ...value, ...change }).ledger[method]()).rejects.toThrow();
  });

  it.each(splitCases)("%s 请求失败不回退、参数错误不发请求", async (method, path) => {
    const { ledger, request } = setup(null);
    await expect(ledger[method]({ street_org_id: -1 })).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
    const failure = new Error("拒绝访问");
    request.mockRejectedValue(failure);
    await expect(ledger[method]()).rejects.toBe(failure);
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0]![0]).toBe(path);
  });

  it.each(["2", -1, Infinity, NaN, undefined])("台账指标拒绝异常数字 %s", async (road_km) => {
    const value = goldenStreetParts().statistics;
    await expect(setup({ ...value, rows: [{ ...value.rows[0], road_km }] }).ledger.getStreetStatistics()).rejects.toThrow();
  });

  it("安全整数及固定 null、问题整改关系不能放宽", async () => {
    const street = goldenStreetParts();
    for (const change of [{ org_id: Number.MAX_SAFE_INTEGER + 1 }, { project_year: 0 }, { natural_village: "猜测村" }, { signer: "任取上报人" }]) {
      await expect(setup({ ...street.base, rows: [{ ...street.base.rows[0], ...change }] }).ledger.getStreetRows()).rejects.toThrow();
    }
    for (const change of [{ source_record_count: "6" }, { source_record_count: Number.MAX_SAFE_INTEGER + 1 }, { well_existing: 0 }]) {
      await expect(setup({ ...street.statistics, rows: [{ ...street.statistics.rows[0], ...change }] }).ledger.getStreetStatistics()).rejects.toThrow();
    }
    const survey = goldenSurveyParts();
    for (const change of [{ well_rectified_count: 3 }, { well_problem_count: null }, { well_problem_count: NaN }, { survey_done: true }, { well_inspected: 0 }]) {
      await expect(setup({ ...survey.statistics, rows: [{ ...survey.statistics.rows[0], ...change }] }).ledger.getSurveyStatistics()).rejects.toThrow();
    }
  });
});
