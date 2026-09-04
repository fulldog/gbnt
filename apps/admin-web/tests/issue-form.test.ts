import { describe, expect, it } from "vitest";
import {
  buildCreateInput,
  createChecklist,
  createIssueDraft,
  draftNeedsRectify,
  validateChecklist,
} from "@/views/issues/issue-form";

function answerChecklistWithoutIssues(type: Parameters<typeof createChecklist>[0]) {
  return createChecklist(type).map((item) => ({
    ...item,
    value: item.negative ? false : true,
    files: item.mustImg ? [`${item.type}-file`] : [],
  }));
}

describe("专项整改新建表单", () => {
  it("使用后端默认类型和最新可选年度", () => {
    const draft = createIssueDraft(9);
    expect(draft.type).toBe("well");
    expect(draft.project_year).toBe(2023);
    expect(draft.report_user_id).toBe(9);
    expect(draft.checklist).toHaveLength(6);
  });

  it("按 mustImg、问题说明和数量关系执行前置校验", () => {
    const draft = createIssueDraft(9);
    expect(validateChecklist(draft)).toBe("请选择“机井是否出水”");

    draft.checklist = answerChecklistWithoutIssues("well");
    draft.outlet_total = 1;
    draft.outlet_damaged = 2;
    expect(validateChecklist(draft)).toBe("出水口损坏数量不能大于总数");

    draft.outlet_damaged = 0;
    draft.checklist[0]!.value = false;
    expect(validateChecklist(draft)).toBe("请填写“机井是否出水”的说明");

    draft.checklist[0]!.desc = "现场无出水";
    expect(validateChecklist(draft)).toBe("请选择计划整改完成日期");
  });

  it("与后端一致地将机井损坏数量判定为需整改", () => {
    const draft = createIssueDraft(9);
    draft.outlet_total = 2;
    draft.outlet_damaged = 1;
    draft.checklist = answerChecklistWithoutIssues("well");

    expect(draftNeedsRectify(draft)).toBe(true);
  });

  it("构造与后端判别联合一致的道路创建参数", () => {
    const draft = createIssueDraft(9);
    draft.type = "road";
    draft.project_year = 2022;
    draft.org_id = 12;
    draft.code = " RD-01 ";
    draft.address = " 一组北侧 ";
    draft.report_user_id = 9;
    draft.length = 120;
    draft.width = 4;
    draft.thickness = 0.2;
    draft.tree_survive = 18;
    draft.keeper_name = " 张三 ";
    draft.keeper_phone = " 13800000000 ";
    draft.checklist = answerChecklistWithoutIssues("road");

    expect(draftNeedsRectify(draft)).toBe(false);
    expect(validateChecklist(draft)).toBeNull();
    expect(buildCreateInput(draft, "signature-file")).toEqual({
      type: "road",
      project_year: 2022,
      org_id: 12,
      code: "RD-01",
      address: "一组北侧",
      lat: undefined,
      lng: undefined,
      plan_date: "",
      reporter_signature_file_id: "signature-file",
      report_user_id: 9,
      type_ext: {
        length: 120,
        width: 4,
        thickness: 0.2,
        checklist: [
          { type: "has_shoulder", value: true, desc: "", mustImg: false, files: [] },
          { type: "has_ash", value: true, desc: "", mustImg: false, files: [] },
        ],
        tree_survive: 18,
        keeper_name: "张三",
        keeper_phone: "13800000000",
      },
    });
  });
});
