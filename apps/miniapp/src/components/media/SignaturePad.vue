<script setup lang="ts">
import { getCurrentInstance, nextTick, onBeforeUnmount, onMounted, shallowRef, watch } from "vue";
import { onHide } from "@dcloudio/uni-app";
import type { ReportFormState } from "@/domain/issues/form";

type Point = { x: number; y: number };
type Strokes = ReportFormState["signatureStrokes"];
interface TouchEventLike { touches: ArrayLike<{ x?: number; y?: number; clientX?: number; clientY?: number }> }
const props = withDefaults(defineProps<{ disabled?: boolean; active?: boolean; strokes?: Strokes }>(), { disabled: false, active: true, strokes: () => [] });
const emit = defineEmits<{ cleared: []; changed: []; "update:strokes": [strokes: Strokes] }>();
const canvasId = "report-signature-canvas";
const instance = getCurrentInstance();
const ready = shallowRef(false);
const hasInk = shallowRef(props.strokes.some((stroke) => stroke.length > 0));
let context: UniApp.CanvasContext | null = null;
let strokes: Strokes = JSON.parse(JSON.stringify(props.strokes));
let current: Point[] | null = null;
let rect = { left: 0, top: 0, width: 320, height: 480 };
let revision = 0;
let disposed = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let cancelExport: (() => void) | null = null;

function commit(reserve: boolean): void {
  context?.draw(reserve);
}
function strokeStyle(): void {
  context!.setStrokeStyle("#1a1a1a"); context!.setLineWidth(2.5);
  context!.setLineCap("round"); context!.setLineJoin("round");
}
function drawPaper(): void {
  const ctx = context!;
  ctx.setFillStyle("#faf3dc"); ctx.fillRect(0, 0, rect.width, rect.height);
  ctx.setStrokeStyle("rgba(154,132,78,0.32)"); ctx.setLineWidth(1); ctx.setLineDash([5, 7], 0);
  for (let y = 40; y < rect.height - 12; y += 40) {
    ctx.beginPath(); ctx.moveTo(14, y); ctx.lineTo(rect.width - 14, y); ctx.stroke();
  }
  ctx.setLineDash([], 0); ctx.setStrokeStyle("rgba(196,170,102,0.45)");
  ctx.beginPath(); ctx.moveTo(14, 28); ctx.lineTo(rect.width - 14, 28); ctx.stroke();
}
function drawPoint(point: Point, previous?: Point): void {
  const ctx = context!;
  strokeStyle(); ctx.beginPath();
  if (previous) {
    ctx.moveTo(previous.x * rect.width, previous.y * rect.height);
    ctx.lineTo(point.x * rect.width, point.y * rect.height); ctx.stroke();
  } else {
    ctx.setFillStyle("#1a1a1a"); ctx.arc(point.x * rect.width, point.y * rect.height, 1.25, 0, Math.PI * 2); ctx.fill();
  }
}
function redraw(): void {
  if (!context || disposed) return;
  drawPaper();
  for (const stroke of strokes) stroke.forEach((point, index) => drawPoint(point, stroke[index - 1]));
  commit(false);
}
async function measure(): Promise<void> {
  await nextTick();
  if (disposed || !props.active) return;
  uni.createSelectorQuery().in(instance?.proxy).select(`#${canvasId}`).boundingClientRect((value) => {
    if (disposed || !value || Array.isArray(value) || !value.width || !value.height) return;
    rect = { left: value.left ?? 0, top: value.top ?? 0, width: value.width, height: value.height };
    void redraw();
  }).exec();
}
function point(event: TouchEventLike): Point | null {
  const touch = event.touches[0];
  if (!touch) return null;
  const x = touch.x ?? (touch.clientX === undefined ? NaN : touch.clientX - rect.left);
  const y = touch.y ?? (touch.clientY === undefined ? NaN : touch.clientY - rect.top);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: Math.min(1, Math.max(0, x / rect.width)), y: Math.min(1, Math.max(0, y / rect.height)) };
}
function flush(): void {
  if (timer !== undefined) clearTimeout(timer);
  timer = undefined;
  void commit(true);
}
function schedule(): void { if (timer === undefined) timer = setTimeout(flush, 16); }
function start(event: TouchEventLike): void {
  if (props.disabled || !props.active || !context) return;
  const next = point(event); if (!next) return;
  current = [next]; strokes.push(current); revision += 1;
  hasInk.value = true; emit("changed"); drawPoint(next); schedule();
}
function move(event: TouchEventLike): void {
  if (props.disabled || !current || !context) return;
  const next = point(event); if (!next) return;
  drawPoint(next, current[current.length - 1]); current.push(next); revision += 1; schedule();
}
function end(): void {
  if (!current) return;
  current = null; flush();
  emit("update:strokes", JSON.parse(JSON.stringify(strokes)) as Strokes);
}
function clear(): void {
  if (props.disabled) return;
  current = null; strokes = []; revision += 1; hasInk.value = false;
  if (timer !== undefined) clearTimeout(timer); timer = undefined;
  void redraw(); emit("update:strokes", []); emit("cleared");
}
async function exportPng(): Promise<{ filePath: string; revision: number }> {
  end();
  if (!ready.value || !context || !hasInk.value || disposed || !props.active) throw new Error("请先完成电子签名");
  if (cancelExport) throw new Error("签名正在导出，请稍候");
  const ctx = context;
  const exportedRevision = revision;
  const ratio = Math.min(uni.getSystemInfoSync().pixelRatio || 1, 3);
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => finish(new Error("签名导出超时，请重试，已填写内容已保留")), 10_000);
    function finish(error?: Error, filePath?: string): void {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      cancelExport = null;
      if (error) reject(error);
      else resolve({ filePath: filePath!, revision: exportedRevision });
    }
    cancelExport = () => finish(new Error("签名导出已取消，请重试"));
    try {
      // 提交时从完整笔迹重绘一帧，只等待这一帧；不累计等待书写过程的历史回调。
      drawPaper();
      for (const stroke of strokes) stroke.forEach((point, index) => drawPoint(point, stroke[index - 1]));
      ctx.draw(false, () => {
        if (settled) return;
        if (disposed || !props.active || revision !== exportedRevision) {
          finish(new Error("签名已变更，请重试"));
          return;
        }
        try {
          uni.canvasToTempFilePath({
            canvasId, fileType: "png", quality: 1, destWidth: Math.round(rect.width * ratio), destHeight: Math.round(rect.height * ratio),
            success: (result) => {
              if (revision !== exportedRevision) finish(new Error("签名已变更，请重试"));
              else if (!result.tempFilePath) finish(new Error("签名图片生成失败，请重试"));
              else finish(undefined, result.tempFilePath);
            },
            fail: (error) => finish(new Error(error.errMsg || "签名导出失败")),
          }, instance?.proxy);
        } catch (error) { finish(error instanceof Error ? error : new Error("签名导出失败")); }
      });
    } catch (error) { finish(error instanceof Error ? error : new Error("签名绘制失败")); }
  });
}
function getRevision(): number { return revision; }
watch(() => props.strokes, (value) => {
  if (JSON.stringify(value) === JSON.stringify(strokes)) return;
  strokes = JSON.parse(JSON.stringify(value)); current = null; revision += 1;
  hasInk.value = strokes.some((stroke) => stroke.length > 0); void redraw();
});
watch(() => props.active, (value) => { if (value) void measure(); else { end(); cancelExport?.(); } });
onMounted(() => { context = uni.createCanvasContext(canvasId, instance?.proxy); ready.value = true; void measure(); });
onHide(() => { end(); cancelExport?.(); });
onBeforeUnmount(() => { end(); disposed = true; cancelExport?.(); if (timer !== undefined) clearTimeout(timer); });
defineExpose({ clear, exportPng, getRevision, hasInk });
</script>

