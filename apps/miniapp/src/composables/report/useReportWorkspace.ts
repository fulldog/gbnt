import type { IssueType } from "@gbnt/api-client";
import { createReportForm, type ReportFormState } from "@/domain/issues/form";
import { ISSUE_TYPE_OPTIONS } from "@/domain/issues/definitions";

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

const LEGACY_REPORT_DRAFT_KEY = "gbnt:miniapp:report-draft:v1";

/**
 * 巡查表单只在当前页面会话内保留。进入或离开页面时清除历史版本曾写入的草稿，
 * 避免升级后的客户端继续恢复旧数据。
 */
export function clearStoredReportDrafts(ownerUserId: number | null): void {
  const keys = new Set([LEGACY_REPORT_DRAFT_KEY]);
  if (ownerUserId && Number.isInteger(ownerUserId) && ownerUserId > 0) {
    keys.add(
      `gbnt:miniapp:report-draft:v2:user:${ownerUserId}`,
    );
    keys.add(
      workspaceStorageKey(ownerUserId),
    );
  }
  try {
    for (const key of uni.getStorageInfoSync().keys) {
      if (key.startsWith("gbnt:miniapp:report-draft:")) keys.add(key);
    }
  } catch {
    // 旧基础库无法枚举时，仍会清理全局键和当前账号键。
  }
  for (const key of keys) {
    try {
      uni.removeStorageSync(key);
    } catch {
      // 表单已不再读取持久化草稿；清理失败不影响本次使用，下次进入时继续尝试。
    }
  }
}
