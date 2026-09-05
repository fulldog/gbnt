import type {
  LedgerAppliedQuery, LedgerBaseLocation, LedgerPart, LedgerReportLocation,
  StreetBaseRow, StreetLedgerReportResult, StreetLedgerReportRow, StreetStatisticsRow,
  SurveyBaseRow, SurveyLedgerReportResult, SurveyLedgerReportRow, SurveyStatisticsRow,
} from "./ledger-report-types";
import { responseArray, responseInteger, responseRecord } from "./response";
import { normalizeLedgerQuery } from "@/utils/ledger-report-query";

function nullableNumber(value: unknown, label: string, integer = false): number | null {
  if (value === null) return null;
  if (integer) return responseInteger(value, label);
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`${label}格式异常，请刷新重试`);
  return value;
}

function nullableText(value: unknown, label: string): string | null {
  if (value === null || typeof value === "string") return value;
  throw new Error(`${label}格式异常，请刷新重试`);
}

function requireUncollected(row: Record<string, unknown>, fields: string[]): void {
  // 当前契约尚无这些字段的采集来源；缺字段或塞入虚构数值都不能静默变成 0。
  for (const field of fields) {
    if (row[field] !== null) throw new Error(`报表未采集字段 ${field} 格式异常，请刷新重试`);
  }
}

function rowKey(row: Record<string, unknown>): string {
  if (typeof row.row_key !== "string" || !row.row_key) throw new Error("报表行标识格式异常，请刷新重试");
  return row.row_key;
}

function normalizeBaseLocation(row: Record<string, unknown>): LedgerBaseLocation {
  requireUncollected(row, ["natural_village"]);
  return {
    row_key: rowKey(row),
    org_id: responseInteger(row.org_id, "落点组织 ID"),
    org_name: nullableText(row.org_name, "落点组织"),
    street_org_id: nullableNumber(row.street_org_id, "街道 ID", true),
    street_name: nullableText(row.street_name, "街道名称"),
    village_org_id: nullableNumber(row.village_org_id, "村级组织 ID", true),
    village_name: nullableText(row.village_name, "村级组织名称"),
    natural_village: null,
  };
}

function normalizeLocation(row: Record<string, unknown>): LedgerReportLocation {
  return { ...normalizeBaseLocation(row), source_record_count: responseInteger(row.source_record_count, "来源记录数") };
}

function normalizeMetadata(value: unknown) {
  const result = responseRecord(value, "报表");
  return {
    street_org_id: responseInteger(result.street_org_id, "筛选街道 ID"),
    rows: responseArray(result.rows, "报表"),
    notes: responseArray(result.notes, "报表口径说明").map((note) => {
      if (typeof note !== "string") throw new Error("报表口径说明格式异常，请刷新重试");
      return note;
    }),
  };
}

export function normalizeStreetReport(value: unknown): StreetLedgerReportResult {
  const result = normalizeMetadata(value);
  return { ...result, rows: result.rows.map((value): StreetLedgerReportRow => {
    const row = responseRecord(value, "街道台账报表行");
    requireUncollected(row, ["well_handover", "well_existing", "bridge_handover", "bridge_existing", "transformer_handover", "transformer_existing", "signer", "phone"]);
    return {
      ...normalizeLocation(row),
      project_year: nullableNumber(row.project_year, "项目年度", true),
      well_handover: null, well_existing: null, bridge_handover: null, bridge_existing: null,
      road_km: nullableNumber(row.road_km, "道路千米数"),
      forest_handover: nullableNumber(row.forest_handover, "林网移交株数"),
      forest_existing: nullableNumber(row.forest_existing, "林网现有株数"),
      transformer_handover: null, transformer_existing: null, signer: null, phone: null,
    };
  }) };
}

export function normalizeSurveyReport(value: unknown): SurveyLedgerReportResult {
  const result = normalizeMetadata(value);
  return { ...result, rows: result.rows.map((value): SurveyLedgerReportRow => {
    const row = responseRecord(value, "排查汇总报表行");
    requireUncollected(row, ["survey_done", "well_inspected", "well_normal", "bridge_inspected", "road_inspected", "contact_name", "contact_phone", "leader_sign"]);
    const counts: Record<string, number | null> = {};
    for (const type of ["well", "bridge", "road"]) {
      const problem = nullableNumber(row[`${type}_problem_count`], "异常记录数", true);
      const rectified = nullableNumber(row[`${type}_rectified_count`], "已整改记录数", true);
      if ((problem === null) !== (rectified === null) || (problem !== null && rectified !== null && rectified > problem)) {
        throw new Error("排查整改计数关系格式异常，请刷新重试");
      }
      counts[`${type}_problem_count`] = problem;
      counts[`${type}_rectified_count`] = rectified;
    }
    return {
      ...normalizeLocation(row),
      survey_done: null, well_inspected: null, well_normal: null,
      well_problem_count: counts.well_problem_count!, well_rectified_count: counts.well_rectified_count!,
      bridge_inspected: null, bridge_problem_count: counts.bridge_problem_count!, bridge_rectified_count: counts.bridge_rectified_count!,
      road_inspected: null, road_problem_count: counts.road_problem_count!, road_rectified_count: counts.road_rectified_count!,
      contact_name: null, contact_phone: null, leader_sign: null,
    };
  }) };
}

