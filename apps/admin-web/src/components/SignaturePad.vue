<script setup lang="ts">
import { computed, shallowRef, useTemplateRef } from "vue";

const { disabled = false } = defineProps<{ disabled?: boolean }>();
const canvas = useTemplateRef<HTMLCanvasElement>("canvas");
const drawing = shallowRef(false);
const empty = shallowRef(true);

const cursorClass = computed(() => (disabled ? "cursor-not-allowed" : "cursor-crosshair"));

function point(event: PointerEvent): { x: number; y: number } | null {
  if (!canvas.value) return null;
  const rect = canvas.value.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * canvas.value.width,
    y: ((event.clientY - rect.top) / rect.height) * canvas.value.height,
  };
}

function start(event: PointerEvent): void {
  if (disabled || !canvas.value) return;
  const current = point(event);
  if (!current) return;
  canvas.value.setPointerCapture(event.pointerId);
  const context = canvas.value.getContext("2d");
  if (!context) return;
  context.beginPath();
  context.moveTo(current.x, current.y);
  drawing.value = true;
}

function draw(event: PointerEvent): void {
  if (!drawing.value || !canvas.value) return;
  const current = point(event);
  const context = canvas.value.getContext("2d");
  if (!current || !context) return;
  context.strokeStyle = "#152033";
  context.lineWidth = 4;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineTo(current.x, current.y);
  context.stroke();
  empty.value = false;
}

function stop(event: PointerEvent): void {
  if (canvas.value?.hasPointerCapture(event.pointerId)) {
    canvas.value.releasePointerCapture(event.pointerId);
  }
  drawing.value = false;
}

function clear(): void {
  const context = canvas.value?.getContext("2d");
  if (!context || !canvas.value) return;
  context.clearRect(0, 0, canvas.value.width, canvas.value.height);
  empty.value = true;
}

function toBlob(): Promise<Blob> {
  if (!canvas.value || empty.value) return Promise.reject(new Error("请完成电子签名"));
  return new Promise((resolve, reject) => {
    canvas.value?.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("无法生成签名图片"));
    }, "image/png");
  });
}

defineExpose({ clear, empty, toBlob });
</script>

<template>
  <div class="space-y-2">
    <canvas
      ref="canvas"
      width="900"
      height="240"
      :class="cursorClass"
      class="block h-40 w-full touch-none rounded-md border border-dashed border-slate-300 bg-white"
      aria-label="电子签名画布"
      @pointerdown="start"
      @pointermove="draw"
      @pointerup="stop"
      @pointercancel="stop"
      @pointerleave="stop"
    />
    <div class="flex items-center justify-between gap-3">
      <span class="text-xs text-slate-500">请使用鼠标或触控设备在上方签名。</span>
      <ElButton v-if="!disabled" size="small" @click="clear">清空签名</ElButton>
    </div>
  </div>
</template>
