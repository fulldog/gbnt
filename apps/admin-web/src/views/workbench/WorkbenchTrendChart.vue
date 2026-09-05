<script setup lang="ts">
import { LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { init, use, type ECharts } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { computed, onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch } from "vue";
import type { WorkbenchTrendResult } from "@/api/workbench";

use([LineChart, CanvasRenderer, GridComponent, TooltipComponent]);
const { data } = defineProps<{ data: WorkbenchTrendResult }>();
const root = useTemplateRef<HTMLDivElement>("root");
const chart = shallowRef<ECharts | null>(null);
let observer: ResizeObserver | null = null;
const summary = computed(() => data.points.map((point) => `${point.period}：上报 ${point.reported} 条，完成整改 ${point.completed} 条`).join("；"));

function render(): void {
  chart.value?.setOption({
    animationDuration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 240,
    color: ["#015cbb", "#1a7f4b"],
    tooltip: { trigger: "axis", confine: true },
    grid: { left: 12, right: 18, top: 14, bottom: 10, containLabel: true },
    xAxis: {
      type: "category", boundaryGap: false,
      data: data.points.map((point) => data.granularity === "day" ? point.period.slice(5).replace("-", "/") : point.period),
      axisTick: { show: false }, axisLine: { lineStyle: { color: "#e2e8f0" } },
      axisLabel: { color: "#64748b", hideOverlap: true },
    },
    yAxis: { type: "value", min: 0, minInterval: 1, splitLine: { lineStyle: { type: "dashed", color: "#e8edf3" } } },
    series: [
      { name: "上报", type: "line", smooth: true, symbol: "circle", symbolSize: 6, data: data.points.map((p) => p.reported), lineStyle: { width: 3 }, areaStyle: { color: "rgba(1,92,187,0.09)" } },
      { name: "完成整改", type: "line", smooth: true, symbol: "diamond", symbolSize: 8, data: data.points.map((p) => p.completed), lineStyle: { width: 3, type: "dashed" }, areaStyle: { color: "rgba(26,127,75,0.08)" } },
    ],
  }, true);
}

onMounted(() => {
  if (!root.value) return;
  chart.value = init(root.value);
  render();
  observer = new ResizeObserver(() => chart.value?.resize());
  observer.observe(root.value);
});
watch(() => data, render);
onBeforeUnmount(() => { observer?.disconnect(); chart.value?.dispose(); });
</script>

<template>
  <div>
    <div ref="root" class="h-64 w-full" role="img" :aria-label="`整改趋势：${summary}`" />
    <p class="sr-only">{{ summary }}</p>
  </div>
</template>
