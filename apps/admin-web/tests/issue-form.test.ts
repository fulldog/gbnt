import { ISSUE_TYPES } from "@gbnt/api-client";
import { describe, expect, it } from "vitest";
import { buildCreateInput, buildUpdateInput, createIssueDraft, draftNeedsRectify, hydrateIssueDraft, validateChecklist } from "@/views/issues/issue-form";
import { editorIssue } from "./fixtures/issue-editor";

describe("五类独立表单与编辑回填", () => {
  it("新表单保留未填写与数值零的区别，各类型字段隔离", () => {
    const form = createIssueDraft();
    expect(form.types.well.outlet_total).toBeUndefined();
    expect(form.types.well.checklist).toHaveLength(5);
    expect(form.types.road.checklist.map((q) => q.type)).toEqual(["has_shoulder", "has_ash", "has_road_damage"]);
    form.types.road.length = 1.5;
    form.type = "bridge"; form.types.bridge.length = 18;
    form.type = "road";
    expect(form.types.road.length).toBe(1.5);
    expect(form.types.bridge.length).toBe(18);
  });

  it.each(ISSUE_TYPES)("%s 完整回填，原值保存只携带乐观锁，不覆盖照片、历史或隐藏字段", (type) => {
    const issue = editorIssue(type);
    const before = JSON.stringify(issue);
    const form = hydrateIssueDraft(issue);
    expect(validateChecklist(form, issue)).toBeNull();
    expect(form.types[type].checklist[0]?.desc).toBe(issue.type_ext.checklist[0]?.desc);
    expect(form.types[type].checklist[0]?.photos).toEqual(issue.type_ext.checklist[0]?.photos);
    expect(buildUpdateInput(form, issue, issue.reporter_signature_file_id)).toEqual({ expected_updated_at: issue.updated_at });
    form.types[type].checklist[0]!.desc = "修改后的备注";
    const input = buildUpdateInput(form, issue, issue.reporter_signature_file_id);
    expect(input.type).toBe(type);
    expect(input.type_ext?.checklist[0]?.desc).toBe("修改后的备注");
    expect(input.type_ext?.keeper_phone).toBe("13900000001");
    expect(input).not.toHaveProperty("status");
    expect(input).not.toHaveProperty("reporter_signature_file_id");
    expect(JSON.stringify(issue)).toBe(before);
  });

  it("按题目标识匹配倒序清单，保留 false、0 与每题照片", () => {
    const issue = editorIssue("well"); issue.type_ext.checklist.reverse();
    const pipe = issue.type_ext.checklist.find((q) => q.type === "pipe_ok")!; pipe.value = false;
    const form = hydrateIssueDraft(issue);
    expect(form.types.well.checklist.find((q) => q.type === "pipe_ok")?.value).toBe(false);
    expect(form.types.well.outlet_damaged).toBe(0);
    expect(form.types.well.panorama_files).toEqual(["panorama-original"]);
  });

  it("切换类型仅提交当前类型，长度不转换或串用，旧类型字段不进入请求", () => {
    const form = hydrateIssueDraft(editorIssue("road"));
    Object.assign(form.types.bridge, hydrateIssueDraft(editorIssue("bridge")).types.bridge);
    form.type = "bridge";
    const input = buildCreateInput(form, "signature");
    expect(input).toMatchObject({ type: "bridge", type_ext: { kind: "culvert", length: 18, width: 5 } });
    expect(input.type_ext).not.toHaveProperty("thickness");
    expect(input.type_ext.checklist.map((q) => q.type)).toEqual(["needs_rectify"]);
  });

  it("道路观察题均为否也不判异常；道路损坏为是时要求说明、照片和日期", () => {
    const form = hydrateIssueDraft(editorIssue("road"));
    form.types.road.checklist.forEach((q) => { q.value = false; });
    expect(draftNeedsRectify(form)).toBe(false);
    expect(validateChecklist(form)).toBeNull();
    const damage = form.types.road.checklist[2]!; damage.value = true; damage.desc = "";
    expect(validateChecklist(form)).toContain("说明");
    damage.desc = "路面破损"; damage.files = [];
    expect(validateChecklist(form)).toContain("现场照片");
    damage.files = ["proof"];
    expect(validateChecklist(form)).toBe("请选择整改计划日期");
  });

  it("机井独立校验全景、两张出水取证照片和损坏数量", () => {
    const form = hydrateIssueDraft(editorIssue("well"));
    form.types.well.panorama_files = [];
    expect(validateChecklist(form)).toBe("请上传全景照片");
    form.types.well.panorama_files = ["panorama"];
    form.types.well.checklist[0]!.files = ["one", "one"];
    expect(validateChecklist(form)).toContain("2 张");
    form.types.well.checklist[0]!.files = ["one", "two"];
    form.types.well.outlet_damaged = 8;
    expect(validateChecklist(form)).toBe("出水口损坏数量不能大于总数");
  });

  it("旧道路不捏造新题答案，补填前保留旧契约与树木数量，补填后升级", () => {
    const issue = editorIssue("road"); if (issue.type !== "road") throw new Error();
    delete issue.type_ext.schema_version; issue.type_ext.tree_survive = 42;
    issue.type_ext.checklist = issue.type_ext.checklist.filter((q) => q.type !== "has_road_damage");
    const form = hydrateIssueDraft(issue);
    expect(form.types.road.checklist[2]?.value).toBeNull();
    form.types.road.length = 2.5;
    let input = buildUpdateInput(form, issue, "original-signature");
    expect(input.type_ext).toMatchObject({ schema_version: 1, tree_survive: 42, length: 2.5 });
    expect(input.type_ext?.checklist).toHaveLength(2);
    form.types.road.checklist[2]!.value = false; form.types.road.checklist[2]!.files = ["new-proof"];
    input = buildUpdateInput(form, issue, "original-signature");
    expect(input.type_ext).toMatchObject({ schema_version: 2, tree_survive: 42 });
    expect(input.type_ext?.checklist).toHaveLength(3);
  });

  it("修改上报姓名解除旧账号关联，签名不变时不重复上传", () => {
    const issue = editorIssue("forest"); const form = hydrateIssueDraft(issue);
    form.reporter_name = "李四";
    expect(buildUpdateInput(form, issue, "original-signature")).toEqual({ expected_updated_at: issue.updated_at, reporter_name: "李四", report_user_id: 0 });
  });

  it("只编辑整改日期也不能清空异常记录所需的日期", () => {
    const issue = editorIssue("well");
    if (issue.type !== "well") throw new Error("机井测试数据类型不符");
    issue.type_ext.outlet_damaged = 1; issue.plan_date = "2026-09-15";
    const form = hydrateIssueDraft(issue);
    form.types.well.plan_date = "";
    expect(validateChecklist(form, issue)).toBe("请选择整改计划日期");
    form.types.well.plan_date = "2026-09-20";
    expect(validateChecklist(form, issue)).toBeNull();
    expect(buildUpdateInput(form, issue, issue.reporter_signature_file_id)).toEqual({ expected_updated_at: issue.updated_at, plan_date: "2026-09-20" });
  });

  it("新增巡查固定不指派整改人", () => {
    const form = hydrateIssueDraft(editorIssue("road"));
    form.assignee_user = undefined;
    expect(buildCreateInput(form, "signature").assignee_user).toBe(0);
    form.types.road.checklist.find((q) => q.type === "has_road_damage")!.value = true;
    form.types.road.checklist.find((q) => q.type === "has_road_damage")!.desc = "损坏";
    form.types.road.checklist.find((q) => q.type === "has_road_damage")!.files = ["photo"];
    form.types.road.plan_date = "2026-10-01";
    form.assignee_user = 22;
    expect(buildCreateInput(form, "signature").assignee_user).toBe(0);
  });

  it("待整改记录禁止清空责任人，已完成记录允许显式解除指派", () => {
    const issue = editorIssue("road");
    issue.status = "pending";
    const form = hydrateIssueDraft(issue);
    form.assignee_user = undefined;
    expect(() => buildUpdateInput(form, issue, "original-signature")).toThrow("请指定整改人");
    form.assignee_user = 22;
    expect(buildUpdateInput(form, issue, "original-signature").assignee_user).toBe(22);
    issue.status = "done";
    form.assignee_user = undefined;
    expect(buildUpdateInput(form, issue, "original-signature").assignee_user).toBe(0);
  });
});
