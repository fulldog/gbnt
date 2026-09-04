<script setup lang="ts">
import { computed } from "vue";
import { formatNumber, formatPercent } from "@/utils/format";

const { total, pending, done } = defineProps<{
  total: number;
  pending: number;
  done: number;
}>();

const rate = computed(() => (total > 0 ? (done / total) * 100 : 0));
</script>

<template>
  <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    <article class="page-card p-4"><p class="m-0 text-sm text-slate-500">记录总量</p><strong class="numeric mt-2 block text-2xl">{{ formatNumber(total) }}</strong></article>
    <article class="page-card p-4"><p class="m-0 text-sm text-slate-500">待处理</p><strong class="numeric mt-2 block text-2xl text-amber-700">{{ formatNumber(pending) }}</strong></article>
    <article class="page-card p-4"><p class="m-0 text-sm text-slate-500">已整改</p><strong class="numeric mt-2 block text-2xl text-emerald-700">{{ formatNumber(done) }}</strong></article>
    <article class="page-card p-4"><p class="m-0 text-sm text-slate-500">完成率</p><strong class="numeric mt-2 block text-2xl text-blue-700">{{ formatPercent(rate) }}</strong></article>
  </div>
</template>
