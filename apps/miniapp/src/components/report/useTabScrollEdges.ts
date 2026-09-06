import { computed, nextTick, shallowRef } from "vue";

interface TabRect {
  width: number;
  left: number;
}

function readRect(value: unknown): TabRect | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const rect = value as Partial<TabRect>;
  if (typeof rect.width !== "number" || !Number.isFinite(rect.width) || rect.width <= 0) return null;
  if (typeof rect.left !== "number" || !Number.isFinite(rect.left)) return null;
  return { width: rect.width, left: rect.left };
}

/** 只测量设施标签的滚动边缘；生命周期由组件负责，未知尺寸时不显示渐隐。 */
export function useTabScrollEdges(component: () => unknown) {
  const viewportWidth = shallowRef(0);
  const contentWidth = shallowRef(0);
  const scrollLeft = shallowRef(0);
  const maxScroll = computed(() => Math.max(contentWidth.value - viewportWidth.value, 0));
  const position = computed(() => Math.min(Math.max(scrollLeft.value, 0), maxScroll.value));
  // 允许 1px 的测量和滚动取整误差，抵达边界后不要留下浅色遮罩。
  const showLeftFade = computed(() => viewportWidth.value > 0 && position.value > 1);
  const showRightFade = computed(() => viewportWidth.value > 0 && maxScroll.value - position.value > 1);
  let disposed = false;
  let generation = 0;
  let scrollGeneration = 0;
  let cancelMeasurement: (() => void) | undefined;

  function clear(): void {
    viewportWidth.value = 0;
    contentWidth.value = 0;
    scrollLeft.value = 0;
  }

  function invalidateMeasurement(): void {
    generation += 1;
    cancelMeasurement?.();
    cancelMeasurement = undefined;
  }

  function onScroll(event: unknown): void {
    if (disposed) return;
    const detail = event && typeof event === "object" ? (event as { detail?: unknown }).detail : null;
    const data = detail && typeof detail === "object" ? detail as Record<string, unknown> : {};
    if (
      typeof data.scrollLeft !== "number" || !Number.isFinite(data.scrollLeft) ||
      typeof data.scrollWidth !== "number" || !Number.isFinite(data.scrollWidth) || data.scrollWidth < 0
    ) {
      invalidateMeasurement();
      clear();
      return;
    }
    // 滚动不能取消首次或 resize 的尺寸测量，只标记位置和内容宽度已有更新。
    scrollGeneration += 1;
    scrollLeft.value = data.scrollLeft;
    contentWidth.value = data.scrollWidth;
  }

  async function refresh(): Promise<void> {
    if (disposed) return;
    invalidateMeasurement();
    const ticket = generation;
    const scrollTicket = scrollGeneration;
    try {
      await nextTick();
    } catch {
      if (!disposed && ticket === generation) clear();
      return;
    }
    if (disposed || ticket !== generation) return;

    await new Promise<void>((resolve) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = (results?: unknown): void => {
        if (settled) return;
        settled = true;
        if (timer !== undefined) clearTimeout(timer);
        if (cancelMeasurement === cancel) cancelMeasurement = undefined;
        if (!disposed && ticket === generation) {
          const viewport = Array.isArray(results) ? readRect(results[0]) : null;
          const content = Array.isArray(results) ? readRect(results[1]) : null;
          if (viewport && content) {
            viewportWidth.value = viewport.width;
            // 视口仍需要本次有效测量；已有更新的滚动事件时保留其位置和 scrollWidth。
            if (scrollTicket === scrollGeneration) {
              contentWidth.value = content.width;
              scrollLeft.value = viewport.left - content.left;
            }
          } else {
            clear();
          }
        }
        resolve();
      };
      const cancel = (): void => finish();
      cancelMeasurement = cancel;
      // 某些平台节点未就绪时不会回调；超时不显示遮罩，也不阻塞后续测量。
      timer = setTimeout(() => finish(), 500);
      try {
        const owner = component();
        if (!owner) {
          finish();
          return;
        }
        const query = uni.createSelectorQuery().in(owner);
        query.select(".facility-types__scroll").boundingClientRect();
        query.select(".facility-types__list").boundingClientRect();
        query.exec(finish);
      } catch {
        finish();
      }
    });
  }

  function dispose(): void {
    disposed = true;
    invalidateMeasurement();
    clear();
  }

  return { showLeftFade, showRightFade, onScroll, refresh, dispose };
}
