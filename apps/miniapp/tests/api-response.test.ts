import { describe, expect, it, vi } from "vitest";
import { createMiniappApiClient } from "@/api/client";
import { createTodosApi } from "@/api/todos";
import { createIssuesApi } from "@/api/issues";
import { createMineApi } from "@/api/mine";
import { createAuthApi } from "@/api/auth";
import { parseAuthUser, parseIssue, parseIssuePage, parseMineIssuePage, parseMineStats, parseRegions } from "@/api/response";
import { issueTypeInfoRows } from "@/utils/issue-display";

function rawIssue(): Record<string, any> {
  return {
    id: 11, issue_key: "I-11", code: null, type: "road", project_year: 2023,
    org_id: 2, report_user_id: 3, assignee_user: 4, status: "pending",
    lat: null, lng: null, rectify_records: null, rectify_round: 1,
    type_ext: { checklist: [
      { type: "has_shoulder", value: false, mustImg: true, files: null, photos: null },
      { type: "has_ash", value: true, mustImg: false, files: [], photos: [] },
    ] },
  };
}

const user = { id: 1, org_id: 2, role_id: 3, username: "tester", is_super_admin: false, apis: [] };

describe("miniapp business response normalization", () => {
  it("fills optional display fields but never invents coordinates or facility measurements", () => {
    const result = parseIssue(rawIssue());
    expect(result.code).toBe("");
    expect(result.report_user_name).toBeNull();
    expect(result.org_path).toBeNull();
    expect(result.lat).toBeNull();
    expect(result.rectify_records).toEqual([]);
    expect(result.type_ext.checklist[0].photos).toEqual([]);
    expect(issueTypeInfoRows(result).find((row) => row.label === "长度")?.value).toBe("未填写");
  });

  it("preserves real display values and success warning", () => {
    const result = parseIssue({ ...rawIssue(), report_user_name: "张三", org_path: "甲街道 / 乙村", display_warning: "操作已成功，请刷新" });
    expect(result.report_user_name).toBe("张三");
    expect(result.org_path).toBe("甲街道 / 乙村");
    expect(result.display_warning).toBe("操作已成功，请刷新");
  });

  it.each([
    { id: 0 }, { id: "11" }, { status: "completed" }, { type: "unknown" },
    { type_ext: {} }, { type_ext: { checklist: null } }, { rectify_records: {} },
    { report_user_id: "3" }, { rectify_round: -1 }, { rectify_round: null }, { rectify_round: 1.5 }, { report_user_name: {} },
  ])("rejects malformed critical fields: %j", (patch) => {
    expect(() => parseIssue({ ...rawIssue(), ...patch })).toThrow("接口数据异常");
  });

  it("rejects missing, duplicate and non-boolean questions instead of treating them as normal", () => {
    const row = rawIssue();
    row.type_ext.checklist = [row.type_ext.checklist[0]];
    expect(() => parseIssue(row)).toThrow("题目缺失");
    row.type_ext.checklist.push(row.type_ext.checklist[0]);
    expect(() => parseIssue(row)).toThrow("题目类型");
    const invalid = rawIssue();
    invalid.type_ext.checklist[0].value = "false";
    expect(() => parseIssue(invalid)).toThrow("巡查答案");
  });

  it("rejects malformed optional numbers rather than showing them as unset", () => {
    const row = rawIssue();
    row.type_ext.length = "one";
    expect(() => parseIssue(row)).toThrow("length");
  });

  it("accepts only an explicitly empty list paired with zero total", () => {
    expect(parseIssuePage({ list: null, total: 0, page: 1, size: 20 }).list).toEqual([]);
    expect(() => parseIssuePage({ total: 0, page: 1, size: 20 })).toThrow("列表缺失");
    expect(() => parseIssuePage({ list: null, total: 1, page: 1, size: 20 })).toThrow("问题列表");
    expect(() => parseIssuePage({ list: [], total: 1, page: 1, size: 20 })).toThrow("分页条数");
  });

  it.each([{ total: -1 }, { total: "1" }, { page: 0 }, { size: 0 }, { total: Infinity }])("rejects invalid page metadata: %j", (patch) => {
    expect(() => parseIssuePage({ list: [], total: 0, page: 1, size: 20, ...patch })).toThrow("接口数据异常");
  });

  it("rejects duplicated rows and mismatched mine scopes", () => {
    expect(() => parseIssuePage({ list: [rawIssue(), rawIssue()], total: 2, page: 1, size: 20 })).toThrow("重复问题");
    expect(() => parseMineIssuePage({ scope: "done", list: [], total: 0, page: 1, size: 20 }, "pending")).toThrow("分类不一致");
  });

  it("keeps actual zero statistics but rejects missing and non-finite counts", () => {
    expect(parseMineStats({ reported: 0, pending: 0, done: 0 })).toEqual({ reported: 0, pending: 0, done: 0 });
    expect(() => parseMineStats({ reported: 0, pending: 0 })).toThrow("已整改数量");
    expect(() => parseMineStats({ reported: 1, pending: NaN, done: 0 })).toThrow("待整改数量");
  });

  it("normalizes optional user names while rejecting incomplete session identities", () => {
    expect(parseAuthUser(user)).toMatchObject({ name: "", org_name: null, org_path: null, role_name: null });
    expect(() => parseAuthUser({ id: 1 })).toThrow("接口数据异常");
    expect(parseAuthUser({ ...user, apis: null }).apis).toEqual([]);
  });

  it("normalizes leaf children but rejects malformed or repeated regions", () => {
    const region = { id: 2, name: "甲村", type: "village", parent_id: 1, sort: 0, children: null };
    expect(parseRegions({ list: [region] }).list[0].children).toEqual([]);
    expect(() => parseRegions({})).toThrow("列表缺失");
    expect(() => parseRegions({ list: [region, region] })).toThrow("重复组织");
    expect(() => parseRegions({ list: [{ ...region, children: {} }] })).toThrow("子组织");
  });
});

