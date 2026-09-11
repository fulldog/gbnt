import type {
  BridgeKind,
  FacilityBuildKind,
  IssueType,
  FacilityCodeMode,
  IssueSubmissionAttempt,
  ProjectYear,
  QuizType,
  TransformerVoltage,
} from "@gbnt/api-client";
import { resolveFacilityCodeMode } from "@gbnt/api-client";
import { QUIZ_DEFINITIONS } from "./definitions";

export interface UploadedPhoto {
  fileId: string;
  url: string;
  localPath?: string;
  capturedAt?: number;
  /** 仅 cameraOnly 拍摄路径可标为 camera；旧草稿/普通选择不伪造来源。 */
  source?: "camera" | "unknown";
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
  projectYear: ProjectYear | null;
  orgId: number | null;
  orgLabel: string;
  code: string;
  /** 旧草稿可省略，恢复时按编号来源推断；新表单显式保存模式。 */
  codeMode?: FacilityCodeMode;
  submissionAttempt?: IssueSubmissionAttempt;
  /** 仅草稿元数据；manual 包括用户主动清空，禁止迟到的自动填充覆盖。 */
  codeSource?: "auto" | "manual";
  /** 编号所属的 orgId:type，仅留在本地草稿，不发送至创建接口。 */
  codeScopeKey?: string;
  address: string;
  lat: number | null;
  lng: number | null;
  /** 机井全景照片，独立于逐题现场照片。 */
  panoramaPhotos: UploadedPhoto[];
  planDate: string;
  signatureFileId: string;
  signaturePreviewUrl: string;
  /** 归一化笔迹坐标，供切换、返回步骤及重启后恢复签名。 */
  signatureStrokes: Array<Array<{ x: number; y: number }>>;
  details: ReportDetailsForm;
  quizzes: QuizFormItem[];
}

/** 迁移旧建议值/手动草稿，不把用户主动清空误判成自动编号。 */
export function restoreReportCodeMode(form: ReportFormState): void {
  form.codeMode = resolveFacilityCodeMode(form);
  if (form.codeSource === "auto" && form.code !== "") {
    form.code = "";
    form.signatureFileId = "";
    form.signaturePreviewUrl = "";
  }
  delete form.codeSource;
  delete form.codeScopeKey;
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

/** 将旧草稿迁入当前题目集合；保留同题答案，新增题留空，退出题不再提交。 */
export function normalizeReportFormSchema(form: ReportFormState): void {
  form.panoramaPhotos ??= [];
  const current = createQuizForm(form.type);
  const previousTypes = form.quizzes.map((item) => item.type);
  const nextTypes = current.map((item) => item.type);
  const schemaChanged = previousTypes.length !== nextTypes.length ||
    previousTypes.some((type, index) => type !== nextTypes[index]);
  form.quizzes = current.map((empty) =>
    form.quizzes.find((item) => item.type === empty.type) ?? empty,
  );
  if (schemaChanged) {
    form.signatureFileId = "";
    form.signaturePreviewUrl = "";
  }
}

export function createReportForm(type: IssueType = "well"): ReportFormState {
  return {
    type,
    projectYear: null,
    orgId: null,
    orgLabel: "",
    code: "",
    address: "",
    lat: null,
    lng: null,
    panoramaPhotos: [],
    planDate: "",
    signatureFileId: "",
    signaturePreviewUrl: "",
    signatureStrokes: [],
    details: createReportDetails(),
    quizzes: createQuizForm(type),
  };
}

export function replaceIssueType(form: ReportFormState, type: IssueType): void {
  form.type = type;
  form.details = createReportDetails();
  form.quizzes = createQuizForm(type);
  form.panoramaPhotos = [];
  form.planDate = "";
  form.signatureFileId = "";
  form.signaturePreviewUrl = "";
  form.signatureStrokes = [];
}

/** 切换到出水现场取证时，不能把普通相册照片当作取证照片复用。 */
export function changeQuizAnswer(item: QuizFormItem, value: boolean): void {
  if (item.type === "water_out" && item.value !== value && value) item.photos = [];
  item.value = value;
}
