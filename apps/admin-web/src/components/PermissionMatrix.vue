<script setup lang="ts">
import type { SysApi } from "@gbnt/api-client";
import { computed } from "vue";

const { apis, disabled = false } = defineProps<{ apis: readonly SysApi[]; disabled?: boolean }>();
const selected = defineModel<number[]>({ required: true });
const moduleLabels: Record<string, string> = {
  'web.workbench': '工作台', 'web.rectify': '专项整改', 'web.ledger-street': '街道台账', 'web.ledger-survey': '街道排查汇总',
  'web.sys-org': '组织架构', 'web.sys-staff': '工作人员', 'web.sys-roles': '角色权限', 'web.sys-logs': '操作日志', 'web.auth': '登录与账号',
};
const actionLabels: Record<string, string> = { view: '查', create: '增', edit: '改', delete: '删', import: '导入', export: '导出', login: '登录' };
const rows = computed(() => {
  const groups = new Map<string, SysApi[]>();
  for (const api of [...apis].sort((a, b) => a.sort - b.sort || a.id - b.id)) groups.set(api.module, [...(groups.get(api.module) ?? []), api]);
  return [...groups].map(([module, entries]) => ({
    module, label: moduleLabels[module] ?? module, ids: entries.map((api) => api.id),
    actions: [...new Set(entries.map((api) => api.action))].map((action) => {
      const matches = entries.filter((api) => api.action === action);
      return { action, label: actionLabels[action] ?? action, ids: matches.map((api) => api.id), names: matches.map((api) => api.name).join('、') };
    }),
  }));
});
function checked(ids: readonly number[]): boolean { return ids.length > 0 && ids.every((id) => selected.value.includes(id)); }
function partial(ids: readonly number[]): boolean { return !checked(ids) && ids.some((id) => selected.value.includes(id)); }
function toggle(ids: readonly number[], value: boolean): void {
  if (disabled) return;
  // 仅修改用户主动勾选的分组；保留其他分组、部分授权及目录外的既有权限。
  selected.value = value ? [...new Set([...selected.value, ...ids])] : selected.value.filter((id) => !ids.includes(id));
}
</script>

<template>
  <div class="permission-matrix" role="group" aria-label="模块操作权限">
    <div v-for="row in rows" :key="row.module" class="permission-row">
      <ElCheckbox :model-value="checked(row.ids)" :indeterminate="partial(row.ids)" :disabled="disabled" @change="toggle(row.ids, $event === true)">{{ row.label }}</ElCheckbox>
      <div class="permission-actions">
        <ElTooltip v-for="action in row.actions" :key="action.action" :content="action.names" placement="top">
          <ElCheckbox :model-value="checked(action.ids)" :indeterminate="partial(action.ids)" :disabled="disabled" v-bind="{ 'aria-label': `${row.label}：${action.label}` }" @change="toggle(action.ids, $event === true)">{{ action.label }}</ElCheckbox>
        </ElTooltip>
      </div>
    </div>
    <ElEmpty v-if="!rows.length" description="暂无可配置权限" :image-size="60" />
  </div>
</template>

<style scoped>
.permission-matrix { padding: 12px 16px; border: 1px solid #e8e8e8; border-radius: 6px; }
.permission-row { display: flex; flex-wrap: wrap; align-items: center; gap: 0 20px; min-height: 46px; }
.permission-row > :deep(.el-checkbox) { min-width: 126px; margin: 0; }
.permission-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 0 14px; }
.permission-actions :deep(.el-checkbox) { margin: 0; }
.permission-row + .permission-row { border-top: 1px solid #f5f5f5; }
.permission-matrix :deep(.el-checkbox__label) { font-size: 14px; }
</style>
