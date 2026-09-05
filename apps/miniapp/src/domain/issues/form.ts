import type {
  BridgeKind,
  FacilityBuildKind,
  IssueType,
  ProjectYear,
  QuizType,
  TransformerVoltage,
} from "@gbnt/api-client";
import { QUIZ_DEFINITIONS } from "./definitions";

export interface UploadedPhoto {
  fileId: string;
  url: string;
  localPath?: string;
  capturedAt?: number;
}

export interface QuizFormItem {
  type: QuizType;
  value: boolean | null;
  desc: string;
  photos: UploadedPhoto[];
}

export interface ReportDetailsForm {
  buildKind: FacilityBuildKind;
  outletTotal: string;
  outletDamaged: string;
  casingTotal: string;
  casingDamaged: string;
  length: string;
  width: string;
  thickness: string;
  treeSurvive: string;
  bridgeKind: BridgeKind;
  handoverCount: string;
  existingCount: string;
  surviveRate: string;
  capacity: string;
  transformerModel: string;
  voltage: TransformerVoltage;
  keeperName: string;
  keeperPhone: string;
}

export interface ReportFormState {
  type: IssueType;
  projectYear: ProjectYear;
  orgId: number | null;
  orgLabel: string;
  code: string;
  address: string;
  lat: number | null;
  lng: number | null;
  planDate: string;
  signatureFileId: string;
  signaturePreviewUrl: string;
  details: ReportDetailsForm;
  quizzes: QuizFormItem[];
}

export function createReportDetails(): ReportDetailsForm {
  return {
    buildKind: "new",
    outletTotal: "",
    outletDamaged: "",
    casingTotal: "",
    casingDamaged: "",
    length: "",
    width: "",
    thickness: "",
    treeSurvive: "",
    bridgeKind: "bridge",
    handoverCount: "",
    existingCount: "",
    surviveRate: "",
    capacity: "",
    transformerModel: "",
    voltage: "10kv",
    keeperName: "",
    keeperPhone: "",
  };
}

export function createQuizForm(type: IssueType): QuizFormItem[] {
  return QUIZ_DEFINITIONS[type].map((item) => ({
    type: item.type,
    value: null,
    desc: "",
    photos: [],
  }));
}

export function createReportForm(): ReportFormState {
  return {
    type: "well",
    projectYear: 2023,
    orgId: null,
    orgLabel: "",
    code: "",
    address: "",
    lat: null,
    lng: null,
    planDate: "",
    signatureFileId: "",
    signaturePreviewUrl: "",
    details: createReportDetails(),
    quizzes: createQuizForm("well"),
  };
}

/** 只有用户实际填写或切换过内容时才保留草稿，避免空表单反复提示恢复。 */
export function hasReportProgress(form: ReportFormState): boolean {
  const initial = createReportForm();
  if (
    form.type !== initial.type ||
    form.projectYear !== initial.projectYear ||
    form.orgId !== initial.orgId ||
    form.orgLabel !== initial.orgLabel ||
    form.code !== initial.code ||
    form.address !== initial.address ||
    form.lat !== initial.lat ||
    form.lng !== initial.lng ||
    form.planDate !== initial.planDate ||
    form.signatureFileId !== initial.signatureFileId ||
    form.signaturePreviewUrl !== initial.signaturePreviewUrl
  ) {
    return true;
  }

  const detailKeys = Object.keys(initial.details) as Array<keyof ReportDetailsForm>;
  if (detailKeys.some((key) => form.details[key] !== initial.details[key])) {
    return true;
  }

  return form.quizzes.some(
    (item) => item.value !== null || item.desc.trim() !== "" || item.photos.length > 0,
  );
}

export function replaceIssueType(form: ReportFormState, type: IssueType): void {
  form.type = type;
  form.details = createReportDetails();
  form.quizzes = createQuizForm(type);
  form.planDate = "";
  form.signatureFileId = "";
  form.signaturePreviewUrl = "";
}
