import { describe, expect, it } from "vitest";
import {
  createReportForm,
  hasReportProgress,
  replaceIssueType,
  type ReportFormState,
} from "@/domain/issues/form";
import { buildCreateIssueInput } from "@/domain/issues/mapper";
import {
  reportNeedsRectify,
  validateBasicStep,
  validateQuizStep,
  validateSubmitStep,
} from "@/domain/issues/validation";

function photo(fileId: string, capturedAt?: number) {
  return { fileId, url: `/uploads/${fileId}.jpg`, capturedAt };
}

function validWellForm(): ReportFormState {
  const form = createReportForm();
  form.orgId = 12;
  form.orgLabel = "开发区 / 街道 / 村";
  form.address = "示例现场地址";
  form.lat = 36.45;
  form.lng = 116.02;
  form.details.outletTotal = "2";
  form.details.outletDamaged = "0";
  form.details.casingTotal = "1";
  form.details.casingDamaged = "0";
  const capturedAt = Date.now() - 61_000;
  for (const quiz of form.quizzes) {
    quiz.value = true;
    if (quiz.type === "water_out") {
      quiz.photos = [photo("water-1", capturedAt), photo("water-2", Date.now())];
    }
  }
  form.signatureFileId = "signature-1";
  return form;
}

describe("巡查上报领域规则", () => {
  it("空白表单不生成恢复草稿，实际填写后才视为有进度", () => {
    const form = createReportForm();
    expect(hasReportProgress(form)).toBe(false);

    form.address = "测试地址";
    expect(hasReportProgress(form)).toBe(true);
  });

  it("按当前后端 6 项机井契约生成 payload", () => {
    const form = validWellForm();

    const payload = buildCreateIssueInput(form);

    expect(payload.type).toBe("well");
    expect(payload.type_ext.checklist).toHaveLength(6);
    expect(payload.type_ext.checklist.at(-1)?.type).toBe("transformer_ok");
    expect(payload.reporter_signature_file_id).toBe("signature-1");
    expect(payload.plan_date).toBeUndefined();
  });

  it("正向题选择否时要求说明、照片和计划日期", () => {
    const form = validWellForm();
    const pipe = form.quizzes.find((item) => item.type === "pipe_ok");
    expect(pipe).toBeDefined();
    pipe!.value = false;

    expect(reportNeedsRectify(form)).toBe(true);
    expect(validateQuizStep(form)).toContain("请填写“管道是否按要求连接”的问题说明");

    pipe!.desc = "现场管道未连接";
    pipe!.photos = [photo("pipe-1")];
    expect(validateSubmitStep(form)).toContain("存在待整改问题时必须选择计划完成日期");

    form.planDate = "2026-09-10";
    expect(validateSubmitStep(form)).toEqual([]);
  });

  it("机井出水两张照片不足 60 秒时拒绝进入下一步", () => {
    const form = validWellForm();
    const water = form.quizzes.find((item) => item.type === "water_out")!;
    water.photos = [photo("water-1", 1_000), photo("water-2", 40_000)];

    expect(validateQuizStep(form)).toContain(
      "机井出水第二张照片须在第一张拍摄至少 60 秒后获取",
    );
  });

  it("道路字段严格保留后端 tree_survive", () => {
    const form = validWellForm();
    replaceIssueType(form, "road");
    form.details.length = "1.2";
    form.details.width = "4";
    form.details.thickness = "0.2";
    form.details.treeSurvive = "30";
    for (const quiz of form.quizzes) {
      quiz.value = true;
    }
    form.signatureFileId = "signature-road";

    expect(validateBasicStep(form)).toEqual([]);
    const payload = buildCreateIssueInput(form);
    if (payload.type !== "road") {
      throw new Error("道路上报应生成 road payload");
    }
    expect(payload.type_ext.tree_survive).toBe(30);
    expect(payload.type_ext.checklist.map((item) => item.type)).toEqual([
      "has_shoulder",
      "has_ash",
    ]);
  });

  it("反向题选择是时判定需要整改", () => {
    const form = validWellForm();
    replaceIssueType(form, "forest");
    form.details.handoverCount = "100";
    form.details.existingCount = "95";
    form.details.surviveRate = "95";
    for (const quiz of form.quizzes) {
      quiz.value = false;
    }
    const pest = form.quizzes.find((item) => item.type === "pest")!;
    pest.value = true;
    pest.desc = "发现病虫害";
    pest.photos = [photo("pest-1")];

    expect(reportNeedsRectify(form)).toBe(true);
  });

  it("数量损坏即使没有异常题也按后端规则进入待整改", () => {
    const form = validWellForm();
    form.details.outletDamaged = "1";

    expect(reportNeedsRectify(form)).toBe(true);
  });
});
