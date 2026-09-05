<script setup lang="ts">
import type { AdminStreetLedgerRow, OrgOption } from "@/api/types";
import { Refresh, Search } from "@element-plus/icons-vue";
import { vLoading } from "element-plus";
import { computed, onMounted, shallowRef } from "vue";
import { useAdminApi } from "@/api/runtime";
import AsyncError from "@/components/AsyncError.vue";
import PageHeader from "@/components/PageHeader.vue";
import { useLatestQuery } from "@/composables/useLatestQuery";
import { ISSUE_TYPE_LABELS } from "@/constants/issue";
import { displayOrg } from "@/utils/display";
import LedgerSummary from "./LedgerSummary.vue";

const api = useAdminApi();
const streetOrgId = shallowRef<number>();
const dateRange = shallowRef<[string, string]>();
const { data: streets, loading: optionsLoading, loadError: optionsError, run: loadOrgs } = useLatestQuery<OrgOption[]>({
  initial: () => [],
  load: () => api.ledger.listStreetOrgOptions(),
  errorMessage: "街道选项加载失败，请重试后选择街道",
});
const { data: rows, loading, loadError, hasLoaded, run: load } = useLatestQuery<AdminStreetLedgerRow[]>({
  initial: () => [],
  load: async () => (await api.ledger.getStreet({
    street_org_id: streetOrgId.value,
    date_from: dateRange.value?.[0],
    date_to: dateRange.value?.[1],
  })).rows,
  errorMessage: "街道台账加载失败",
});
const totals = computed(() =>
  rows.value.reduce(
    (result, row) => ({
      total: result.total + row.total,
      pending: result.pending + row.pending,
      done: result.done + row.done,
    }),
    { total: 0, pending: 0, done: 0 },
  ),
);

function reset(): void {
  streetOrgId.value = undefined;
  dateRange.value = undefined;
  void load();
}

function rowKey(row: AdminStreetLedgerRow): string {
  return `${row.org_id}:${row.type}`;
}

onMounted(() => {
  void Promise.all([loadOrgs(), load()]);
});
</script>

<template>
  <div class="space-y-5">
    <PageHeader title="街道台账" description="展示后端当前按组织和问题类型聚合的台账口径。">
      <template #actions><ElButton :icon="Refresh" :loading="loading" @click="load">刷新</ElButton></template>
    </PageHeader>

    <section class="page-card p-4">
      <div class="grid items-end gap-4 lg:grid-cols-[260px_360px_1fr]">
        <ElFormItem label="街道" class="!mb-0">
          <ElSelect v-model="streetOrgId" clearable filterable :loading="optionsLoading" :disabled="optionsLoading || Boolean(optionsError)" class="w-full" placeholder="全部街道">
            <ElOption v-for="org in streets" :key="org.id" :label="org.name" :value="org.id" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="创建日期" class="!mb-0">
          <ElDatePicker
            v-model="dateRange"
            type="daterange"
            value-format="YYYY-MM-DD"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            class="!w-full"
          />
        </ElFormItem>
        <div class="flex justify-end gap-2">
          <ElButton @click="reset">重置</ElButton>
          <ElButton type="primary" :icon="Search" @click="load">查询</ElButton>
        </div>
      </div>
    </section>

    <AsyncError v-if="optionsError" :message="optionsError" @retry="loadOrgs" />
    <AsyncError v-if="loadError" :message="loadError" @retry="load" />
    <LedgerSummary v-if="hasLoaded" v-bind="totals" />

    <section class="page-card overflow-hidden">
      <ElTable v-loading="loading" :data="rows" :row-key="rowKey" :empty-text="loading ? '正在加载…' : loadError ? '加载失败，请重试' : '暂无台账数据'" class="w-full">
        <ElTableColumn type="index" label="#" width="60" align="center" />
        <ElTableColumn label="组织" min-width="260" show-overflow-tooltip>
          <template #default="scope">{{ displayOrg(scope.row.org_id, scope.row.org_path || scope.row.org_name) }}</template>
        </ElTableColumn>
        <ElTableColumn label="类型" min-width="120"><template #default="scope">{{ ISSUE_TYPE_LABELS[scope.row.type as keyof typeof ISSUE_TYPE_LABELS] }}</template></ElTableColumn>
        <ElTableColumn prop="total" label="总量" min-width="100" align="right" />
        <ElTableColumn prop="pending" label="待处理（new + pending）" min-width="180" align="right" />
        <ElTableColumn prop="done" label="已整改（done）" min-width="150" align="right" />
      </ElTable>
    </section>
  </div>
</template>
