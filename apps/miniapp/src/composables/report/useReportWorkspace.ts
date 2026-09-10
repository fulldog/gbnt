import { shallowRef } from "vue";
import type { IssueType } from "@gbnt/api-client";
import { createReportForm, restoreReportCodeMode, type ReportFormState } from "@/domain/issues/form";
import { ISSUE_TYPE_OPTIONS, QUIZ_DEFINITIONS } from "@/domain/issues/definitions";
import { isReportFormState, useReportDraft } from "./useReportDraft";

export interface ReportTypeDraft { form: ReportFormState; step: number }
export interface ReportWorkspace {
  activeType: IssueType;
  drafts: Partial<Record<IssueType, ReportTypeDraft>>;
}
export function createTypeDraft(type: IssueType): ReportTypeDraft {
  return { form: createReportForm(type), step: 1 };
}
export function createReportWorkspace(): ReportWorkspace {
  return { activeType: "well", drafts: { well: createTypeDraft("well") } };
}
export function selectWorkspaceType(workspace: ReportWorkspace, type: IssueType): void {
  if (!ISSUE_TYPE_OPTIONS.some((item) => item.value === type)) return;
  workspace.drafts[type] ??= createTypeDraft(type);
  workspace.activeType = type;
}
export function workspaceStorageKey(userId: number): string {
  return `gbnt:miniapp:report-draft:v3:user:${userId}`;
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
function validStrokes(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.length <= 1000 && value.every((stroke) =>
    Array.isArray(stroke) && stroke.length <= 20000 && stroke.every((point) => record(point) &&
      typeof point.x === "number" && point.x >= 0 && point.x <= 1 &&
      typeof point.y === "number" && point.y >= 0 && point.y <= 1)));
}

/** 每个账号保存五类独立草稿，切换只修改 activeType，提交只清理指定类型。 */
export function useReportWorkspace(owner: () => number | null) {
  const saveState = shallowRef<"idle" | "saved" | "failed">("idle");
  function save(workspace: ReportWorkspace): boolean {
    const id = owner();
    if (!id) { saveState.value = "failed"; return false; }
    try {
      uni.setStorageSync(workspaceStorageKey(id), {
        version: 3, ownerUserId: id, workspace: JSON.parse(JSON.stringify(workspace)),
      });
      saveState.value = "saved";
      return true;
    } catch { saveState.value = "failed"; return false; }
  }
  function load(): ReportWorkspace {
    const id = owner();
    if (!id) return createReportWorkspace();
    let stored: unknown;
    try { stored = uni.getStorageSync(workspaceStorageKey(id)); } catch { /* 读取失败时不应用未知数据。 */ }
    if (record(stored) && stored.version === 3 && stored.ownerUserId === id &&
      record(stored.workspace) && record(stored.workspace.drafts)) {
      const workspace = createReportWorkspace();
      for (const { value: type } of ISSUE_TYPE_OPTIONS) {
        const draft = stored.workspace.drafts[type];
        if (!record(draft) || !isReportFormState(draft.form) || draft.form.type !== type || !validStrokes(draft.form.signatureStrokes)) continue;
        const form = JSON.parse(JSON.stringify(draft.form)) as ReportFormState;
        form.signatureStrokes ??= [];
        restoreReportCodeMode(form);
        form.quizzes = QUIZ_DEFINITIONS[type].map((definition) => form.quizzes.find((quiz) => quiz.type === definition.type)!);
        workspace.drafts[type] = { form, step: typeof draft.step === "number" && Number.isInteger(draft.step)
          ? Math.min(Math.max(draft.step, 1), QUIZ_DEFINITIONS[type].length + 2) : 1 };
      }
      selectWorkspaceType(workspace, stored.workspace.activeType as IssueType);
      return workspace;
    }
    // 旧版只有一份草稿。迁入其原有类型，保留内容，不弹恢复或放弃对话框。
    const legacy = useReportDraft(id);
    const form = legacy.loadDraft();
    if (form) {
      restoreReportCodeMode(form);
      // 旧版自动填入的 2023 无法证明用户主动选择，迁移时要求重新选择年度并重新签名。
      if (form.projectYear === 2023) {
        form.projectYear = null;
        form.signatureFileId = "";
        form.signaturePreviewUrl = "";
      }
      const workspace = { activeType: form.type, drafts: { [form.type]: { form, step: 1 } } };
      if (save(workspace)) legacy.clearDraft();
      return workspace;
    }
    return createReportWorkspace();
  }
  function clearType(workspace: ReportWorkspace, type: IssueType): boolean {
    workspace.drafts[type] = createTypeDraft(type);
    return save(workspace);
  }
  return { load, save, clearType, saveState };
}
