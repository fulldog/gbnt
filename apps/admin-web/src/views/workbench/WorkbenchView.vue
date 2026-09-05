<script setup lang="ts">
import type { WorkbenchStats } from "@gbnt/api-client";
import { CircleCheck, Clock, DataLine, Refresh, Warning } from "@element-plus/icons-vue";
import type { Component } from "vue";
import { computed, onMounted, shallowRef } from "vue";
import { useAdminApi } from "@/api/runtime";
import type { WorkbenchTodoResult, WorkbenchTrendRange, WorkbenchTrendResult } from "@/api/workbench";
import AsyncError from "@/components/AsyncError.vue";
import PageHeader from "@/components/PageHeader.vue";
import { useLatestQuery } from "@/composables/useLatestQuery";
import { ISSUE_TYPE_LABELS } from "@/constants/issue";
import { formatNumber, formatPercent } from "@/utils/format";
import WorkbenchTrendChart from "./WorkbenchTrendChart.vue";
import WorkbenchTodos from "./WorkbenchTodos.vue";

interface MetricCard {
  title: string;
  value: string;
  hint: string;
  icon: Component;
  tone: string;
}

const api = useAdminApi();
const range = shallowRef<WorkbenchTrendRange>("week7");
const ranges: Array<{ label: string; value: WorkbenchTrendRange }> = [
  { label: "近七天", value: "week7" }, { label: "近一个月", value: "month1" },
  { label: "近半年", value: "halfyear" }, { label: "全部", value: "all" },
];
const todoPage = shallowRef(1);
const { data: stats, loading, loadError, run: load } = useLatestQuery<WorkbenchStats | null>({
  initial: () => null,
  load: () => api.workbench.getStats(),
  errorMessage: "工作台数据加载失败",
});
const { data: trend, loading: trendLoading, loadError: trendError, run: loadTrend } = useLatestQuery<WorkbenchTrendResult | null>({
  initial: () => null, load: () => api.workbench.getTrend(range.value), errorMessage: "整改趋势加载失败",
});
const { data: todos, loading: todoLoading, loadError: todoError, run: loadTodos } = useLatestQuery<WorkbenchTodoResult | null>({
  initial: () => null, load: () => api.workbench.getTodos({ page: todoPage.value, size: 20 }), errorMessage: "待办列表加载失败",
});
const ranking = computed(() => stats.value ? Object.entries(ISSUE_TYPE_LABELS)
  .map(([type, label]) => ({ type, label, total: stats.value!.by_type[type as keyof WorkbenchStats["by_type"]] }))
  .sort((a, b) => b.total - a.total) : []);
const refreshing = computed(() => loading.value || trendLoading.value || todoLoading.value);
const emptyTrend = computed(() => trend.value?.points.every((point) => point.reported === 0 && point.completed === 0));

function changeRange(value: WorkbenchTrendRange): void { range.value = value; void loadTrend(); }
function changePage(value: number): void { todoPage.value = value; void loadTodos(); }
function refreshAll(): void { void load(); void loadTrend(); void loadTodos(); }

const cards = computed<MetricCard[]>(() => {
  const value = stats.value;
  if (!value) return [];
  return [
    { title: "排查记录", value: formatNumber(value.total), hint: "当前全部记录", icon: DataLine, tone: "blue" },
    { title: "待整改", value: formatNumber(value.new), hint: "尚未完成任何分项整改", icon: Warning, tone: "red" },
    { title: "整改中", value: formatNumber(value.pending), hint: "处理中，包含重新整改", icon: Clock, tone: "amber" },
    { title: "已整改", value: formatNumber(value.done), hint: "包含无需整改的正常排查", icon: CircleCheck, tone: "green" },
    { title: "完成率", value: formatPercent(value.complete_rate), hint: "已整改 / 全部", icon: CircleCheck, tone: "violet" },
  ];
});

function toneClasses(tone: string): string {
  return {
    blue: "bg-blue-50 text-blue-700",
    red: "bg-red-50 text-red-700",
    amber: "bg-amber-50 text-amber-700",
    green: "bg-emerald-50 text-emerald-700",
    violet: "bg-violet-50 text-violet-700",
  }[tone] ?? "bg-slate-50 text-slate-700";
}

onMounted(refreshAll);
</script>

