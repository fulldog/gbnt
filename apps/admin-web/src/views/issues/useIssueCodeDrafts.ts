import { watch } from "vue";
import { resolveFacilityCodeMode, type FacilityCodeMode, type IssueType } from "@gbnt/api-client";
import type { IssueFormDraft } from "./issue-form";

/** 新增弹窗按设施类型保存编号模式和手动内容；编辑加载不触发编号替换。 */
export function useIssueCodeDrafts(form: Pick<IssueFormDraft, "type" | "code" | "codeMode">, enabled: () => boolean) {
  const drafts = new Map<IssueType, { code: string; codeMode: FacilityCodeMode }>();
  watch(() => form.type, (type, previous) => {
    if (!enabled()) return;
    drafts.set(previous, { code: form.code, codeMode: resolveFacilityCodeMode(form) });
    Object.assign(form, drafts.get(type) ?? { code: "", codeMode: "auto" });
  }, { flush: "sync" });
  return { reset: () => drafts.clear() };
}
