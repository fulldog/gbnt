<script setup lang="ts">
import { useRecoverableImage } from "./useRecoverableImage";

// 移除微信自定义组件的实体宿主，根节点才能直接继承父容器的明确高度。
defineOptions({ options: { virtualHost: true } });

type ImageMode = "scaleToFill" | "aspectFit" | "aspectFill" | "widthFix" | "heightFix" | "top" | "bottom" | "center" | "left" | "right" | "top left" | "top right" | "bottom left" | "bottom right";

const props = withDefaults(defineProps<{
  src: string;
  fallbackSrc?: string;
  mode?: ImageMode;
  alt?: string;
  lazyLoad?: boolean;
}>(), {
  fallbackSrc: "",
  mode: "aspectFill",
  alt: "照片",
  lazyLoad: true,
});

const emit = defineEmits<{
  preview: [url: string];
  retry: [];
}>();

const { failed, loaded, source, renderedImages, showingFallback, imageEvents, activate } = useRecoverableImage(
  () => props.src,
  () => props.fallbackSrc,
  (url) => emit("preview", url),
  () => emit("retry"),
);
</script>

<template>
  <button
    class="recoverable-image"
    :aria-label="failed ? `${alt}加载失败，点击重试` : !source ? `${alt}未提供` : `查看${alt}`"
    hover-class="recoverable-image--pressed"
    @tap.stop="activate"
  >
    <image
      v-for="image in renderedImages"
      :key="image.key"
      class="recoverable-image__image"
      :data-render-key="image.key"
      :src="image.src"
      :mode="mode"
      :lazy-load="lazyLoad"
      :aria-label="alt"
      @load="imageEvents.load"
      @error="imageEvents.error"
    />
    <view v-if="failed || !source" class="recoverable-image__placeholder">
      <text>{{ source ? "图片加载失败" : "暂无图片" }}</text>
      <text v-if="source" class="recoverable-image__retry">点击重试</text>
    </view>
    <view v-else-if="!loaded" class="recoverable-image__placeholder recoverable-image__placeholder--loading">
      <text>图片加载中…</text>
    </view>
    <text v-if="loaded && showingFallback" class="recoverable-image__fallback">本地预览</text>
  </button>
</template>

<style scoped lang="scss">
.recoverable-image {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  min-width: 44px;
  min-height: 44px;
  margin: 0;
  padding: 0;
  overflow: hidden;
  border: 0;
  border-radius: inherit;
  background: var(--gb-color-background);
  color: var(--gb-color-text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.recoverable-image::after { border: 0; }
.recoverable-image--pressed { opacity: 0.8; }
.recoverable-image__image { width: 100%; height: 100%; }

.recoverable-image__placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4px;
}

.recoverable-image__placeholder--loading { background: var(--gb-color-background); pointer-events: none; }
.recoverable-image__retry { margin-top: 4px; color: var(--gb-color-primary); }
.recoverable-image__fallback {
  position: absolute;
  right: 0;
  bottom: 0;
  padding: 1px 5px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 10px;
  pointer-events: none;
}
</style>
