import type { ApiClient, ApiRequestOptions, AdminCreateIssueInput } from "@gbnt/api-client";
import { describe, expect, it, vi } from "vitest";
import { createIssuesApi } from "@/api/issues";
import { createLedgerApi } from "@/api/ledger";
import { createUsersApi } from "@/api/users";

function setup(value: unknown) {
  const request = vi.fn<(path: string, options?: ApiRequestOptions) => Promise<unknown>>().mockResolvedValue(value);
  const client: ApiClient = { request: request as ApiClient["request"], raw: vi.fn() };
  return { request, issues: createIssuesApi(client), ledger: createLedgerApi(client), users: createUsersApi(client) };
}

const counts = { type: "well", total: 2, pending: 1, done: 1 };
const issue = {
  id: 10, issue_key: "issue-readable", type: "well", report_user_id: 3, assignee_user: 4, org_id: 7,
  rectify_round: 0,
  report_user_name: "上报人", assignee_user_name: "整改人", org_name: "社区", org_path: "街道 / 社区",
  type_ext: { checklist: [{ type: "transformer_ok", photos: [{ file_id: "photo", url: "/uploads/photo" }] }] },
  reporter_signature: { file_id: "signature", url: "/uploads/signature" }, rectify_records: [],
};

describe("管理端台账 API 边界", () => {
  it("只将旧服务 rows:null 兼容为空数组，两张表均适用", async () => {
    const { ledger } = setup({ rows: null, street_org_id: 3 });
    expect(await ledger.getStreet()).toEqual({ rows: [], street_org_id: 3 });
    expect(await ledger.getSurvey()).toEqual({ rows: [], street_org_id: 3 });
  });

  it("保留聚合数字及管理端组织展示字段", async () => {
    const row = { ...counts, org_id: 7, org_name: "社区", org_path: "街道 / 社区" };
    const { ledger, request } = setup({ rows: [row], street_org_id: 3 });
    expect(await ledger.getStreet({ street_org_id: 3, date_from: "2026-09-01" })).toEqual({ rows: [row], street_org_id: 3 });
    expect(request).toHaveBeenCalledWith("/api/ledger/street", { query: { street_org_id: 3, date_from: "2026-09-01" } });
  });

  it.each([
    { street_org_id: 0 },
    { rows: {}, street_org_id: 0 },
    { rows: [{ ...counts, total: "2" }], street_org_id: 0 },
    { rows: [{ ...counts, done: -1 }], street_org_id: 0 },
    { rows: [{ ...counts, type: "unknown" }], street_org_id: 0 },
    { rows: [], street_org_id: "0" },
  ])("错误格式不得吞成成功空数据：%j", async (value) => {
    await expect(setup(value).ledger.getSurvey()).rejects.toThrow("格式异常");
  });

  it("服务端错误保持原错误，不被格式归一遮盖", async () => {
    const { ledger, request } = setup(null);
    const failure = new Error("无权限访问该接口");
    request.mockRejectedValue(failure);
    await expect(ledger.getStreet()).rejects.toBe(failure);
  });
});

describe("管理端独立读取契约", () => {
  it("按原 query 分页并 trim 关键字，保留复杂基础 Issue 字段", async () => {
    const result = { list: [issue], total: 1, page: 2, size: 20 };
    const { issues, request } = setup(result);
    expect(await issues.list({ keyword: " issue-readable ", page: 2, size: 20 })).toEqual(result);
    expect(request).toHaveBeenCalledWith("/api/issues", { query: { keyword: "issue-readable", page: 2, size: 20 } });
  });

  it("详情读取名称但写入仍使用原接口和基础契约", async () => {
    const { issues, request } = setup(issue);
    expect(await issues.get(10)).toEqual(issue);
    const input = { type: "well", report_user_id: 3 } as AdminCreateIssueInput;
    await issues.create(input);
    expect(request).toHaveBeenLastCalledWith("/api/issues", { method: "POST", body: input });
  });

  it("兼容旧详情无名称字段及新详情关联缺失，拒绝异常名称类型", async () => {
    expect(await setup({ id: 1 }).issues.get(1)).toEqual({ id: 1, rectify_round: 0 });
    expect(await setup({ id: 1, org_path: null }).issues.get(1)).toEqual({ id: 1, org_path: null, rectify_round: 0 });
    await expect(setup({ id: 1, org_path: [] }).issues.get(1)).rejects.toThrow("关联名称格式异常");
  });

  it("读取人员名称并兼容旧人员列表没有 page/size", async () => {
    const row = { id: 2, org_name: null, org_path: null, role_name: "操作员" };
    const { users } = setup({ list: [row], total: 1 });
    expect(await users.list({ page: 2, size: 10 })).toEqual({ list: [row], total: 1, page: 2, size: 10 });
  });

  it("分页列表结构及计数错误显式失败", async () => {
    await expect(setup({ list: [], total: "0", page: 1, size: 20 }).issues.list()).rejects.toThrow("格式异常");
    await expect(setup({ list: null, total: 0 }).users.list()).rejects.toThrow("列表格式异常");
  });

  it.each(["page", "size"])("人员分页 %s:null 是异常值而不是旧服务缺失字段", async (key) => {
    await expect(setup({ list: [], total: 0, page: 1, size: 20, [key]: null }).users.list()).rejects.toThrow("格式异常");
  });
});

describe("业务候选接口", () => {
  it("分别使用业务所属路由，不调用系统组织接口", async () => {
    const orgs = [{ id: 3, name: "街道", parent_id: 2, type: "street", sort: 1 }];
    const { request, issues, ledger } = setup(orgs);
    expect(await issues.listOrgOptions()).toEqual(orgs);
    await ledger.listStreetOrgOptions();
    await ledger.listSurveyOrgOptions();
    expect(request.mock.calls.map(([path]) => path)).toEqual([
      "/api/issues/options/orgs", "/api/ledger/street/options/orgs", "/api/ledger/survey/options/orgs",
    ]);
  });

  it("人员分页携带 selected_id，回显不混入分页列表", async () => {
    const selected = { id: 1001, name: "旧人员", username: "older" };
    const result = { list: [{ id: 2, name: "新人", username: "newer", phone: "不得使用" }], total: 2000, page: 1, size: 20, selected };
    const { request, issues } = setup(result);
    expect(await issues.listReporterOptions({ org_id: 3, keyword: " 新 ", selected_id: 1001 })).toEqual({
      ...result, list: [{ id: 2, name: "新人", username: "newer" }],
    });
    expect(request).toHaveBeenLastCalledWith("/api/issues/options/reporters", {
      query: { org_id: 3, keyword: "新", selected_id: 1001 },
    });
    await issues.listAssigneeOptions(10, { page: 2, size: 20 });
    expect(request).toHaveBeenLastCalledWith("/api/issues/10/assignee-options", { query: { page: 2, size: 20, keyword: undefined } });
  });

  it("空候选有明确selected:null，接口缺失selected不假装可提交", async () => {
    const empty = { list: [], total: 0, page: 1, size: 20, selected: null };
    expect(await setup(empty).issues.listAssigneeOptions(10)).toEqual(empty);
    await expect(setup({ list: [], total: 0, page: 1, size: 20 }).issues.listAssigneeOptions(10)).rejects.toThrow("格式异常");
  });
});