<template>
  <div class="space-y-4">
    <PageHeader title="工作台" description="排查整改概览、整改趋势与待办任务。">
      <template #actions>
        <ElButton :icon="Refresh" :loading="refreshing" @click="refreshAll">刷新数据</ElButton>
      </template>
    </PageHeader>

    <AsyncError v-if="loadError" :message="loadError" @retry="load" />

    <div v-if="loading && !stats" class="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <div v-for="index in 5" :key="index" class="page-card p-5">
        <ElSkeleton :rows="2" animated />
      </div>
    </div>

    <template v-else-if="stats">
      <section class="grid gap-4 sm:grid-cols-2 xl:grid-cols-5" aria-label="核心指标">
        <article v-for="card in cards" :key="card.title" class="page-card flex items-start justify-between gap-4 p-5">
          <div>
            <p class="m-0 text-sm text-slate-500">{{ card.title }}</p>
            <strong class="numeric mt-3 block text-3xl font-semibold tracking-tight text-slate-900">{{ card.value }}</strong>
            <p class="mt-2 mb-0 text-xs text-slate-500">{{ card.hint }}</p>
          </div>
          <span :class="toneClasses(card.tone)" class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl">
            <ElIcon :size="22"><component :is="card.icon" /></ElIcon>
          </span>
        </article>
      </section>

    </template>

    <ElEmpty v-else-if="!loadError" description="暂无工作台数据" />

    <section class="page-card overflow-hidden" aria-labelledby="workbench-trend-title">
      <header class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
        <h2 id="workbench-trend-title" class="m-0 self-stretch border-b-2 border-blue-700 py-2 text-base font-semibold text-blue-700">整改趋势</h2>
        <div class="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1" role="group" aria-label="趋势时间范围">
          <button v-for="item in ranges" :key="item.value" type="button" class="range-button" :class="{ active: range === item.value }" :aria-pressed="range === item.value" @click="changeRange(item.value)">{{ item.label }}</button>
        </div>
      </header>
      <div class="trend-grid">
        <div class="min-w-0 p-5">
          <div class="mb-3 flex items-center justify-between gap-3"><h3 class="m-0 text-sm font-semibold">整改趋势</h3><div class="flex gap-4 text-xs text-slate-600"><span><i class="legend-dot bg-blue-700" />上报</span><span><i class="legend-dot legend-dot--completed bg-green-700" />完成整改</span></div></div>
          <AsyncError v-if="trendError" :message="trendError" @retry="loadTrend" />
          <ElSkeleton v-else-if="trendLoading" :rows="6" animated />
          <template v-else-if="trend">
            <WorkbenchTrendChart :data="trend" />
            <p v-if="emptyTrend" class="my-1 text-center text-xs text-slate-500">所选时段暂无上报或有完成日期的整改记录</p>
            <p class="mt-3 mb-0 text-xs leading-5 text-slate-500">北京时间：上报按创建时间；完成整改按当前已完成问题、本轮最后一条整改记录时间统计。</p>
            <p v-if="trend.undated_completed" class="mt-1 mb-0 text-xs leading-5 text-amber-700">{{ trend.undated_completed }} 条已完成状态记录缺少本轮整改记录（可能为无问题排查或历史记录），未计入完成曲线。</p>
          </template>
        </div>
        <aside class="rank-panel min-w-0 p-5" aria-label="问题类型分布">
          <h3 class="m-0 text-sm font-semibold">类型排行</h3><p class="mt-1 text-xs text-slate-500">按排查记录数量排序 · 全部时间</p>
          <ElSkeleton v-if="loading" :rows="5" animated />
          <p v-else-if="loadError" class="text-sm text-slate-500">类型统计加载失败，请使用上方重试。</p>
          <ol v-else-if="stats" class="m-0 grid list-none gap-2 p-0" aria-label="类型排行列表">
            <li v-for="(item, index) in ranking" :key="item.type" class="flex min-h-10 items-center gap-3 border-b border-slate-100 py-2 text-sm"><span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs" :class="{ 'bg-blue-700! text-white': index < 3 }">{{ index + 1 }}</span><span class="flex-1">{{ item.label }}</span><strong class="numeric font-semibold">{{ formatNumber(item.total) }}</strong></li>
          </ol>
        </aside>
      </div>
    </section>
    <WorkbenchTodos :data="todos" :loading="todoLoading" :error="todoError" @retry="loadTodos" @page="changePage" />
  </div>
</template>

<style scoped>
.trend-grid { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(280px, 0.85fr); }
.rank-panel { border-left: 1px solid #f1f5f9; }
.range-button { min-height: 30px; padding: 4px 12px; border: 0; border-radius: 6px; background: transparent; color: #475569; cursor: pointer; font: inherit; font-size: 13px; }
.range-button.active { background: #fff; color: #015cbb; font-weight: 600; box-shadow: 0 1px 3px #0f172a0d; }
.range-button:focus-visible { outline: 2px solid #015cbb; outline-offset: 2px; }
.legend-dot { display: inline-block; width: 8px; height: 8px; margin-right: 6px; border-radius: 50%; }
.legend-dot--completed { border-radius: 0; transform: rotate(45deg); }
@media (max-width: 1000px) { .trend-grid { grid-template-columns: minmax(0, 1fr); } .rank-panel { border-left: 0; border-top: 1px solid #f1f5f9; } }
</style>
