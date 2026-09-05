import {
  createReportDetails,
  hasReportProgress,
  type ReportFormState,
} from "@/domain/issues/form";
import { QUIZ_DEFINITIONS } from "@/domain/issues/definitions";
import { shallowRef } from "vue";

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

function writeDraftStorage(key: string, value: StoredDraft): boolean {
  try {
    uni.setStorageSync(key, value);
    return true;
  } catch {
    return false;
  }
}

function removeDraftStorage(key: string): boolean {
  try {
    uni.removeStorageSync(key);
    return true;
  } catch {
    return false;
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
      (typeof value.capturedAt === "number" && Number.isFinite(value.capturedAt))) &&
    (value.source === undefined || value.source === "camera" || value.source === "unknown")
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
  const saveState = shallowRef<"idle" | "saved" | "failed">("idle");
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
    const restored = JSON.parse(JSON.stringify(value.form)) as ReportFormState;
    // 向导按当前后端题目顺序展示，旧草稿数组顺序不能决定题目与答案的配对。
    restored.quizzes = QUIZ_DEFINITIONS[restored.type].map((definition) =>
      restored.quizzes.find((quiz) => quiz.type === definition.type)!,
    );
    return restored;
  }

  function saveDraft(form: ReportFormState): void {
    const ownerId = ownerUserId();
    if (!ownerId) {
      saveState.value = "failed";
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
    saveState.value = writeDraftStorage(reportDraftStorageKey(ownerId), draft) ? "saved" : "failed";
  }

  function clearDraft(): boolean {
    removeDraftStorage(LEGACY_REPORT_DRAFT_KEY);
    const ownerId = ownerUserId();
    const cleared = !ownerId || removeDraftStorage(reportDraftStorageKey(ownerId));
    saveState.value = cleared ? "idle" : "failed";
    return cleared;
  }

  return { loadDraft, saveDraft, clearDraft, saveState };
}
