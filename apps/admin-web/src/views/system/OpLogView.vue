<script setup lang="ts">
import type { OpLog, OpLogListResult } from "@gbnt/api-client";
import { Refresh, Search, View } from "@element-plus/icons-vue";
import { vLoading } from "element-plus";
import { computed, onMounted, shallowRef } from "vue";
import { useAdminApi } from "@/api/runtime";
import AsyncError from "@/components/AsyncError.vue";
import PageHeader from "@/components/PageHeader.vue";
import { useLatestQuery } from "@/composables/useLatestQuery";
import { formatDateTime, prettyJson } from "@/utils/format";

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
  <div class="space-y-5">
    <PageHeader title="操作日志" description="查询服务端记录的账号、动作、路径、请求和响应内容。">
      <template #actions><ElButton :icon="Refresh" :loading="loading" @click="load">刷新</ElButton></template>
    </PageHeader>

    <section class="page-card p-4" @submit.prevent="search">
      <ElForm>
        <div class="flex flex-wrap items-end gap-3">
          <ElFormItem label="动作、详情或账号" class="!mb-0 min-w-64 flex-1">
            <ElInput v-model="keyword" clearable placeholder="输入关键字" />
          </ElFormItem>
          <ElButton @click="reset">重置</ElButton>
          <ElButton native-type="submit" type="primary" :icon="Search">查询</ElButton>
        </div>
      </ElForm>
    </section>

    <AsyncError v-if="loadError" :message="loadError" @retry="load" />

    <section class="page-card overflow-hidden">
      <ElTable v-loading="loading" :data="logs" row-key="id" :empty-text="loading ? '正在加载…' : loadError ? '加载失败，请重试' : '暂无操作日志'">
        <ElTableColumn type="index" label="#" width="60" align="center" :index="(index: number) => (page - 1) * size + index + 1" />
        <ElTableColumn prop="username" label="操作账号" min-width="130" />
        <ElTableColumn prop="action" label="操作动作" min-width="150" show-overflow-tooltip />
        <ElTableColumn prop="detail" label="操作详情" min-width="220" show-overflow-tooltip />
        <ElTableColumn prop="path" label="请求路径" min-width="220" show-overflow-tooltip />
        <ElTableColumn prop="ip" label="客户端 IP" min-width="140" />
        <ElTableColumn prop="trace_id" label="Trace ID" min-width="220" show-overflow-tooltip />
        <ElTableColumn label="操作时间" min-width="160"><template #default="scope">{{ formatDateTime(scope.row.created_at) }}</template></ElTableColumn>
        <ElTableColumn label="操作" width="90" fixed="right">
          <template #default="scope"><ElButton link type="primary" :icon="View" @click="openDetail(asOpLog(scope.row))">详情</ElButton></template>
        </ElTableColumn>
      </ElTable>
      <div v-if="hasLoaded" class="flex justify-end border-t border-slate-200 px-4 py-3">
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

    <ElDrawer v-model="detailVisible" title="操作日志详情" size="min(860px, 96vw)" destroy-on-close>
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
          <pre class="max-h-80 overflow-auto rounded-lg bg-slate-950 p-4 text-xs leading-6 whitespace-pre-wrap text-slate-100">{{ prettyJson(selected.request) }}</pre>
        </section>
        <section>
          <h3 class="mb-2 text-sm font-semibold text-slate-900">响应内容</h3>
          <pre class="max-h-80 overflow-auto rounded-lg bg-slate-950 p-4 text-xs leading-6 whitespace-pre-wrap text-slate-100">{{ prettyJson(selected.response) }}</pre>
        </section>
      </div>
    </ElDrawer>
  </div>
</template>
