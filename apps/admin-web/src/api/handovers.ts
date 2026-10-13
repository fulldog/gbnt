import type { ApiClient } from "@gbnt/api-client";
import { responseArray, responseInteger, responseRecord } from "./response";

/** 组织移交数量。数量 0 表示已录入 0，与未录入不同。 */
export interface HandoverRecord {
  id: number;
  org_id: number;
  org_name: string | null;
  project_year: number;
  well_handover: number;
  bridge_handover: number;
  road_handover: number;
  forest_handover: number;
  transformer_handover: number;
  remark: string;
}

export interface HandoverListQuery {
  org_id?: number;
  project_year?: number;
  page?: number;
  size?: number;
}

export interface HandoverListResult {
  list: HandoverRecord[];
  total: number;
  page: number;
  size: number;
}

export interface HandoverInput {
  org_id: number;
  project_year: number;
  well_handover: number;
  bridge_handover: number;
  road_handover: number;
  forest_handover: number;
  transformer_handover: number;
  remark?: string;
}

function responseText(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label}格式异常，请刷新重试`);
  return value;
}

function normalizeHandover(value: unknown): HandoverRecord {
  const row = responseRecord(value, "移交数量");
  return {
    id: responseInteger(row.id, "移交数量 ID", 1),
    org_id: responseInteger(row.org_id, "组织 ID", 1),
    org_name: row.org_name === null ? null : responseText(row.org_name, "组织名称"),
    project_year: responseInteger(row.project_year, "建设年份", 2020),
    well_handover: responseInteger(row.well_handover, "机井移交数量"),
    bridge_handover: responseInteger(row.bridge_handover, "桥涵闸移交数量"),
    road_handover: responseInteger(row.road_handover, "道路移交数量"),
    forest_handover: responseInteger(row.forest_handover, "林网移交株数"),
    transformer_handover: responseInteger(row.transformer_handover, "变压器移交数量"),
    remark: responseText(row.remark, "备注"),
  };
}

function normalizeHandoverList(value: unknown): HandoverListResult {
  const result = responseRecord(value, "移交数量列表");
  return {
    list: responseArray(result.list, "移交数量").map(normalizeHandover),
    total: responseInteger(result.total, "移交数量总数"),
    page: responseInteger(result.page, "页码", 1),
    size: responseInteger(result.size, "每页数量", 1),
  };
}

/** 创建移交数量管理接口。读写都按登录人可见组织范围校验。 */
export function createHandoversApi(client: ApiClient) {
  return {
    list(query: HandoverListQuery = {}): Promise<HandoverListResult> {
      return client.request<unknown>("/api/ledger/handovers", { query: { ...query } }).then(normalizeHandoverList);
    },
    create(input: HandoverInput): Promise<HandoverRecord> {
      return client.request<unknown, HandoverInput>("/api/ledger/handovers", { method: "POST", body: input }).then(normalizeHandover);
    },
    update(id: number, input: HandoverInput): Promise<HandoverRecord> {
      return client.request<unknown, HandoverInput>(`/api/ledger/handovers/${id}`, { method: "PUT", body: input }).then(normalizeHandover);
    },
    remove(id: number): Promise<null> {
      return client.request<null>(`/api/ledger/handovers/${id}`, { method: "DELETE" });
    },
  } as const;
}
