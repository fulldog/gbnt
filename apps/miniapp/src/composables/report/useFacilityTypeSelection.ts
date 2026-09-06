import { shallowRef } from "vue";
import type { IssueType } from "@gbnt/api-client";
import { ISSUE_TYPE_OPTIONS } from "@/domain/issues/definitions";

interface FacilityTypeSelectionOptions {
  currentType: () => IssueType;
  disabled: () => boolean;
  commit: (type: IssueType) => void;
}

/** 选中态只随确认后的表单类型变化；快速连点、取消或页面失效均不清空数据。 */
export function useFacilityTypeSelection(options: FacilityTypeSelectionOptions) {
  const selectingType = shallowRef(false);

  async function selectType(type: IssueType): Promise<void> {
    if (selectingType.value || options.disabled() || type === options.currentType() ||
      !ISSUE_TYPE_OPTIONS.some((option) => option.value === type)) return;
    const previousType = options.currentType();
    selectingType.value = true;
    try {
      const result = await uni.showModal({
        title: "切换设施类型",
        content: "切换后将清空当前类型的扩展字段、排查项和签名，是否继续？",
        confirmText: "继续切换",
      });
      if (result.confirm && !options.disabled() && options.currentType() === previousType) {
        options.commit(type);
      }
    } catch {
      // 弹窗取消或调用失败时保留原类型和表单，不产生未处理的事件 Promise。
    } finally {
      selectingType.value = false;
    }
  }

  return { selectingType, selectType };
}
