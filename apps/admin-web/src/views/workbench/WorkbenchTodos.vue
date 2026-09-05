<script setup lang="ts">
import type { WorkbenchTodoResult } from "@/api/workbench";
import AsyncError from "@/components/AsyncError.vue";
import IssueStatusTag from "@/components/IssueStatusTag.vue";
import { ISSUE_TYPE_LABELS } from "@/constants/issue";
import { displayOrg, displayUser } from "@/utils/display";

defineProps<{ data: WorkbenchTodoResult | null; loading: boolean; error: string }>();
defineEmits<{ retry: []; page: [value: number] }>();

function countdown(days: number | null): string {
  if (days === null) return "未设有效期限";
  if (days < 0) return `已逾期 ${Math.abs(days)} 天`;
  if (days === 0) return "今天到期";
  return `剩余 ${days} 天`;
}
</script>

<template>
  <section class="page-card overflow-hidden" aria-labelledby="workbench-todos-title">
    <header class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
      <h2 id="workbench-todos-title" class="m-0 text-base font-semibold">待办列表 <span v-if="data" class="ml-1 text-sm font-normal text-slate-500">{{ data.total }} 条</span></h2>
      <span class="text-xs text-slate-500">待整改与整改中 · 按计划完成日排序<span v-if="data"> · 倒计时基准 {{ data.today }}（北京时间）</span></span>
    </header>
    <div v-if="error" class="p-5"><AsyncError :message="error" @retry="$emit('retry')" /></div>
    <div v-else-if="loading" class="p-5"><ElSkeleton :rows="4" animated /></div>
    <template v-else-if="data">
      <ElTable :data="data.list" row-key="id" empty-text="暂无待办" class="workbench-todos" max-height="380">
        <ElTableColumn label="类型" width="95"><template #default="{ row }">{{ ISSUE_TYPE_LABELS[row.type as keyof typeof ISSUE_TYPE_LABELS] }}</template></ElTableColumn>
        <ElTableColumn label="编号" min-width="170" show-overflow-tooltip>
          <template #default="{ row }"><span :title="row.issue_key">{{ row.code || row.issue_key || `记录 #${row.id}` }}</span></template>
        </ElTableColumn>
        <ElTableColumn label="行政区划" min-width="220" show-overflow-tooltip><template #default="{ row }">{{ displayOrg(row.org_id, row.org_path || row.org_name) }}</template></ElTableColumn>
        <ElTableColumn label="整改人" min-width="140" show-overflow-tooltip><template #default="{ row }">{{ row.assignee_user ? displayUser(row.assignee_user, row.assignee_user_name) : "未指派" }}</template></ElTableColumn>
        <ElTableColumn label="计划完成" width="135"><template #default="{ row }">{{ row.plan_date || "未设期限" }}</template></ElTableColumn>
        <ElTableColumn label="倒计时" min-width="140"><template #default="{ row }"><ElTag :type="row.days_left === null ? 'info' : row.days_left < 0 ? 'danger' : row.days_left <= 3 ? 'warning' : 'info'" effect="light">{{ countdown(row.days_left) }}</ElTag></template></ElTableColumn>
        <ElTableColumn label="状态" width="105"><template #default="{ row }"><IssueStatusTag :status="row.status" /></template></ElTableColumn>
      </ElTable>
      <div v-if="data.total > data.size" class="flex justify-end p-4">
        <ElPagination :current-page="data.page" :page-size="data.size" :total="data.total" layout="total, prev, pager, next" @current-change="$emit('page', $event)" />
      </div>
    </template>
  </section>
</template>
