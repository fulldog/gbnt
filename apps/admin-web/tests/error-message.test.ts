import { ApiError } from "@gbnt/api-client";
import { describe, expect, it } from "vitest";
import { errorMessage } from "@/utils/error";

const databaseMessage = "Error 1054 (42S22): Unknown column 'r.round' in 'field list'";
const fallback = "整改趋势暂时无法加载，请稍后重试";

describe("管理端错误展示边界", () => {
  it("MySQL 1054 不直接展示数据库字段或 Trace ID，原对象完整保留", () => {
    const cause = new Error("原始调用失败");
    const error = new ApiError(databaseMessage, { status: 500, code: 500, traceId: "server-trace-1054", cause });
    const original = Object.getOwnPropertyDescriptors(error);
    expect(errorMessage(error, fallback)).toBe(fallback);
    expect(errorMessage(error, fallback)).not.toMatch(/SQL|1054|r\.round|Trace|server-trace/);
    expect(Object.getOwnPropertyDescriptors(error)).toEqual(original);
    expect(error.cause).toBe(cause);
    expect(error.message).toBe(databaseMessage);
    expect(error).toMatchObject({ status: 500, code: 500, traceId: "server-trace-1054" });
  });

  it.each([
    { status: 500, code: null },
    { status: 502, code: null },
    { status: 503, code: 0 },
    { status: 504, code: 400 },
    { status: 200, code: 500 },
    { status: 400, code: 500 },
  ])("内部错误即使没有 SQL 特征也使用上下文提示：%j", (options) => {
    const error = new ApiError("内部诊断细节", { ...options, traceId: "internal-trace" });
    expect(errorMessage(error, fallback)).toBe(fallback);
  });

  it.each([
    databaseMessage,
    "SQLSTATE[42S22]: Column not found: 1054",
    "Error1064 (42000): internal database failure",
    "Unknown column 'private_field'",
    "You have an error in your SQL syntax",
  ])("数据库诊断即使误归类为 400 或普通 Error 也不泄露：%s", (message) => {
    expect(errorMessage(new ApiError(message, { status: 400, code: 400 }), fallback)).toBe(fallback);
    expect(errorMessage(new Error(message), fallback)).toBe(fallback);
  });

  it.each([
    [401, "登录已过期，请重新登录"],
    [403, "没有访问该页面的权限"],
    [409, "该记录已被其他人更新，请刷新后重试"],
    [422, "结束日期不能早于开始日期"],
  ])("保留 %s 正常业务提示及既有 Trace 展示行为", (code, message) => {
    for (const status of [code, 200]) {
      const error = new ApiError(message, { status, code, traceId: "private-trace" });
      expect(errorMessage(error, fallback)).toBe(`${message}（Trace ID：private-trace）`);
      expect(error.traceId).toBe("private-trace");
    }
  });

  it.each(["请输入完整的整改说明", "开始日期不能晚于结束日期", "网络连接失败，请检查网络", "Network Error", "timeout of 30000ms exceeded"])("保留常规本地校验和网络提示：%s", (message) => {
    expect(errorMessage(new Error(message), fallback)).toBe(message);
    expect(errorMessage(new ApiError(message, { status: 0 }), fallback)).toBe(message);
  });

  it.each([undefined, null, {}, "原始字符串错误", new Error(""), new Error("  "), new ApiError("", { status: 400, traceId: "private-trace" })])("没有可展示消息时使用 fallback：%j", (error) => {
    expect(errorMessage(error, fallback)).toBe(fallback);
    expect(errorMessage(error)).toBe("操作失败，请稍后重试");
  });
});
