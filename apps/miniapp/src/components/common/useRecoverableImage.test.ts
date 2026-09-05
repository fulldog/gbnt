import { reactive } from "vue";
import { describe, expect, it, vi } from "vitest";
import { useRecoverableImage, type RecoverableImageEvent } from "./useRecoverableImage";

function nativeImageEvent(key: string): RecoverableImageEvent {
  return { currentTarget: { dataset: { renderKey: key } } };
}

function imageState(src = "https://example.test/photo?signature=keep", fallback = "wxfile://local-photo") {
  const props = reactive({ src, fallback });
  const preview = vi.fn();
  const retry = vi.fn();
  return {
    props, preview, retry,
    ...useRecoverableImage(() => props.src, () => props.fallback, preview, retry),
  };
}

describe("图片失败恢复与预览", () => {
  it("远端失败自动切换本地预览，预览使用实际加载成功的地址", () => {
    const image = imageState();
    image.activate();
    expect(image.preview).not.toHaveBeenCalled();
    image.imageEvents.value.error(nativeImageEvent(image.renderKey.value));
    expect(image.source.value).toBe("wxfile://local-photo");
    expect(image.failed.value).toBe(false);
    image.imageEvents.value.load(nativeImageEvent(image.renderKey.value));
    image.activate();
    expect(image.showingFallback.value).toBe(true);
    expect(image.preview).toHaveBeenCalledWith("wxfile://local-photo");
  });

  it("两处均失败时点击仅重试，不触发预览；不篡改签名URL", () => {
    const image = imageState();
    const firstKey = image.renderKey.value;
    image.imageEvents.value.error(nativeImageEvent(image.renderKey.value));
    image.imageEvents.value.error(nativeImageEvent(image.renderKey.value));
    expect(image.failed.value).toBe(true);
    image.activate();
    expect(image.failed.value).toBe(false);
    expect(image.source.value).toBe("https://example.test/photo?signature=keep");
    expect(image.renderKey.value).not.toBe(firstKey);
    expect(image.retry).toHaveBeenCalledTimes(1);
    expect(image.preview).not.toHaveBeenCalled();
  });

  it("没有本地备用时可直接重试，地址相同不会反复切换备用", () => {
    const image = imageState("one", "one");
    image.imageEvents.value.error(nativeImageEvent(image.renderKey.value));
    expect(image.failed.value).toBe(true);
    image.activate();
    expect(image.source.value).toBe("one");
    expect(image.retry).toHaveBeenCalledTimes(1);
  });

  it("换图后旧图片成功、失败事件均不能污染新图片", () => {
    const image = imageState();
    const oldEvents = image.imageEvents.value;
    const oldEvent = nativeImageEvent(image.renderKey.value);
    image.props.src = "new-url";
    oldEvents.load(oldEvent);
    oldEvents.error(oldEvent);
    // 小程序事件代理读取最新回调时，仍须按旧节点 dataset 拒绝迟到事件。
    image.imageEvents.value.load(oldEvent);
    image.imageEvents.value.error(oldEvent);
    expect(image.source.value).toBe("new-url");
    expect(image.loaded.value).toBe(false);
    expect(image.failed.value).toBe(false);
    image.imageEvents.value.load(nativeImageEvent(image.renderKey.value));
    expect(image.loaded.value).toBe(true);
  });

  it("本地备用失效后恢复远端重试，旧的备用失败事件被忽略", () => {
    const image = imageState();
    image.imageEvents.value.error(nativeImageEvent(image.renderKey.value));
    const oldFallback = image.imageEvents.value;
    const oldEvent = nativeImageEvent(image.renderKey.value);
    oldFallback.error(oldEvent);
    image.activate();
    oldFallback.error(oldEvent);
    image.imageEvents.value.load(oldEvent);
    image.imageEvents.value.error(oldEvent);
    expect(image.failed.value).toBe(false);
    expect(image.source.value).toBe(image.props.src);
    expect(image.loaded.value).toBe(false);
  });

  it("拒绝缺失或错误 dataset 的事件，避免误用最新渲染 key", () => {
    const image = imageState();
    const invalidEvents: RecoverableImageEvent[] = [
      {}, { currentTarget: {} }, { currentTarget: { dataset: {} } },
      { currentTarget: { dataset: { renderKey: 0 } } }, nativeImageEvent("old-image"),
    ];
    for (const event of invalidEvents) {
      image.imageEvents.value.load(event);
      image.imageEvents.value.error(event);
    }
    expect(image.loaded.value).toBe(false);
    expect(image.failed.value).toBe(false);
    expect(image.source.value).toBe(image.props.src);
  });

  it("原生节点列表在备用、失败、重试间使用新 key，并忽略已移除节点事件", () => {
    const image = imageState();
    const firstNode = image.renderedImages.value[0]!;
    expect(firstNode).toEqual({ key: image.renderKey.value, src: image.props.src });
    image.imageEvents.value.error(nativeImageEvent(firstNode.key));
    const fallbackNode = image.renderedImages.value[0]!;
    expect(fallbackNode.key).not.toBe(firstNode.key);
    expect(fallbackNode.src).toBe(image.props.fallback);
    image.imageEvents.value.error(nativeImageEvent(fallbackNode.key));
    expect(image.renderedImages.value).toEqual([]);
    image.imageEvents.value.load(nativeImageEvent(fallbackNode.key));
    expect(image.loaded.value).toBe(false);
    image.activate();
    expect(image.renderedImages.value[0]!.key).not.toBe(firstNode.key);
    expect(image.renderedImages.value[0]!.src).toBe(firstNode.src);
  });

  it("无图片时不发起无效预览或重试", () => {
    const image = imageState("", "");
    expect(image.renderedImages.value).toEqual([]);
    image.activate();
    expect(image.preview).not.toHaveBeenCalled();
    expect(image.retry).not.toHaveBeenCalled();
  });
});
