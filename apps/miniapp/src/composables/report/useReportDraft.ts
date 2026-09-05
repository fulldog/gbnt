import {
  createReportDetails,
  hasReportProgress,
  type ReportFormState,
} from "@/domain/issues/form";
import { QUIZ_DEFINITIONS } from "@/domain/issues/definitions";

const LEGACY_REPORT_DRAFT_KEY = "gbnt:miniapp:report-draft:v1";

type DraftOwnerSource = number | null | (() => number | null);

export function reportDraftStorageKey(ownerUserId: number): string {
  return `gbnt:miniapp:report-draft:v2:user:${ownerUserId}`;
}

function readDraftStorage(key: string): unknown {
  try {
    return uni.getStorageSync(key) as unknown;
  } catch {
    return null;
  }
}

function writeDraftStorage(key: string, value: StoredDraft): void {
  try {
    uni.setStorageSync(key, value);
  } catch {
    // 自动草稿是尽力保存；受限运行环境下不能让页面因此崩溃。
  }
}

function removeDraftStorage(key: string): void {
  try {
    uni.removeStorageSync(key);
  } catch {
    // 存储不可用或条目已不存在时无需打断用户流程。
  }
}

interface StoredDraft {
  version: 2;
  ownerUserId: number;
  savedAt: string;
  form: ReportFormState;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNullableNumber(value: unknown): boolean {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isUploadedPhoto(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.fileId === "string" &&
    typeof value.url === "string" &&
    (value.localPath === undefined || typeof value.localPath === "string") &&
    (value.capturedAt === undefined ||
      (typeof value.capturedAt === "number" && Number.isFinite(value.capturedAt)))
  );
}

function isReportFormState(value: unknown): value is ReportFormState {
  if (!isRecord(value)) {
    return false;
  }

  const issueType = value.type;
  if (
    typeof issueType !== "string" ||
    !Object.prototype.hasOwnProperty.call(QUIZ_DEFINITIONS, issueType)
  ) {
    return false;
  }

  const details = value.details;
  const detailTemplate = createReportDetails();
  if (
    !isRecord(details) ||
    !(Object.keys(detailTemplate) as Array<keyof typeof detailTemplate>).every(
      (key) => typeof details[key] === "string",
    ) ||
    !["new", "match"].includes(String(details.buildKind)) ||
    !["bridge", "culvert", "gate"].includes(String(details.bridgeKind)) ||
    !["10kv", "0.4kv"].includes(String(details.voltage))
  ) {
    return false;
  }

  const expectedQuizTypes = QUIZ_DEFINITIONS[issueType as keyof typeof QUIZ_DEFINITIONS].map(
    (item) => item.type,
  );
  const quizzes = value.quizzes;
  if (
    !Array.isArray(quizzes) ||
    quizzes.length !== expectedQuizTypes.length ||
    !expectedQuizTypes.every((type) =>
      quizzes.some(
        (item) =>
          isRecord(item) &&
          item.type === type &&
          (item.value === null || typeof item.value === "boolean") &&
          typeof item.desc === "string" &&
          Array.isArray(item.photos) &&
          item.photos.every(isUploadedPhoto),
      ),
    )
  ) {
    return false;
  }

  return (
    typeof value.projectYear === "number" &&
    [2020, 2021, 2022, 2023].includes(value.projectYear) &&
    (value.orgId === null ||
      (typeof value.orgId === "number" && Number.isInteger(value.orgId) && value.orgId > 0)) &&
    typeof value.orgLabel === "string" &&
    typeof value.code === "string" &&
    typeof value.address === "string" &&
    isNullableNumber(value.lat) &&
    isNullableNumber(value.lng) &&
    typeof value.planDate === "string" &&
    typeof value.signatureFileId === "string" &&
    typeof value.signaturePreviewUrl === "string"
  );
}

function isStoredDraft(value: unknown, ownerUserId: number): value is StoredDraft {
  return (
    isRecord(value) &&
    value.version === 2 &&
    value.ownerUserId === ownerUserId &&
    typeof value.savedAt === "string" &&
    isReportFormState(value.form)
  );
}

export function useReportDraft(ownerSource: DraftOwnerSource) {
  function ownerUserId(): number | null {
    const value = typeof ownerSource === "function" ? ownerSource() : ownerSource;
    return typeof value === "number" && Number.isInteger(value) && value > 0
      ? value
      : null;
  }

  function loadDraft(): ReportFormState | null {
    // v1 草稿没有用户归属，继续保留会在共用设备上造成跨账号泄露。
    removeDraftStorage(LEGACY_REPORT_DRAFT_KEY);
    const ownerId = ownerUserId();
    if (!ownerId) {
      return null;
    }
    const key = reportDraftStorageKey(ownerId);
    const value = readDraftStorage(key);
    if (!isStoredDraft(value, ownerId)) {
      if (value) {
        removeDraftStorage(key);
      }
      return null;
    }
    return JSON.parse(JSON.stringify(value.form)) as ReportFormState;
  }

  function saveDraft(form: ReportFormState): void {
    const ownerId = ownerUserId();
    if (!ownerId) {
      return;
    }
    if (!hasReportProgress(form)) {
      clearDraft();
      return;
    }
    const draft: StoredDraft = {
      version: 2,
      ownerUserId: ownerId,
      savedAt: new Date().toISOString(),
      form: JSON.parse(JSON.stringify(form)) as ReportFormState,
    };
    writeDraftStorage(reportDraftStorageKey(ownerId), draft);
  }

  function clearDraft(): void {
    removeDraftStorage(LEGACY_REPORT_DRAFT_KEY);
    const ownerId = ownerUserId();
    if (ownerId) {
      removeDraftStorage(reportDraftStorageKey(ownerId));
    }
  }

  return { loadDraft, saveDraft, clearDraft };
}
