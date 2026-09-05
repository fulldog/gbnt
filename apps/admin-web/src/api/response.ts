import type { OrgOption, UserOption, UserOptionResult } from "./types";

export function responseRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label}响应格式异常，请刷新重试`);
  }
  return value as Record<string, unknown>;
}

export function responseArray(value: unknown, label: string, allowNull = false): unknown[] {
  // 仅兼容已确认的旧台账 null，不把其他结构错误误报为成功空数据。
  if (allowNull && value === null) return [];
  if (!Array.isArray(value)) throw new Error(`${label}列表格式异常，请刷新重试`);
  return value;
}

export function responseInteger(value: unknown, label: string, minimum = 0): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${label}格式异常，请刷新重试`);
  }
  return value;
}

export function checkDisplayFields(record: Record<string, unknown>, fields: readonly string[]): void {
  for (const key of fields) {
    if (record[key] !== undefined && record[key] !== null && typeof record[key] !== "string") {
      throw new Error("关联名称格式异常，请刷新重试");
    }
  }
}

export function normalizeOrgOptions(value: unknown): OrgOption[] {
  return responseArray(value, "组织候选").map((item) => {
    const row = responseRecord(item, "组织候选");
    responseInteger(row.id, "组织 ID", 1);
    responseInteger(row.parent_id, "上级组织 ID");
    if (typeof row.name !== "string" || typeof row.type !== "string" || !["root", "district", "street", "village"].includes(row.type)
      || typeof row.sort !== "number" || !Number.isSafeInteger(row.sort)) {
      throw new Error("组织候选格式异常，请刷新重试");
    }
    return row as unknown as OrgOption;
  });
}

function normalizeUserOption(value: unknown): UserOption {
  const row = responseRecord(value, "人员候选");
  responseInteger(row.id, "人员 ID", 1);
  if (typeof row.name !== "string" || typeof row.username !== "string") {
    throw new Error("人员候选格式异常，请刷新重试");
  }
  return { id: row.id as number, name: row.name, username: row.username };
}

export function normalizeUserOptions(value: unknown): UserOptionResult {
  const result = responseRecord(value, "人员候选");
  return {
    list: responseArray(result.list, "人员候选").map(normalizeUserOption),
    total: responseInteger(result.total, "人员总数"),
    page: responseInteger(result.page, "页码", 1),
    size: responseInteger(result.size, "每页数量", 1),
    selected: result.selected === null ? null : normalizeUserOption(result.selected),
  };
}
