<script setup lang="ts">
import type { WorkbenchStats } from "@gbnt/api-client";
import { CircleCheck, Clock, DataLine, Refresh, Warning } from "@element-plus/icons-vue";
import type { Component } from "vue";
import { computed, onMounted } from "vue";
import { useAdminApi } from "@/api/runtime";
import AsyncError from "@/components/AsyncError.vue";
import PageHeader from "@/components/PageHeader.vue";
import TypeDistributionChart from "@/components/TypeDistributionChart.vue";
import { useLatestQuery } from "@/composables/useLatestQuery";
import { formatNumber, formatPercent } from "@/utils/format";

interface MetricCard {
  title: string;
  value: string;
  hint: string;
  icon: Component;
  tone: string;
}

const api = useAdminApi();
const { data: stats, loading, loadError, run: load } = useLatestQuery<WorkbenchStats | null>({
  initial: () => null,
  load: () => api.workbench.getStats(),
  errorMessage: "工作台数据加载失败",
});

const cards = computed<MetricCard[]>(() => {
  const value = stats.value;
  if (!value) return [];
  return [
    { title: "排查记录", value: formatNumber(value.total), hint: "当前全部记录", icon: DataLine, tone: "blue" },
    { title: "待整改", value: formatNumber(value.new), hint: "状态 new", icon: Warning, tone: "red" },
    { title: "整改中", value: formatNumber(value.pending), hint: "状态 pending", icon: Clock, tone: "amber" },
    { title: "已整改", value: formatNumber(value.done), hint: "状态 done", icon: CircleCheck, tone: "green" },
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

onMounted(() => {
  void load();
});
</script>

<template>
  <div class="space-y-5">
    <PageHeader title="工作台" description="查看当前后端口径的排查整改数量与类型分布。">
      <template #actions>
        <ElButton :icon="Refresh" :loading="loading" @click="load">刷新数据</ElButton>
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

      <section class="page-card p-5">
        <div class="mb-4">
          <h2 class="m-0 text-base font-semibold text-slate-900">问题类型分布</h2>
          <p class="mt-1 mb-0 text-sm text-slate-500">按后端 `by_type` 统计展示。</p>
        </div>
        <TypeDistributionChart :data="stats.by_type" />
      </section>
    </template>

    <ElEmpty v-else-if="!loadError" description="暂无工作台数据" />
  </div>
</template>