<template>
  <view class="signature-pad">
    <text class="signature-pad__title">电子签名：</text>
    <view class="signature-pad__board">
      <canvas :canvas-id="canvasId" :id="canvasId" class="signature-pad__canvas" disable-scroll aria-label="宣纸电子签名区域"
        @touchstart="start" @touchmove="move" @touchend="end" @touchcancel="end" />
      <button class="signature-pad__clear" :disabled="disabled" @tap="clear">清空</button>
    </view>
  </view>
</template>

<style scoped lang="scss">
.signature-pad { margin: 12px 16px; }
.signature-pad__title { display: block; margin-bottom: 12px; color: var(--color-text); font-size: 24px; font-weight: 600; line-height: 1.35; }
.signature-pad__board { position: relative; overflow: hidden; border: 1px solid #e5d4a8; border-radius: 8px; background: #faf3dc; box-shadow: inset 0 1px 0 rgba(255,255,255,.65); }
.signature-pad__canvas { display: block; width: 100%; height: 480px; }
.signature-pad__clear { position: absolute; right: 10px; bottom: 10px; z-index: 2; height: 36px; margin: 0; padding: 0 16px; border: 1px solid #d9d9d9; border-radius: 6px; background: rgba(255,255,255,.92); color: var(--color-text); font-size: 14px; line-height: 34px; }
.signature-pad__clear::after { border: 0; }
</style>
