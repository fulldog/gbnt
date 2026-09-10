import { computed, onScopeDispose, shallowRef } from "vue";
import { onHide, onShow, onUnload } from "@dcloudio/uni-app";

/** 同一页面共用小时倒计时时钟；隐藏后停止，重新展示时即时更新。 */
export function useBusinessNow(offset: () => number = () => 0) {
  const tick = shallowRef(Date.now());
  const now = computed(() => tick.value + offset());
  let timer: ReturnType<typeof setTimeout> | undefined;
  function stop(): void {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  }
  function refresh(): void {
    stop();
    tick.value = Date.now();
    timer = setTimeout(refresh, 60_000 - (now.value % 60_000) + 10);
  }
  onShow(refresh);
  onHide(stop);
  onUnload(stop);
  onScopeDispose(stop);
  return now;
}
