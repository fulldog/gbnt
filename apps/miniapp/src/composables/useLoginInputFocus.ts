import { getCurrentInstance, nextTick, onScopeDispose, shallowRef, watch } from "vue";

type LoginField = "username" | "password";

/** 串行交接原生输入框焦点；旧输入框迟到的 blur 不能清除新目标。 */
export function useLoginInputFocus(enabled: () => boolean) {
  const page = getCurrentInstance()?.proxy;
  const focusTarget = shallowRef<LoginField | null>(null);
  let nativeField: LoginField | null = null;
  let pendingField: LoginField | null = null;
  let press: { field: LoginField; transfer: boolean } | null = null;
  let revision = 0;

  function releaseFocus(): void {
    revision += 1;
    pendingField = null;
    nativeField = null;
    press = null;
    focusTarget.value = null;
  }

  function onFieldTouch(field: LoginField): void {
    // touchstart 在原生默认聚焦之前记录意图，重复点击当前框不重置光标。
    press = enabled() ? { field, transfer: nativeField !== field } : null;
  }

  async function requestFocus(field: LoginField, force = false): Promise<void> {
    if (!enabled()) return;
    if (!force && !pendingField && nativeField === field && focusTarget.value === field) return;
    const current = ++revision;
    pendingField = field;
    focusTarget.value = null;
    // 小程序的实例 $nextTick 等待 setData 完成；普通 Vue nextTick 只等逻辑层刷新。
    // 先确认旧框 focus=false 已下发，再聚焦新框。
    await (page ? page.$nextTick() : nextTick());
    if (current !== revision || !enabled()) return;
    focusTarget.value = field;
  }

  function onFieldTap(field: LoginField): Promise<void> {
    const transfer = press?.field === field && press.transfer;
    press = null;
    return requestFocus(field, transfer);
  }

  function onFieldFocus(field: LoginField): void {
    if (!enabled() || (pendingField && pendingField !== field)) return;
    nativeField = field;
    if (!pendingField) focusTarget.value = field;
    // 等目标框确认聚焦后再结束交接，避免我们主动失焦产生的迟到 blur 撤销新目标。
    else if (focusTarget.value === field) pendingField = null;
  }

  function onFieldBlur(field: LoginField): void {
    if (nativeField === field) nativeField = null;
    if (!pendingField && focusTarget.value === field) focusTarget.value = null;
  }

  watch(enabled, (value) => { if (!value) releaseFocus(); }, { flush: "sync" });
  onScopeDispose(releaseFocus);
  return { focusTarget, onFieldTouch, onFieldTap, requestFocus, onFieldFocus, onFieldBlur, releaseFocus };
}
