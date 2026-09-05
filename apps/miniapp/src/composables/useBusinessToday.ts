import { onHide, onShow, onUnload } from "@dcloudio/uni-app";
import { onScopeDispose, readonly, shallowRef } from "vue";
import { businessToday, millisecondsUntilBusinessMidnight } from "@/utils/business-date";

/** 页面激活及北京时间跨日时刷新计划日期标签，后台不保留计时器。 */
export function useBusinessToday() {
  const today = shallowRef(businessToday());
  let timer: ReturnType<typeof setTimeout> | undefined;
  function stop(): void {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  }
  function refresh(): void {
    stop();
    today.value = businessToday();
    timer = setTimeout(refresh, millisecondsUntilBusinessMidnight());
  }
  onShow(refresh);
  onHide(stop);
  onUnload(stop);
  onScopeDispose(stop);
  return readonly(today);
}
