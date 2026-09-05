<script setup lang="ts">
import { computed, shallowRef, watch } from "vue";
import type { UserOptionQuery, UserOptionResult } from "@/api/types";
import AsyncError from "@/components/AsyncError.vue";
import { useLatestQuery } from "@/composables/useLatestQuery";

const { active = true, scopeKey, loadOptions, placeholder = "搜索姓名或账号" } = defineProps<{
  active?: boolean;
  scopeKey: string | number;
  loadOptions: (query: UserOptionQuery) => Promise<UserOptionResult>;
  placeholder?: string;
}>();
const selected = defineModel<number>();
const emit = defineEmits<{ ready: [ready: boolean] }>();
const keyword = shallowRef("");
const page = shallowRef(1);
const size = 20;
const { data, loading, loadError, hasLoaded, run, invalidate } = useLatestQuery<UserOptionResult>({
  initial: () => ({ list: [], total: 0, page: 1, size, selected: null }),
  load: () => loadOptions({
    keyword: keyword.value.trim() || undefined,
    page: page.value,
    size,
    selected_id: selected.value || undefined,
  }),
  errorMessage: "人员候选加载失败",
});
const options = computed(() => {
  const rows = data.value.list;
  const current = data.value.selected;
  return current && !rows.some((row) => row.id === current.id) ? [current, ...rows] : rows;
});
const ready = computed(() => active && hasLoaded.value && !loading.value && !loadError.value
  && Boolean(selected.value && options.value.some((row) => row.id === selected.value)));

watch(ready, (value) => emit("ready", value), { immediate: true, flush: "sync" });
watch(() => [active, scopeKey] as const, () => {
  invalidate();
  keyword.value = "";
  page.value = 1;
  if (active) void run();
}, { immediate: true, flush: "sync" });
watch(selected, () => {
  if (active) void run();
}, { flush: "sync" });

function search(value: string): void {
  keyword.value = value;
  page.value = 1;
  if (active) void run();
}

function changePage(value: number): void {
  page.value = value;
  if (active) void run();
}
</script>

<template>
  <div class="w-full space-y-2">
    <ElSelect
      v-model="selected"
      filterable
      remote
      clearable
      :remote-method="search"
      :loading="loading"
      :disabled="!active"
      :placeholder="placeholder"
      class="w-full"
    >
      <ElOption v-for="user in options" :key="user.id" :label="`${user.name || user.username}（${user.username}）`" :value="user.id" />
    </ElSelect>
    <AsyncError v-if="loadError" :message="loadError" @retry="run" />
    <p v-else-if="active && hasLoaded && selected && !ready" class="m-0 text-xs text-amber-700">
      当前已选人员不在可选范围内，请重新选择。
    </p>
    <ElPagination
      v-if="hasLoaded && data.total > size"
      :current-page="page"
      :page-size="size"
      :total="data.total"
      layout="total, prev, pager, next"
      small
      @current-change="changePage"
    />
  </div>
</template>