/** 返回 query 不接受缺键或字符串 ID，不能把缺少的回显值当请求默认值。 */
function normalizeAppliedQuery(value: unknown): LedgerAppliedQuery {
  const query = responseRecord(value, "报表筛选条件");
  const street = responseInteger(query.street_org_id, "筛选街道 ID");
  if (typeof query.date_from !== "string" || typeof query.date_to !== "string") {
    throw new Error("报表筛选日期格式异常，请刷新重试");
  }
  return normalizeLedgerQuery({ street_org_id: street, date_from: query.date_from, date_to: query.date_to });
}

function normalizePart<T>(value: unknown, decodeRow: (row: Record<string, unknown>) => T): LedgerPart<T> {
  const result = responseRecord(value, "报表");
  return {
    query: normalizeAppliedQuery(result.query),
    rows: responseArray(result.rows, "报表").map((row) => decodeRow(responseRecord(row, "报表行"))),
    notes: responseArray(result.notes, "报表口径说明").map((note) => {
      if (typeof note !== "string") throw new Error("报表口径说明格式异常，请刷新重试");
      return note;
    }),
  };
}

export function normalizeStreetRowsPart(value: unknown): LedgerPart<StreetBaseRow> {
  return normalizePart(value, (row) => {
    requireUncollected(row, ["signer", "phone"]);
    return {
      ...normalizeBaseLocation(row),
      project_year: row.project_year === null ? null : responseInteger(row.project_year, "项目年度", 1),
      signer: null, phone: null,
    };
  });
}

export function normalizeSurveyRowsPart(value: unknown): LedgerPart<SurveyBaseRow> {
  return normalizePart(value, (row) => {
    requireUncollected(row, ["contact_name", "contact_phone", "leader_sign"]);
    return { ...normalizeBaseLocation(row), contact_name: null, contact_phone: null, leader_sign: null };
  });
}

export function normalizeStreetStatisticsPart(value: unknown): LedgerPart<StreetStatisticsRow> {
  return normalizePart(value, (row) => {
    requireUncollected(row, ["well_handover", "well_existing", "bridge_handover", "bridge_existing", "transformer_handover", "transformer_existing"]);
    return {
      row_key: rowKey(row), source_record_count: responseInteger(row.source_record_count, "来源记录数"),
      well_handover: null, well_existing: null, bridge_handover: null, bridge_existing: null,
      road_km: nullableNumber(row.road_km, "道路千米数"),
      forest_handover: nullableNumber(row.forest_handover, "林网移交株数"),
      forest_existing: nullableNumber(row.forest_existing, "林网现有株数"),
      transformer_handover: null, transformer_existing: null,
    };
  });
}

function normalizeCountPair(row: Record<string, unknown>, type: "well" | "bridge" | "road") {
  const problem = nullableNumber(row[`${type}_problem_count`], "异常记录数", true);
  const rectified = nullableNumber(row[`${type}_rectified_count`], "已整改记录数", true);
  if ((problem === null) !== (rectified === null) || (problem !== null && rectified !== null && rectified > problem)) {
    throw new Error("排查整改计数关系格式异常，请刷新重试");
  }
  return { problem, rectified };
}

export function normalizeSurveyStatisticsPart(value: unknown): LedgerPart<SurveyStatisticsRow> {
  return normalizePart(value, (row) => {
    requireUncollected(row, ["survey_done", "well_inspected", "well_normal", "bridge_inspected", "road_inspected"]);
    const well = normalizeCountPair(row, "well");
    const bridge = normalizeCountPair(row, "bridge");
    const road = normalizeCountPair(row, "road");
    return {
      row_key: rowKey(row), source_record_count: responseInteger(row.source_record_count, "来源记录数"),
      survey_done: null, well_inspected: null, well_normal: null,
      well_problem_count: well.problem, well_rectified_count: well.rectified,
      bridge_inspected: null, bridge_problem_count: bridge.problem, bridge_rectified_count: bridge.rectified,
      road_inspected: null, road_problem_count: road.problem, road_rectified_count: road.rectified,
    };
  });
}
