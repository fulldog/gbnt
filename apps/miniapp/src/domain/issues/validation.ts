import type { IssueType, QuizType } from "@gbnt/api-client";
import { QUIZ_DEFINITIONS, quizIndicatesIssue } from "./definitions";
import type { QuizFormItem, ReportFormState } from "./form";

function parseNumber(value: string): number {
  return Number(value.trim());
}

function validateRequiredNumber(
  value: string,
  label: string,
  errors: string[],
  maximum?: number,
): void {
  if (!value.trim()) {
    errors.push(`请填写${label}`);
    return;
  }
  const number = parseNumber(value);
  if (!Number.isFinite(number) || number < 0) {
    errors.push(`${label}必须是大于或等于 0 的数字`);
    return;
  }
  if (maximum !== undefined && number > maximum) {
    errors.push(`${label}不能大于 ${maximum}`);
  }
}

function validateKeeperPhone(value: string, errors: string[]): void {
  const phone = value.trim();
  if (phone && !/^1\d{10}$/.test(phone)) {
    errors.push("负责人电话须为 11 位手机号");
  }
}

function validateDetails(form: ReportFormState, errors: string[]): void {
  const details = form.details;
  switch (form.type) {
    case "well":
      validateRequiredNumber(details.outletTotal, "出水口总数", errors);
      validateRequiredNumber(details.outletDamaged, "出水口损坏数量", errors);
      validateRequiredNumber(details.casingTotal, "护筒总数", errors);
      validateRequiredNumber(details.casingDamaged, "护筒损坏数量", errors);
      if (
        details.outletTotal.trim() &&
        details.outletDamaged.trim() &&
        parseNumber(details.outletDamaged) > parseNumber(details.outletTotal)
      ) {
        errors.push("出水口损坏数量不能大于总数");
      }
      if (
        details.casingTotal.trim() &&
        details.casingDamaged.trim() &&
        parseNumber(details.casingDamaged) > parseNumber(details.casingTotal)
      ) {
        errors.push("护筒损坏数量不能大于总数");
      }
      break;
    case "road":
      validateRequiredNumber(details.length, "道路长度", errors);
      validateRequiredNumber(details.width, "道路宽度", errors);
      validateRequiredNumber(details.thickness, "道路厚度", errors);
      validateRequiredNumber(details.treeSurvive, "林网树木存活数量", errors);
      break;
    case "bridge":
      validateRequiredNumber(details.length, "长度", errors);
      validateRequiredNumber(details.width, "宽度", errors);
      break;
    case "forest":
      validateRequiredNumber(details.handoverCount, "移交株数", errors);
      validateRequiredNumber(details.existingCount, "现有株数", errors);
      validateRequiredNumber(details.surviveRate, "存活率", errors, 100);
      break;
    case "transformer":
      validateRequiredNumber(details.capacity, "变压器容量", errors);
      break;
  }
  validateKeeperPhone(details.keeperPhone, errors);
}

export function validateBasicStep(form: ReportFormState): string[] {
  const errors: string[] = [];
  if (!form.orgId) {
    errors.push("请选择行政区划");
  }
  if (!form.address.trim()) {
    errors.push("请选择定位或填写详细地址");
  }
  if ((form.lat === null) !== (form.lng === null)) {
    errors.push("经纬度信息不完整，请重新选择位置");
  }
  validateDetails(form, errors);
  return errors;
}

export function quizNeedsPhoto(type: QuizType, value: boolean): boolean {
  const definition = Object.values(QUIZ_DEFINITIONS)
    .flat()
    .find((item) => item.type === type);
  if (!definition) {
    return false;
  }
  return quizIndicatesIssue(definition, value) || type === "water_out";
}

export function quizMinimumPhotos(type: QuizType, value: boolean): number {
  if (type === "water_out" && value) {
    return 2;
  }
  return quizNeedsPhoto(type, value) ? 1 : 0;
}

export function quizItemIndicatesIssue(
  issueType: IssueType,
  item: QuizFormItem,
): boolean {
  if (item.value === null) {
    return false;
  }
  const definition = QUIZ_DEFINITIONS[issueType].find(
    (candidate) => candidate.type === item.type,
  );
  return definition ? quizIndicatesIssue(definition, item.value) : false;
}

export function reportNeedsRectify(form: ReportFormState): boolean {
  const checklistIssue = form.quizzes.some((item) =>
    quizItemIndicatesIssue(form.type, item),
  );
  if (checklistIssue) {
    return true;
  }
  if (form.type !== "well") {
    return false;
  }
  return (
    parseNumber(form.details.outletDamaged || "0") > 0 ||
    parseNumber(form.details.casingDamaged || "0") > 0
  );
}

function validateWaterOutInterval(item: QuizFormItem, errors: string[]): void {
  if (item.value !== true || item.photos.length < 2) {
    return;
  }
  const first = item.photos[0]?.capturedAt;
  const second = item.photos[1]?.capturedAt;
  if (first && second && second - first < 60_000) {
    errors.push("机井出水第二张照片须在第一张拍摄至少 60 秒后获取");
  }
}

export function validateQuizStep(form: ReportFormState): string[] {
  const errors: string[] = [];
  const definitions = QUIZ_DEFINITIONS[form.type];
  for (const definition of definitions) {
    const item = form.quizzes.find((candidate) => candidate.type === definition.type);
    if (!item || item.value === null) {
      errors.push(`请选择“${definition.label}”`);
      continue;
    }
    const indicatesIssue = quizIndicatesIssue(definition, item.value);
    if (indicatesIssue && !item.desc.trim()) {
      errors.push(`请填写“${definition.label}”的问题说明`);
    }
    const minimum = quizMinimumPhotos(item.type, item.value);
    if (item.photos.length < minimum) {
      errors.push(`“${definition.label}”至少上传 ${minimum} 张现场照片`);
    }
    if (item.photos.length > 6) {
      errors.push(`“${definition.label}”最多上传 6 张照片`);
    }
    if (item.type === "water_out") {
      validateWaterOutInterval(item, errors);
    }
  }
  return errors;
}

export function validateSubmitStep(form: ReportFormState): string[] {
  const errors = [...validateBasicStep(form), ...validateQuizStep(form)];
  if (reportNeedsRectify(form) && !form.planDate) {
    errors.push("存在待整改问题时必须选择计划完成日期");
  }
  if (!form.signatureFileId) {
    errors.push("请完成排查人电子签名并上传");
  }
  return Array.from(new Set(errors));
}