function clientFor(data: unknown, status = 200, code = 0) {
  const request = vi.fn((options) => options.success({ statusCode: status, data: { code, data, message: status === 200 ? "" : "数据库不可用", cost_ms: 1, trace_id: "trace-test" } }));
  return { client: createMiniappApiClient({ baseUrl: "https://api.example.test", request }), request };
}

describe("formal miniapp API methods validate actual transport results", () => {
  it("validates todo envelope data and preserves query filters", async () => {
    const { client, request } = clientFor({ list: [rawIssue()], total: 1, page: 1, size: 20 });
    const result = await createTodosApi(client).list({ status: "pending", page: 1 });
    expect(result.list[0].type_ext.checklist).toHaveLength(2);
    expect(request.mock.calls[0][0].url).toContain("status=pending");
  });

  it("applies normalization to issue create/read/rectify/reopen methods", async () => {
    const { client } = clientFor(rawIssue());
    const api = createIssuesApi(client);
    expect((await api.get(11)).report_user_name).toBeNull();
    expect((await api.create({} as never)).report_user_name).toBeNull();
    expect((await api.rectify(11, { rectify_list: [] })).rectify_round).toBe(1);
    expect((await api.reRectify(11)).rectify_round).toBe(1);
  });

  it("sends the displayed rectification round with the formal request", async () => {
    const { client, request } = clientFor(rawIssue());
    await createIssuesApi(client).rectify(11, { rectify_list: [], expected_round: 1 });
    expect(request.mock.calls[0][0]).toMatchObject({
      method: "POST",
      data: { rectify_list: [], expected_round: 1 },
    });
    expect(request.mock.calls[0][0].url).toContain("/api/app/issues/11/rectify");
  });

  it("does not swallow HTTP failures or malformed statistics", async () => {
    const failing = clientFor(null, 500, 500);
    await expect(createMineApi(failing.client).getStats()).rejects.toMatchObject({ status: 500, traceId: "trace-test" });
    await expect(createMineApi(clientFor({}).client).getStats()).rejects.toThrow("接口数据异常");
  });

  it("validates login and me identity before returning it to the session store", async () => {
    const { client } = clientFor({ token: "test-token", expires_at: "2099-01-01T00:00:00Z", user });
    expect((await createAuthApi(client).login({ username: "tester", password: "fixture" })).user.org_name).toBeNull();
    await expect(createAuthApi(clientFor({ id: 1 }).client).getMe()).rejects.toThrow("接口数据异常");
  });

  it("rejects malformed slider results before the UI considers verification successful", async () => {
    await expect(createAuthApi(clientFor({ slider_id: "", expire_seconds: 60 }).client).startSlider()).rejects.toThrow("滑动会话");
    await expect(createAuthApi(clientFor({ pass_token: null, expire_seconds: 60 }).client).finishSlider({ slider_id: "fixture", duration_ms: 500 })).rejects.toThrow("验证凭证");
  });
});
