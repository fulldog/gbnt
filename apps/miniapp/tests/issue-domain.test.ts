import { describe, expect, it } from "vitest";
import {
  createReportForm,
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
  return { fileId, url: `/uploads/${fileId}.jpg`, capturedAt, source: "camera" as const };
}

function validWellForm(): ReportFormState {
  const form = createReportForm();
  form.projectYear = 2023;
  form.orgId = 12;
  form.orgLabel = "开发区 / 街道 / 村";
  form.code = "01号";
  form.address = "示例现场地址";
  form.lat = 36.45;
  form.lng = 116.02;
  form.details.outletTotal = "2";
  form.details.outletDamaged = "0";
  form.details.casingTotal = "1";
  form.details.casingDamaged = "0";
  form.panoramaPhotos = [photo("panorama")];
  const capturedAt = Date.now() - 61_000;
  for (const quiz of form.quizzes) {
    quiz.value = true;
    if (quiz.type === "water_out") {
      quiz.photos = [photo("water-1", capturedAt), photo("water-2", Date.now())];
    } else if (quiz.type !== "wiring_ok") {
      quiz.photos = [photo(`${quiz.type}-1`)];
    }
  }
  form.signatureFileId = "signature-1";
  return form;
}

describe("巡查上报领域规则", () => {
  it("按当前后端新版机井契约生成 payload", () => {
    const form = validWellForm();
    form.code = " 01号 ";

    const payload = buildCreateIssueInput(form);

    if (payload.type !== "well") throw new Error("机井上报应生成 well payload");
    expect(payload.type).toBe("well");
    expect(payload.code).toBe("01号");
    expect(payload.type_ext.schema_version).toBe(2);
    expect(payload.type_ext.panorama_files).toEqual(["panorama"]);
    expect(payload.type_ext.checklist).toHaveLength(5);
    expect(payload.type_ext.checklist.some((item) => item.type === "transformer_ok")).toBe(false);
    expect(payload.reporter_signature_file_id).toBe("signature-1");
    expect(payload.plan_date).toBeUndefined();
  });

  it.each(["", " \t "])("手动设施编号为空或仅有空白时，下一步和最终提交均拦截：%j", (code) => {
    const form = validWellForm();
    form.code = code;
    form.codeMode = "manual";

    expect(validateBasicStep(form)).toEqual(["请填写设施编号"]);
    expect(validateSubmitStep(form)).toEqual(["请填写设施编号"]);

    form.code = "01号";
    expect(validateBasicStep(form)).toEqual([]);
    expect(validateSubmitStep(form)).toEqual([]);
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

  it("道路使用新版三项排查契约且不再强制历史林网字段", () => {
    const form = validWellForm();
    replaceIssueType(form, "road");
    form.details.length = "1.2";
    form.details.width = "4";
    form.details.thickness = "0.2";
    for (const quiz of form.quizzes) {
      quiz.value = quiz.type !== "has_road_damage";
      if (quiz.type === "has_road_damage") quiz.photos = [photo("road-damage")];
    }
    form.signatureFileId = "signature-road";

    expect(validateBasicStep(form)).toEqual([]);
    const payload = buildCreateIssueInput(form);
    if (payload.type !== "road") {
      throw new Error("道路上报应生成 road payload");
    }
    expect(payload.type_ext.schema_version).toBe(2);
    expect(payload.type_ext.tree_survive).toBeUndefined();
    expect(payload.type_ext.checklist.map((item) => item.type)).toEqual([
      "has_shoulder",
      "has_ash",
      "has_road_damage",
    ]);
  });

  it("反向题选择是时判定需要整改", () => {
    const form = validWellForm();
    replaceIssueType(form, "forest");
    form.details.handoverCount = "100";
    form.details.existingCount = "95";
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

  it("机井全景照片在基本信息步骤校验并写入独立附件字段", () => {
    const form = validWellForm();
    form.panoramaPhotos = [];
    expect(validateBasicStep(form)).toContain("全景照片至少上传 1 张");
  });

  it("变压器型号和林网整数在前端拦截，避免提交后才由后端拒绝", () => {
    const transformer = validWellForm();
    replaceIssueType(transformer, "transformer");
    transformer.details.capacity = "100";
    expect(validateBasicStep(transformer)).toContain("请填写变压器型号");

    const forest = validWellForm();
    replaceIssueType(forest, "forest");
    forest.details.handoverCount = "100.5";
    forest.details.existingCount = "90";
    expect(validateBasicStep(forest)).toContain("移交株数必须是非负整数");
  });
});
