import { ApiError } from "@gbnt/api-client";

// 少量数据库诊断特征仅作误分类兜底；内部错误优先按 HTTP/业务状态判断。
const databaseDiagnostic = /\bSQLSTATE\b|\bError\s*\d+\s*\([0-9A-Z]{5}\)|\bUnknown\s+column\b|\bSQL\s+syntax\b/i;

/** 只转换用户提示，不修改原始错误及其 Trace ID，也不将请求失败转为成功。 */
export function errorMessage(error: unknown, fallback = "操作失败，请稍后重试"): string {
  if (error instanceof ApiError && (error.status >= 500 || (error.code !== null && error.code >= 500))) {
    return fallback;
  }
  if (!(error instanceof Error) || !error.message.trim() || databaseDiagnostic.test(error.message)) return fallback;
  return error instanceof ApiError && error.traceId ? `${error.message}（Trace ID：${error.traceId}）` : error.message;
}
