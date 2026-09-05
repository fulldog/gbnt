import {
  ApiError, createApiClient, handleApiResponse, handleRawResponse,
} from "@gbnt/api-client";
import type { ApiLifecycleHooks, ApiTransport, TransportResponse } from "@gbnt/api-client";
import { describe, expect, it, vi } from "vitest";
import { createAxiosTransport } from "@/api/transport";
import type { AxiosInstance } from "axios";

function response(status: number, data: unknown, headers: Record<string, string> = {}): TransportResponse<unknown> {
  return { status, data, headers };
}

function captureError(run: () => unknown): ApiError {
  try { run(); }
  catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    return error as ApiError;
  }
  throw new Error("预期失败却返回了成功结果");
}

describe("共享请求核心：HTTP、信封与生命周期", () => {
  it.each([
    [401, "未登录或凭证无效"], [403, "无权限访问该接口"],
    [404, "接口不存在，请检查请求路径或后端版本"],
    [502, "服务网关异常，请稍后重试"], [503, "服务暂不可用，请稍后重试"],
    [504, "服务响应超时，请稍后重试"], [418, "HTTP 418"],
  ])("非信封 HTTP %i 显示状态信息，不回显原始页面", (status, message) => {
    const error = captureError(() => handleApiResponse(response(status, "<html>upstream detail</html>", { "x-ReQuEsT-iD": "header-trace" })));
    expect(error).toMatchObject({ status, message, code: null, traceId: "header-trace" });
    expect(error.message).not.toContain("html");
    expect(error.message).not.toContain("统一接口格式");
  });

  it("合法信封优先保留后端业务消息、code 和 Trace ID", () => {
    const error = captureError(() => handleApiResponse(response(404,
      { code: 404, data: null, message: "该条台账已删除", cost_ms: 1, trace_id: "body-trace" },
      { "X-Request-Id": "header-trace" })));
    expect(error).toMatchObject({ status: 404, code: 404, message: "该条台账已删除", traceId: "body-trace" });
  });

  it.each([undefined, null, "", 123])("无有效 body trace 时从响应头兜底：%j", (traceId) => {
    const error = captureError(() => handleApiResponse(response(500,
      { code: 500, data: null, message: "查询失败", trace_id: traceId },
      { "X-Request-Id": "header-trace" })));
    expect(error.traceId).toBe("header-trace");
  });

  it("无后端错误消息才使用 HTTP 分类", () => {
    const error = captureError(() => handleApiResponse(response(503, { code: 503, message: "", data: null })));
    expect(error.message).toBe("服务暂不可用，请稍后重试");
    expect(error.code).toBe(503);
  });

  it.each(["<!doctype html>", null, [], { rows: [] }, { code: "0", message: "ok" }])("2xx 非信封仍是格式错误：%j", (data) => {
    const onUnauthorized = vi.fn();
    const error = captureError(() => handleApiResponse(response(200, data, { "X-Request-Id": "bad-format" }), { onUnauthorized }));
    expect(error).toMatchObject({ status: 200, message: "服务端响应不符合统一接口格式", traceId: "bad-format" });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("HTTP 成功仍识别业务失败，不返回 data", () => {
    const error = captureError(() => handleApiResponse(response(200, { code: 409, message: "版本冲突", data: { rows: [] }, trace_id: "conflict" })));
    expect(error).toMatchObject({ status: 200, code: 409, message: "版本冲突", traceId: "conflict" });
  });

  it.each([
    response(401, "Unauthorized"),
    response(401, { code: 401, message: "凭证过期", data: null }),
    response(200, { code: 401, message: "请重新登录", data: null }),
    response(403, { code: 401, message: "凭证无效", data: null }),
  ])("HTTP 或业务 401 触发一次鉴权失效钩子", (value) => {
    const onUnauthorized = vi.fn();
    const error = captureError(() => handleApiResponse(value, { onUnauthorized }));
    expect(onUnauthorized).toHaveBeenCalledExactlyOnceWith({
      status: error.status, code: error.code, message: error.message, traceId: error.traceId,
    });
  });

  it.each([
    response(200, { code: 0, data: [], message: "ok" }),
    response(404, "404 page not found"),
    response(200, "broken response"),
    response(200, { code: 401, data: null, message: "登录失效" }),
  ])("所有响应分支只处理一次续期，且先续期再通知鉴权失效", (value) => {
    const events: string[] = [];
    const onTokenRenewed = vi.fn(() => { events.push("renew"); });
    const hooks: ApiLifecycleHooks = { onTokenRenewed, onUnauthorized: () => { events.push("unauthorized"); } };
    const renewed = { ...value, headers: { "x-nEw-tOkEn": "renewed-token", "X-TOKEN-EXPIRES-AT": "1800000000" } };
    if (value.status === 200 && typeof value.data === "object" && value.data && "code" in value.data && value.data.code === 0) {
      handleApiResponse(renewed, hooks);
    } else captureError(() => handleApiResponse(renewed, hooks));
    expect(onTokenRenewed).toHaveBeenCalledExactlyOnceWith("renewed-token", "1800000000");
    expect(events[0]).toBe("renew");
    expect(events).toHaveLength(typeof value.data === "object" && value.data && "code" in value.data && value.data.code === 401 ? 2 : 1);
  });

  it("成功报表保留 null、0 和数组，不加工业务字段", () => {
    const data = { rows: [{ well_existing: null, well_problem_count: 0 }] };
    expect(handleApiResponse(response(200, { code: 0, message: "ok", data }))).toBe(data);
  });

  it.each([200, 206])("raw HTTP %i 下载保持原始体及完整响应", (status) => {
    const blob = new Blob(["report"], { type: "application/xml" });
    const value = response(status, blob, { "X-New-Token": "raw-token" });
    const onTokenRenewed = vi.fn();
    expect(handleRawResponse(value, { onTokenRenewed })).toBe(value);
    expect(value.data).toBe(blob);
    expect(onTokenRenewed).toHaveBeenCalledExactlyOnceWith("raw-token", null);
  });

  it("raw 错误使用同一分类及 401 钩子", () => {
    const onUnauthorized = vi.fn();
    const error = captureError(() => handleRawResponse(response(401, "denied", { "X-Request-Id": "raw-trace" }), { onUnauthorized }));
    expect(error).toMatchObject({ message: "未登录或凭证无效", traceId: "raw-trace" });
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it("网络故障保持 status 0，不伪装成 HTTP 或报表空数据", async () => {
    const cause = new Error("offline");
    const transport: ApiTransport = { request: vi.fn().mockRejectedValue(cause) };
    const client = createApiClient({ baseUrl: "", transport });
    await expect(client.request("/api/ledger/street/rows")).rejects.toMatchObject({ status: 0, message: "网络请求失败", cause });
  });

  it("Axios 不提前拒绝非 2xx，原始状态送到共享核心", async () => {
    const request = vi.fn().mockResolvedValue({ status: 404, data: "404 page not found", headers: { "x-request-id": "axios-trace" } });
    const { transport } = createAxiosTransport({ instance: { request } as unknown as AxiosInstance });
    const client = createApiClient({ baseUrl: "", transport });
    await expect(client.request("/api/ledger/street/rows")).rejects.toMatchObject({ status: 404, traceId: "axios-trace", message: "接口不存在，请检查请求路径或后端版本" });
    expect(request.mock.calls[0]![0].validateStatus(404)).toBe(true);
  });
});
