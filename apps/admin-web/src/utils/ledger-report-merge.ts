import type {
  LedgerAppliedQuery, LedgerPart, StreetBaseRow, StreetLedgerReportRow,
  StreetStatisticsRow, SurveyBaseRow, SurveyLedgerReportRow, SurveyStatisticsRow,
} from "@/api/ledger-report-types";

interface KeyedRow { row_key: string }

function sameQuery(a: LedgerAppliedQuery, b: LedgerAppliedQuery): boolean {
  return a.street_org_id === b.street_org_id && a.date_from === b.date_from && a.date_to === b.date_to;
}

function indexRows<T extends KeyedRow>(rows: readonly T[]): Map<string, T> {
  const result = new Map<string, T>();
  for (const row of rows) {
    if (!row.row_key || result.has(row.row_key)) throw new Error("报表行键为空或重复");
    result.set(row.row_key, row);
  }
  return result;
}

/** 输入须先经过解码；本层只关联，不推算数值或把缺行补零。 */
export function mergeLedgerParts<B extends KeyedRow, S extends KeyedRow, R>(
  expectedQuery: LedgerAppliedQuery,
  base: LedgerPart<B>, statistics: LedgerPart<S>, compose: (base: B, statistics: S) => R,
): LedgerPart<R> {
  if (!sameQuery(expectedQuery, base.query) || !sameQuery(expectedQuery, statistics.query)) {
    throw new Error("报表筛选条件不一致，请重新查询");
  }
  const baseIndex = indexRows(base.rows);
  const statisticsIndex = indexRows(statistics.rows);
  if (baseIndex.size !== statisticsIndex.size || [...baseIndex.keys()].some((key) => !statisticsIndex.has(key))) {
    throw new Error("报表基础行与统计行不匹配，请重新查询");
  }
  return {
    query: { ...expectedQuery },
    // 完整校验键集合后才解引用，输出顺序由基础行决定。
    rows: base.rows.map((row) => compose(row, statisticsIndex.get(row.row_key)!)),
    notes: [...new Set([...base.notes, ...statistics.notes])],
  };
}

/** 显式分配字段所有权，额外字段不能覆盖另一供数方。 */
export function composeStreetRow(base: StreetBaseRow, statistics: StreetStatisticsRow): StreetLedgerReportRow {
  return {
    row_key: base.row_key, org_id: base.org_id, org_name: base.org_name,
    street_org_id: base.street_org_id, street_name: base.street_name,
    village_org_id: base.village_org_id, village_name: base.village_name,
    natural_village: base.natural_village, project_year: base.project_year,
    signer: base.signer, phone: base.phone,
    source_record_count: statistics.source_record_count,
    well_handover: statistics.well_handover, well_existing: statistics.well_existing,
    bridge_handover: statistics.bridge_handover, bridge_existing: statistics.bridge_existing,
    road_km: statistics.road_km,
    forest_handover: statistics.forest_handover, forest_existing: statistics.forest_existing,
    transformer_handover: statistics.transformer_handover, transformer_existing: statistics.transformer_existing,
  };
}

export function composeSurveyRow(base: SurveyBaseRow, statistics: SurveyStatisticsRow): SurveyLedgerReportRow {
  return {
    row_key: base.row_key, org_id: base.org_id, org_name: base.org_name,
    street_org_id: base.street_org_id, street_name: base.street_name,
    village_org_id: base.village_org_id, village_name: base.village_name,
    natural_village: base.natural_village,
    contact_name: base.contact_name, contact_phone: base.contact_phone, leader_sign: base.leader_sign,
    source_record_count: statistics.source_record_count,
    survey_done: statistics.survey_done, well_inspected: statistics.well_inspected, well_normal: statistics.well_normal,
    well_problem_count: statistics.well_problem_count, well_rectified_count: statistics.well_rectified_count,
    bridge_inspected: statistics.bridge_inspected, bridge_problem_count: statistics.bridge_problem_count,
    bridge_rectified_count: statistics.bridge_rectified_count,
    road_inspected: statistics.road_inspected, road_problem_count: statistics.road_problem_count,
    road_rectified_count: statistics.road_rectified_count,
  };
}
