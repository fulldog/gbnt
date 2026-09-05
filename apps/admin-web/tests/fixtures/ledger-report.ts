import type { StreetLedgerReportRow, SurveyLedgerReportRow } from "@/api/ledger-report-types";

const location = {
  row_key: "2023:3",
  org_id: 3,
  org_name: "北城社区",
  street_org_id: 2,
  street_name: "北城街道",
  village_org_id: 3,
  village_name: "北城社区",
  natural_village: null,
  source_record_count: 7,
};

export function streetReportRow(overrides: Partial<StreetLedgerReportRow> = {}): StreetLedgerReportRow {
  return {
    ...location, project_year: 2023,
    well_handover: null, well_existing: null, bridge_handover: null, bridge_existing: null,
    road_km: 1.25, forest_handover: 10, forest_existing: 8, transformer_handover: null, transformer_existing: null,
    signer: null, phone: null, ...overrides,
  };
}

export function surveyReportRow(overrides: Partial<SurveyLedgerReportRow> = {}): SurveyLedgerReportRow {
  return {
    ...location, survey_done: null, well_inspected: null, well_normal: null,
    well_problem_count: 7, well_rectified_count: 5,
    bridge_inspected: null, bridge_problem_count: 0, bridge_rectified_count: 0,
    road_inspected: null, road_problem_count: 3, road_rectified_count: 2,
    contact_name: null, contact_phone: null, leader_sign: null, ...overrides,
  };
}
