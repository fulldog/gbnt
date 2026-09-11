import { getCurrentInstance, nextTick, onScopeDispose, shallowRef, watch } from "vue";

type LoginField = "username" | "password";

const FOCUS_STABLE_DELAY = 80;
const MAX_NATIVE_RETRY_COUNT = 1;

/** 交接微信原生输入框焦点，并补偿 Android 偶发的 focus 后立即 blur。 */
export function useLoginInputFocus(enabled: () => boolean) {
  const page = getCurrentInstance()?.proxy;
  const focusTarget = shallowRef<LoginField | null>(null);
  let nativeField: LoginField | null = null;
  let pendingField: LoginField | null = null;
  let stableTimer: ReturnType<typeof setTimeout> | null = null;
  let nativeRetryCount = 0;
  let revision = 0;

  function clearStableTimer(): void {
    if (stableTimer === null) return;
    clearTimeout(stableTimer);
    stableTimer = null;
  }

  function releaseFocus(): void {
    revision += 1;
    clearStableTimer();
    nativeRetryCount = 0;
    pendingField = null;
    nativeField = null;
    focusTarget.value = null;
  }

  function onFieldTouch(field: LoginField): Promise<void> {
    if (!enabled() || (!pendingField && nativeField === field)) {
      return Promise.resolve();
    }
    // 正常切换时在同一次 setData 中同时下发旧框 false、新框 true，避免键盘先收起。
    // 若上一条同目标命令尚未生效，则脉冲一次 focus 以允许用户重试。
    return requestFocus(field, pendingField === field || focusTarget.value === field);
  }

  async function issueFocus(field: LoginField, force: boolean): Promise<void> {
    if (!enabled()) return;
    if (!force && (pendingField === field || (!pendingField && nativeField === field))) return;
    const current = ++revision;
    clearStableTimer();
    pendingField = field;
    if (force || focusTarget.value === field) {
      focusTarget.value = null;
      // 同目标重试必须先让原生层看到一次 false，才能再次消费 true。
      await (page ? page.$nextTick() : nextTick());
      if (current !== revision || !enabled()) return;
    }
    focusTarget.value = field;
    // 小程序实例 $nextTick 等待 setData 回调，确保稳定计时从视图层收到命令后开始。
    await (page ? page.$nextTick() : nextTick());
    if (current !== revision || !enabled()) return;
    scheduleStableFocus(field, current);
  }

  function requestFocus(field: LoginField, force = false): Promise<void> {
    nativeRetryCount = 0;
    return issueFocus(field, force);
  }

  function scheduleStableFocus(field: LoginField, current: number): void {
    if (pendingField !== field || nativeField !== field || focusTarget.value !== field) return;
    clearStableTimer();
    stableTimer = setTimeout(() => {
      stableTimer = null;
      if (
        current === revision
        && enabled()
        && pendingField === field
        && nativeField === field
        && focusTarget.value === field
      ) {
        pendingField = null;
        nativeRetryCount = 0;
      }
    }, FOCUS_STABLE_DELAY);
  }

  function onFieldFocus(field: LoginField): void {
    if (!enabled() || (pendingField && pendingField !== field)) return;
    nativeField = field;
    // Android 可能在目标框 focus 后紧接着发出 blur；短暂保留 pending 用来识别并补偿。
    scheduleStableFocus(field, revision);
  }

  function onFieldBlur(field: LoginField): void {
    if (nativeField === field) nativeField = null;
    if (pendingField === field && focusTarget.value === field) {
      clearStableTimer();
      if (nativeRetryCount < MAX_NATIVE_RETRY_COUNT) {
        nativeRetryCount += 1;
        void issueFocus(field, true);
      } else {
        pendingField = null;
        nativeRetryCount = 0;
        focusTarget.value = null;
      }
      return;
    }
    if (!pendingField && focusTarget.value === field) focusTarget.value = null;
  }

  watch(enabled, (value) => { if (!value) releaseFocus(); }, { flush: "sync" });
  onScopeDispose(releaseFocus);
  return { focusTarget, onFieldTouch, requestFocus, onFieldFocus, onFieldBlur, releaseFocus };
}
