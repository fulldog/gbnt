<script setup lang="ts">
import type { OpLog, OpLogListResult } from "@gbnt/api-client";
import { View } from "@element-plus/icons-vue";
import { vLoading } from "element-plus";
import { computed, onMounted, shallowRef, useTemplateRef } from "vue";
import { useAdminApi } from "@/api/runtime";
import AsyncError from "@/components/AsyncError.vue";
import QueryPanel from "@/components/QueryPanel.vue";
import TableToolbar from "@/components/TableToolbar.vue";
import { useLatestQuery } from "@/composables/useLatestQuery";
import { formatDateTime, prettyJson } from "@/utils/format";

const tablePage = useTemplateRef<HTMLElement>("tablePage");
const filtersVisible = shallowRef(true);
const columns = [{ key: "action", label: "操作动作" }, { key: "detail", label: "操作详情" }, { key: "path", label: "请求路径" }, { key: "ip", label: "客户端 IP" }, { key: "trace", label: "Trace ID" }, { key: "created", label: "操作时间" }];
const visibleColumns = shallowRef(columns.map((column) => column.key));
const api = useAdminApi();
const page = shallowRef(1);
const size = shallowRef(20);
const keyword = shallowRef("");
const detailVisible = shallowRef(false);
const selected = shallowRef<OpLog | null>(null);

const { data: result, loading, loadError, hasLoaded, run: load } = useLatestQuery<OpLogListResult>({
  initial: () => ({ list: [], total: 0, page: 1, size: 20 }),
  load: () => api.opLogs.list({
    keyword: keyword.value.trim() || undefined,
    page: page.value,
    size: size.value,
  }),
  errorMessage: "操作日志加载失败",
});
const logs = computed(() => result.value.list);
const total = computed(() => result.value.total);

function search(): void {
  page.value = 1;
  void load();
}

function reset(): void {
  keyword.value = "";
  search();
}

function openDetail(log: OpLog): void {
  selected.value = log;
  detailVisible.value = true;
}

function asOpLog(row: unknown): OpLog {
  return row as OpLog;
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div ref="tablePage" class="data-page">
    <QueryPanel v-show="filtersVisible" :columns="1" :loading="loading" @search="search" @reset="reset">
      <ElFormItem label="关键字"><ElInput v-model="keyword" clearable placeholder="请输入操作账号、动作或详情" /></ElFormItem>
    </QueryPanel>
    <AsyncError v-if="loadError" :message="loadError" @retry="load" />

    <section class="data-card">
      <TableToolbar v-model:filters-visible="filtersVisible" v-model:visible-columns="visibleColumns" title="操作日志" :columns="columns" :loading="loading" :target="() => tablePage" @refresh="load" />
      <div class="data-table">
      <ElTable height="100%" v-loading="loading" :data="logs" row-key="id" :empty-text="loading ? '正在加载…' : loadError ? '加载失败，请重试' : '暂无操作日志'">
        <ElTableColumn type="index" label="序号" width="60" align="center" :index="(index: number) => (page - 1) * size + index + 1" />
        <ElTableColumn prop="username" label="操作账号" min-width="130"  align="center"/>
        <ElTableColumn v-if="visibleColumns.includes('action')" prop="action" label="操作动作" min-width="150" show-overflow-tooltip  align="center"/>
        <ElTableColumn v-if="visibleColumns.includes('detail')" prop="detail" label="操作详情" min-width="220" show-overflow-tooltip  align="center"/>
        <ElTableColumn v-if="visibleColumns.includes('path')" prop="path" label="请求路径" min-width="220" show-overflow-tooltip  align="center"/>
        <ElTableColumn v-if="visibleColumns.includes('ip')" prop="ip" label="客户端 IP" min-width="140"  align="center"/>
        <ElTableColumn v-if="visibleColumns.includes('trace')" prop="trace_id" label="Trace ID" min-width="220" show-overflow-tooltip  align="center"/>
        <ElTableColumn v-if="visibleColumns.includes('created')" label="操作时间" min-width="160" align="center"><template #default="scope">{{ formatDateTime(scope.row.created_at) }}</template></ElTableColumn>
        <ElTableColumn label="操作" width="90" fixed="right" align="center">
          <template #default="scope"><ElButton link type="primary" :icon="View" @click="openDetail(asOpLog(scope.row))">详情</ElButton></template>
        </ElTableColumn>
      </ElTable>
      </div>
      <div v-if="hasLoaded" class="data-pagination">
        <ElPagination
          v-model:current-page="page"
          v-model:page-size="size"
          :total="total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          @current-change="load"
          @size-change="page = 1; load()"
        />
      </div>
    </section>

    <ElDialog v-model="detailVisible" title="操作日志详情" width="min(860px, 96vw)" top="6vh" destroy-on-close>
      <div v-if="selected" class="space-y-5">
        <ElDescriptions :column="2" border>
          <ElDescriptionsItem label="操作账号">{{ selected.username || "—" }}</ElDescriptionsItem>
          <ElDescriptionsItem label="用户 ID">{{ selected.user_id || "—" }}</ElDescriptionsItem>
          <ElDescriptionsItem label="操作动作">{{ selected.action }}</ElDescriptionsItem>
          <ElDescriptionsItem label="客户端 IP">{{ selected.ip || "—" }}</ElDescriptionsItem>
          <ElDescriptionsItem label="请求路径" :span="2">{{ selected.path }}</ElDescriptionsItem>
          <ElDescriptionsItem label="操作详情" :span="2">{{ selected.detail || "—" }}</ElDescriptionsItem>
          <ElDescriptionsItem label="Trace ID" :span="2">{{ selected.trace_id || "—" }}</ElDescriptionsItem>
          <ElDescriptionsItem label="操作时间" :span="2">{{ formatDateTime(selected.created_at) }}</ElDescriptionsItem>
        </ElDescriptions>
        <section>
          <h3 class="mb-2 text-sm font-semibold text-slate-900">请求参数</h3>
          <pre class="max-h-80 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-6 whitespace-pre-wrap text-slate-700">{{ prettyJson(selected.request) }}</pre>
        </section>
        <section>
          <h3 class="mb-2 text-sm font-semibold text-slate-900">响应内容</h3>
          <pre class="max-h-80 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-6 whitespace-pre-wrap text-slate-700">{{ prettyJson(selected.response) }}</pre>
        </section>
      </div>
    <template #footer><ElButton @click="detailVisible = false">关闭</ElButton></template>
    </ElDialog>
  </div>
</template>
