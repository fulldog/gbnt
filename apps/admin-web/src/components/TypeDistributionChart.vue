<script setup lang="ts">
import type { IssueType } from "@gbnt/api-client";
import { BarChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { init, use } from "echarts/core";
import type { ECharts } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { computed, nextTick, onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch } from "vue";
import { ISSUE_TYPE_LABELS } from "@/constants/issue";

use([BarChart, CanvasRenderer, GridComponent, TooltipComponent]);

const { data } = defineProps<{ data: Record<IssueType, number> }>();
const root = useTemplateRef<HTMLDivElement>("root");
const chart = shallowRef<ECharts | null>(null);
let observer: ResizeObserver | null = null;

const entries = computed(() =>
  (Object.entries(data) as Array<[IssueType, number]>).sort((a, b) => b[1] - a[1]),
);

const summary = computed(() =>
  entries.value.map(([type, value]) => `${ISSUE_TYPE_LABELS[type]} ${value} 条`).join("，"),
);

function render(): void {
  chart.value?.setOption({
    animationDuration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 240,
    grid: { left: 20, right: 24, top: 8, bottom: 8, containLabel: true },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    xAxis: { type: "value", minInterval: 1, splitLine: { lineStyle: { color: "#e8edf3" } } },
    yAxis: {
      type: "category",
      data: entries.value.map(([type]) => ISSUE_TYPE_LABELS[type]),
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [
      {
        type: "bar",
        data: entries.value.map(([, value]) => value),
        barMaxWidth: 28,
        itemStyle: { color: "#015cbb", borderRadius: [0, 4, 4, 0] },
        label: { show: true, position: "right", color: "#344054" },
      },
    ],
  });
}

onMounted(async () => {
  await nextTick();
  if (!root.value) return;
  chart.value = init(root.value);
  render();
  observer = new ResizeObserver(() => chart.value?.resize());
  observer.observe(root.value);
});

watch(entries, render, { deep: true });

onBeforeUnmount(() => {
  observer?.disconnect();
  chart.value?.dispose();
});
</script>

<template>
  <div>
    <div ref="root" class="h-72 w-full" role="img" :aria-label="`问题类型分布：${summary}`" />
    <p class="sr-only">{{ summary }}</p>
  </div>
</template>
