import { describe, expect, it } from "vitest";
import { composeStreetRow, composeSurveyRow, mergeLedgerParts } from "@/utils/ledger-report-merge";
import { normalizeStreetRowsPart, normalizeStreetStatisticsPart, normalizeSurveyRowsPart, normalizeSurveyStatisticsPart } from "@/api/ledger-report-response";
import { goldenQuery, goldenStreetParts, goldenSurveyParts } from "./fixtures/ledger-report-parts";

describe("报表分拆关联", () => {
  it("G1 人工预期：台账两年两行，排查跨年一行；空值与零不混淆", () => {
    const street = goldenStreetParts();
    const survey = goldenSurveyParts();
    const streetResult = mergeLedgerParts(goldenQuery, normalizeStreetRowsPart(street.base),
      normalizeStreetStatisticsPart({ ...street.statistics, rows: [...street.statistics.rows].reverse() }), composeStreetRow);
    const surveyResult = mergeLedgerParts(goldenQuery, normalizeSurveyRowsPart(survey.base), normalizeSurveyStatisticsPart(survey.statistics), composeSurveyRow);
    expect(streetResult.rows.map((row) => [row.row_key, row.source_record_count, row.road_km, row.forest_handover, row.forest_existing]))
      .toEqual([["2023:4", 6, 1.75, 100, 0], ["2024:4", 1, 2, null, null]]);
    expect(surveyResult.rows.map((row) => [row.row_key, row.source_record_count, row.well_problem_count, row.well_rectified_count,
      row.bridge_problem_count, row.bridge_rectified_count, row.road_problem_count, row.road_rectified_count]))
      .toEqual([["0:4", 7, 2, 1, 0, 0, 0, 0]]);
    expect(streetResult.rows[0]!.well_existing).toBeNull();
    expect(surveyResult.rows[0]!.well_inspected).toBeNull();
    expect(streetResult.notes).toEqual(["资料未采集", "按记录统计"]);
    expect(street.statistics.rows.map((row) => row.row_key)).toEqual(["2023:4", "2024:4"]);
  });

  it("额外字段不能夺取另一部分的供数权", () => {
    const street = goldenStreetParts();
    const row = composeStreetRow({ ...street.base.rows[0]!, source_record_count: 999 } as typeof street.base.rows[number],
      { ...street.statistics.rows[0]!, org_name: "伪造", project_year: 2030 } as typeof street.statistics.rows[number]);
    expect(row.source_record_count).toBe(6);
    expect(row.org_name).toBe("测试新村");
    expect(row.project_year).toBe(2023);
    const survey = goldenSurveyParts();
    const surveyRow = composeSurveyRow({ ...survey.base.rows[0]!, source_record_count: 999 } as typeof survey.base.rows[number],
      { ...survey.statistics.rows[0]!, contact_name: "伪造" } as typeof survey.statistics.rows[number]);
    expect(surveyRow.source_record_count).toBe(7);
    expect(surveyRow.contact_name).toBeNull();
  });

  it.each(["缺行", "额外行", "等量错键", "仅基础为空", "仅统计为空"])("%s 必须失败而不是补零", (kind) => {
    const { base, statistics } = goldenStreetParts();
    if (kind === "缺行") statistics.rows.pop();
    if (kind === "额外行") statistics.rows.push({ ...statistics.rows[0]!, row_key: "2025:4" });
    if (kind === "等量错键") statistics.rows[1]!.row_key = "2025:4";
    if (kind === "仅基础为空") base.rows = [];
    if (kind === "仅统计为空") statistics.rows = [];
    expect(() => mergeLedgerParts(goldenQuery, base, statistics, composeStreetRow)).toThrow("不匹配");
  });

  it.each(["基础重复", "统计重复", "基础空键", "统计空键"])("%s 不允许 Map 覆盖", (kind) => {
    const { base, statistics } = goldenStreetParts();
    const rows = kind.startsWith("基础") ? base.rows : statistics.rows;
    rows[1]!.row_key = kind.endsWith("重复") ? rows[0]!.row_key : "";
    expect(() => mergeLedgerParts(goldenQuery, base, statistics, composeStreetRow)).toThrow("为空或重复");
  });

  it.each(["street_org_id", "date_from", "date_to"] as const)("两份响应的 %s 都必须等于本轮请求", (key) => {
    for (const part of ["base", "statistics"] as const) {
      const parts = goldenStreetParts();
      parts[part].query = { ...goldenQuery, [key]: key === "street_org_id" ? 99 : "2026-01-01" };
      expect(() => mergeLedgerParts(goldenQuery, parts.base, parts.statistics, composeStreetRow)).toThrow("筛选条件不一致");
    }
  });

  it("两空合法，复制 query 并合并去重口径", () => {
    const empty = { query: goldenQuery, rows: [], notes: ["无记录"] };
    const result = mergeLedgerParts(goldenQuery, empty, empty, composeStreetRow);
    expect(result).toEqual({ query: goldenQuery, rows: [], notes: ["无记录"] });
    expect(result.query).not.toBe(goldenQuery);
  });
});
