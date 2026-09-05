import { computed, shallowRef, watch } from "vue";

/** 使用原生 image 节点的 dataset，不能用回调执行时的最新渲染状态代替事件来源。 */
export interface RecoverableImageEvent {
  currentTarget?: { dataset?: { renderKey?: unknown } };
}

/** 图片加载仅在组件内部恢复，不改变业务附件地址或已上传状态。 */
export function useRecoverableImage(
  getSource: () => string,
  getFallback: () => string,
  onPreview: (url: string) => void,
  onRetry: () => void,
) {
  const useFallback = shallowRef(false);
  const failed = shallowRef(false);
  const loaded = shallowRef(false);
  const attempt = shallowRef(0);
  const source = computed(() => useFallback.value ? getFallback() : getSource() || getFallback());
  const renderKey = computed(() => `${attempt.value}:${source.value}`);
  const showingFallback = computed(() => Boolean(source.value && source.value === getFallback() && getSource() !== getFallback()));
  // 微信只有列表的 key 才编译成 wx:key；单元素列表确保重试时真正重建原生 image。
  const renderedImages = computed(() => source.value && !failed.value
    ? [{ key: renderKey.value, src: source.value }]
    : []);

  watch(() => [getSource(), getFallback()], () => {
    useFallback.value = false;
    failed.value = false;
    loaded.value = false;
    attempt.value += 1;
  }, { flush: "sync" });

  // 编译后的事件代理可能调用最新回调，必须同时校验事件携带的原生节点 key。
  const imageEvents = computed(() => {
    const key = renderKey.value;
    const isCurrentEvent = (event: RecoverableImageEvent) => Boolean(
      source.value && !failed.value && key === renderKey.value
      && event?.currentTarget?.dataset?.renderKey === key,
    );
    return {
      load: (event: RecoverableImageEvent) => {
        if (isCurrentEvent(event)) loaded.value = true;
      },
      error: (event: RecoverableImageEvent) => {
        if (!isCurrentEvent(event)) return;
        loaded.value = false;
        if (!useFallback.value && getFallback() && getFallback() !== source.value) {
          useFallback.value = true;
        } else {
          failed.value = true;
        }
      },
    };
  });

  function activate(): void {
    if (!source.value) return;
    if (failed.value) {
      useFallback.value = false;
      failed.value = false;
      loaded.value = false;
      // 重建 image，不追加参数，避免破坏签名地址或本地临时文件路径。
      attempt.value += 1;
      onRetry();
    } else if (loaded.value) {
      onPreview(source.value);
    }
  }

  return { failed, loaded, source, renderKey, renderedImages, showingFallback, imageEvents, activate };
}
