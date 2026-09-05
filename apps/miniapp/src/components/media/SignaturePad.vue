<script setup lang="ts">
import { getCurrentInstance, onMounted, shallowRef } from "vue";

interface TouchPoint {
  x?: number;
  y?: number;
  clientX?: number;
  clientY?: number;
}

interface TouchEventLike {
  touches: ArrayLike<TouchPoint>;
}

interface SignatureExport {
  filePath: string;
  revision: number;
}

const props = withDefaults(defineProps<{ disabled?: boolean }>(), { disabled: false });

const emit = defineEmits<{
  cleared: [];
  changed: [];
}>();

const canvasId = "report-signature-canvas";
const instance = getCurrentInstance();
const ready = shallowRef(false);
const hasInk = shallowRef(false);
let context: UniApp.CanvasContext | null = null;
let lastPoint: { x: number; y: number } | null = null;
let strokeChanged = false;
let contentRevision = 0;
let pendingDraws: Promise<void> = Promise.resolve();

function commitDraw(reserve: boolean): Promise<void> {
  const currentContext = context;
  if (!currentContext) {
    return Promise.resolve();
  }

  const drawDone = new Promise<void>((resolve) => {
    currentContext.draw(reserve, () => resolve());
  });
  pendingDraws = Promise.all([pendingDraws, drawDone]).then(() => undefined);
  return drawDone;
}

async function waitForPendingDraws(): Promise<void> {
  while (true) {
    const currentPendingDraws = pendingDraws;
    await currentPendingDraws;
    if (currentPendingDraws === pendingDraws) {
      return;
    }
  }
}

function pointFromEvent(event: TouchEventLike): { x: number; y: number } | null {
  const touch = event.touches[0];
  if (!touch) {
    return null;
  }
  const x = touch.x ?? touch.clientX;
  const y = touch.y ?? touch.clientY;
  if (x === undefined || y === undefined) {
    return null;
  }
  return { x, y };
}

function start(event: TouchEventLike): void {
  if (props.disabled) return;
  lastPoint = pointFromEvent(event);
  strokeChanged = false;
}

function move(event: TouchEventLike): void {
  if (props.disabled) return;
  const nextPoint = pointFromEvent(event);
  if (!context || !lastPoint || !nextPoint) {
    return;
  }
  context.beginPath();
  context.setStrokeStyle("#172033");
  context.setLineWidth(3);
  context.setLineCap("round");
  context.setLineJoin("round");
  context.moveTo(lastPoint.x, lastPoint.y);
  context.lineTo(nextPoint.x, nextPoint.y);
  context.stroke();
  contentRevision += 1;
  void commitDraw(true);
  lastPoint = nextPoint;
  hasInk.value = true;
  if (!strokeChanged) {
    strokeChanged = true;
    emit("changed");
  }
}

function end(): void {
  lastPoint = null;
  strokeChanged = false;
}

function clear(): void {
  context?.clearRect(0, 0, 1000, 500);
  contentRevision += 1;
  void commitDraw(false);
  lastPoint = null;
  strokeChanged = false;
  hasInk.value = false;
  emit("cleared");
}

async function exportPng(): Promise<SignatureExport> {
  if (!hasInk.value) {
    throw new Error("请先完成电子签名");
  }

  await waitForPendingDraws();
  if (!hasInk.value) {
    throw new Error("请先完成电子签名");
  }

  const revision = contentRevision;
  return new Promise((resolve, reject) => {
    uni.canvasToTempFilePath(
      {
        canvasId,
        fileType: "png",
        quality: 1,
        success: (result) => resolve({ filePath: result.tempFilePath, revision }),
        fail: (error) => reject(new Error(error.errMsg || "签名导出失败")),
      },
      instance?.proxy,
    );
  });
}

function getRevision(): number {
  return contentRevision;
}

onMounted(() => {
  context = uni.createCanvasContext(canvasId, instance?.proxy);
  ready.value = true;
});

defineExpose({
  clear,
  exportPng,
  getRevision,
  hasInk,
});
</script>

<template>
  <view class="signature-pad">
    <view class="signature-pad__head">
      <view>
        <text class="signature-pad__title">排查人电子签名</text>
        <text class="signature-pad__required">必填</text>
      </view>
      <button class="signature-pad__clear" :disabled="disabled" @tap="clear">清空重签</button>
    </view>
    <canvas
      :canvas-id="canvasId"
      :id="canvasId"
      class="signature-pad__canvas"
      disable-scroll
      aria-label="电子签名区域"
      @touchstart="start"
      @touchmove="move"
      @touchend="end"
      @touchcancel="end"
    />
    <text class="signature-pad__hint">
      {{ ready ? "请在上方空白区域签名" : "签名板加载中…" }}
    </text>
  </view>
</template>

<style scoped lang="scss">
.signature-pad {
  overflow: hidden;
  background: var(--color-surface);
  border: 2rpx solid var(--color-border);
  border-radius: var(--radius-lg);
}

.signature-pad__head {
  display: flex;
  min-height: 88rpx;
  padding: 0 24rpx;
  border-bottom: 2rpx solid var(--color-border);
  align-items: center;
  justify-content: space-between;
}

.signature-pad__title {
  color: var(--color-text);
  font-size: 28rpx;
  font-weight: 600;
}

.signature-pad__required {
  margin-left: 12rpx;
  color: var(--color-danger);
  font-size: 24rpx;
}

.signature-pad__clear {
  min-height: 72rpx;
  margin: 0;
  padding: 0 16rpx;
  color: var(--color-primary);
  font-size: 26rpx;
  line-height: 72rpx;
  background: transparent;
  border: 0;
}

.signature-pad__clear::after {
  border: 0;
}

.signature-pad__canvas {
  width: 100%;
  height: 320rpx;
  background-color: #fff;
  background-image: linear-gradient(
    to bottom,
    transparent calc(100% - 2rpx),
    #e2e8f0 calc(100% - 2rpx)
  );
  background-size: 100% 80rpx;
}

.signature-pad__hint {
  display: block;
  padding: 16rpx 24rpx;
  color: var(--color-text-tertiary);
  font-size: 24rpx;
  line-height: 1.5;
  text-align: center;
}
</style>
