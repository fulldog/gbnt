/** 正式报表只使用服务端已采集字段；null 表示未采集/无法可靠判定，不等于 0。 */
export interface LedgerReportLocation {
  row_key: string;
  org_id: number;
  org_name: string | null;
  street_org_id: number | null;
  street_name: string | null;
  village_org_id: number | null;
  village_name: string | null;
  natural_village: null;
  source_record_count: number;
}

export interface StreetLedgerReportRow extends LedgerReportLocation {
  project_year: number | null;
  well_handover: null;
  well_existing: null;
  bridge_handover: null;
  bridge_existing: null;
  road_km: number | null;
  forest_handover: number | null;
  forest_existing: number | null;
  transformer_handover: null;
  transformer_existing: null;
  signer: null;
  phone: null;
}

export interface SurveyLedgerReportRow extends LedgerReportLocation {
  survey_done: null;
  well_inspected: null;
  well_normal: null;
  well_problem_count: number | null;
  well_rectified_count: number | null;
  bridge_inspected: null;
  bridge_problem_count: number | null;
  bridge_rectified_count: number | null;
  road_inspected: null;
  road_problem_count: number | null;
  road_rectified_count: number | null;
  contact_name: null;
  contact_phone: null;
  leader_sign: null;
}

export interface StreetLedgerReportResult {
  street_org_id: number;
  rows: StreetLedgerReportRow[];
  notes: string[];
}

export interface SurveyLedgerReportResult {
  street_org_id: number;
  rows: SurveyLedgerReportRow[];
  notes: string[];
}

/** 四个拆分报表接口共用查询；undefined 表示未指定，不能传 null。 */
export interface LedgerSplitQuery {
  street_org_id?: number;
  date_from?: string;
  date_to?: string;
}

/** 服务端实际应用的规范筛选；日期为北京时间自然日。 */
export interface LedgerAppliedQuery {
  street_org_id: number;
  date_from: string;
  date_to: string;
}

export interface LedgerPart<T> {
  query: LedgerAppliedQuery;
  rows: T[];
  notes: string[];
}

export type LedgerBaseLocation = Omit<LedgerReportLocation, "source_record_count">;
export type StreetBaseRow = LedgerBaseLocation & Pick<StreetLedgerReportRow, "project_year" | "signer" | "phone">;
export type SurveyBaseRow = LedgerBaseLocation & Pick<SurveyLedgerReportRow, "contact_name" | "contact_phone" | "leader_sign">;

export type StreetStatisticsRow = Pick<StreetLedgerReportRow,
  "row_key" | "source_record_count" | "well_handover" | "well_existing"
  | "bridge_handover" | "bridge_existing" | "road_km" | "forest_handover"
  | "forest_existing" | "transformer_handover" | "transformer_existing">;
export type SurveyStatisticsRow = Pick<SurveyLedgerReportRow,
  "row_key" | "source_record_count" | "survey_done" | "well_inspected" | "well_normal"
  | "well_problem_count" | "well_rectified_count" | "bridge_inspected"
  | "bridge_problem_count" | "bridge_rectified_count" | "road_inspected"
  | "road_problem_count" | "road_rectified_count">;
