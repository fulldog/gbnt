import { onMounted, onScopeDispose, shallowRef } from "vue";
import type { ShallowRef } from "vue";
import { businessDate, DAY_MS } from "@/utils/issue-date";

/** 北京时间跨午夜及窗口恢复时刷新日期，并随页面卸载清理监听与计时器。 */
export function useBusinessToday(): ShallowRef<string> {
  const today = shallowRef(businessDate());
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;

  function refresh(): void {
    if (disposed) return;
    if (timer !== undefined) clearTimeout(timer);
    today.value = businessDate();
    const nextMidnight = Date.parse(`${today.value}T00:00:00+08:00`) + DAY_MS;
    timer = setTimeout(refresh, Math.max(50, nextMidnight - Date.now() + 20));
  }

  function visible(): void {
    if (document.visibilityState === "visible") refresh();
  }

  onMounted(() => {
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", visible);
  });
  onScopeDispose(() => {
    disposed = true;
    if (timer !== undefined) clearTimeout(timer);
    window.removeEventListener("focus", refresh);
    document.removeEventListener("visibilitychange", visible);
  });
  return today;
}
