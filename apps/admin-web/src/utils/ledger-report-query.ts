import type { LedgerAppliedQuery, LedgerSplitQuery } from "@/api/ledger-report-types";

/** 只校验日历日期；北京时间 SQL 边界由服务端构造。 */
function normalizeDate(value: string | undefined, label: string): string {
  if (value === undefined || value === "") return "";
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} 必须为有效日期`);
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} 必须为有效日期`);
  }
  return value;
}

/** 无效筛选必须失败，不静默扩大为全部查询。 */
export function normalizeLedgerQuery(query: LedgerSplitQuery): LedgerAppliedQuery {
  const streetId = query.street_org_id === undefined ? 0 : query.street_org_id;
  if (!Number.isSafeInteger(streetId) || streetId < 0) {
    throw new Error("street_org_id 必须为安全非负整数");
  }
  const from = normalizeDate(query.date_from, "date_from");
  const to = normalizeDate(query.date_to, "date_to");
  if (from && to && from > to) throw new Error("开始日期不能晚于结束日期");
  return { street_org_id: streetId, date_from: from, date_to: to };
}

/** 页面和导出只描述成功提交的筛选，不读取尚未查询的表单草稿。 */
export function ledgerDateNote(query: LedgerAppliedQuery): string {
  if (query.date_from && query.date_to) return `上报日期范围：${query.date_from} 至 ${query.date_to}。`;
  if (query.date_from) return `上报日期范围：${query.date_from} 起（含当日），无结束日期。`;
  if (query.date_to) return `上报日期范围：截至 ${query.date_to}（含当日），无开始日期。`;
  return "上报日期范围：全部日期。";
}

/** 文件名包含已提交的街道与上报日期范围，内容仍由当前完整表格导出。 */
export function ledgerExportName(label: string, query: LedgerAppliedQuery): string {
  const street = query.street_org_id ? `街道${query.street_org_id}` : "全部街道";
  const date = query.date_from || query.date_to
    ? `${query.date_from || "不限起日"}至${query.date_to || "不限止日"}` : "全部日期";
  return `${label}_${street}_${date}`;
}
