import { ApiError } from "@gbnt/api-client";

export function errorMessage(error: unknown, fallback = "操作失败，请稍后重试"): string {
  if (error instanceof ApiError) {
    return error.traceId ? `${error.message}（Trace ID：${error.traceId}）` : error.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
