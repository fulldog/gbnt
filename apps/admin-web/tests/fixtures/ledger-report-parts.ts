import type {
  LedgerAppliedQuery, LedgerPart, StreetBaseRow, StreetLedgerReportRow, StreetStatisticsRow,
  SurveyBaseRow, SurveyLedgerReportRow, SurveyStatisticsRow,
} from "@/api/ledger-report-types";

export const allLedgerQuery: LedgerAppliedQuery = { street_org_id: 0, date_from: "", date_to: "" };
export const goldenQuery: LedgerAppliedQuery = { street_org_id: 3, date_from: "2026-09-01", date_to: "2026-09-05" };
const goldenLocation = {
  org_id: 4, org_name: "测试新村", street_org_id: 3, street_name: "测试街道",
  village_org_id: 4, village_name: "测试新村", natural_village: null,
};

/** G1 人工预期：2023 年六条记录、2024 年一条记录；不是调用业务函数生成的 fixture。 */
export function goldenStreetParts(): { base: LedgerPart<StreetBaseRow>; statistics: LedgerPart<StreetStatisticsRow> } {
  return {
    base: { query: { ...goldenQuery }, notes: ["资料未采集"], rows: [
      { ...goldenLocation, row_key: "2023:4", project_year: 2023, signer: null, phone: null },
      { ...goldenLocation, row_key: "2024:4", project_year: 2024, signer: null, phone: null },
    ] },
    statistics: { query: { ...goldenQuery }, notes: ["按记录统计", "资料未采集"], rows: [
      { row_key: "2023:4", source_record_count: 6, road_km: 1.75, forest_handover: 100, forest_existing: 0,
        well_handover: null, well_existing: null, bridge_handover: null, bridge_existing: null,
        transformer_handover: null, transformer_existing: null },
      { row_key: "2024:4", source_record_count: 1, road_km: 2, forest_handover: null, forest_existing: null,
        well_handover: null, well_existing: null, bridge_handover: null, bridge_existing: null,
        transformer_handover: null, transformer_existing: null },
    ] },
  };
}

export function goldenSurveyParts(): { base: LedgerPart<SurveyBaseRow>; statistics: LedgerPart<SurveyStatisticsRow> } {
  return {
    base: { query: { ...goldenQuery }, notes: ["资料未采集"], rows: [
      { ...goldenLocation, row_key: "0:4", contact_name: null, contact_phone: null, leader_sign: null },
    ] },
    statistics: { query: { ...goldenQuery }, notes: ["按记录统计"], rows: [
      { row_key: "0:4", source_record_count: 7, survey_done: null, well_inspected: null, well_normal: null,
        well_problem_count: 2, well_rectified_count: 1, bridge_inspected: null, bridge_problem_count: 0,
        bridge_rectified_count: 0, road_inspected: null, road_problem_count: 0, road_rectified_count: 0 },
    ] },
  };
}

/** 页面回归辅助：从既有显示 fixture 拆出两份响应，不使用被测解码或合并函数。 */
export function streetParts(rows: StreetLedgerReportRow[], query = allLedgerQuery, notes: string[] = []) {
  const baseRows: StreetBaseRow[] = [];
  const statisticsRows: StreetStatisticsRow[] = [];
  for (const row of rows) {
    const { row_key, org_id, org_name, street_org_id, street_name, village_org_id, village_name, natural_village,
      project_year, signer, phone, ...metrics } = row;
    baseRows.push({ row_key, org_id, org_name, street_org_id, street_name, village_org_id, village_name, natural_village, project_year, signer, phone });
    statisticsRows.push({ row_key, ...metrics });
  }
  return { base: { query: { ...query }, rows: baseRows, notes: [...notes] }, statistics: { query: { ...query }, rows: statisticsRows, notes: [] } };
}

export function surveyParts(rows: SurveyLedgerReportRow[], query = allLedgerQuery, notes: string[] = []) {
  const baseRows: SurveyBaseRow[] = [];
  const statisticsRows: SurveyStatisticsRow[] = [];
  for (const row of rows) {
    const { row_key, org_id, org_name, street_org_id, street_name, village_org_id, village_name, natural_village,
      contact_name, contact_phone, leader_sign, ...metrics } = row;
    baseRows.push({ row_key, org_id, org_name, street_org_id, street_name, village_org_id, village_name, natural_village, contact_name, contact_phone, leader_sign });
    statisticsRows.push({ row_key, ...metrics });
  }
  return { base: { query: { ...query }, rows: baseRows, notes: [...notes] }, statistics: { query: { ...query }, rows: statisticsRows, notes: [] } };
}
