export interface InputEventLike {
  detail: { value: string };
}

/** 兼容 UniApp 运行时的 detail.value 与 vue-tsc 使用的 DOM Event。 */
export function inputEventValue(event: Event | InputEventLike): string {
  const detailValue = (event as { detail?: { value?: unknown } }).detail?.value;
  if (typeof detailValue === "string") {
    return detailValue;
  }

  const targetValue = (
    event as { target?: { value?: unknown } | null }
  ).target?.value;
  return typeof targetValue === "string" ? targetValue : "";
}
