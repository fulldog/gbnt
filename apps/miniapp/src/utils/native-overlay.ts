export type NativeOverlayVisibilityChange = (visible: boolean) => void;

/** 标记微信原生全屏窗口的开始与结束；返回函数可安全重复调用。 */
export function beginNativeOverlay(
  onVisibilityChange?: NativeOverlayVisibilityChange,
): () => void {
  let active = true;
  onVisibilityChange?.(true);
  return () => {
    if (!active) return;
    active = false;
    onVisibilityChange?.(false);
  };
}
