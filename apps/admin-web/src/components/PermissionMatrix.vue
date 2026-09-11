<script setup lang="ts">
import type { SysApi } from "@gbnt/api-client";
import { ArrowRight } from "@element-plus/icons-vue";
import { computed, shallowRef } from "vue";
import { rolePermissionGroups } from "@/utils/role-permissions";

const { apis, disabled = false } = defineProps<{ apis: readonly SysApi[]; disabled?: boolean }>();
const selected = defineModel<number[]>({ required: true });
const collapsed = shallowRef<string[]>([]);
const groups = computed(() => rolePermissionGroups(apis));
const allIds = computed(() => groups.value.flatMap((group) => group.ids));
function checked(ids: readonly number[]): boolean { return ids.length > 0 && ids.every((id) => selected.value.includes(id)); }
function partial(ids: readonly number[]): boolean { return !checked(ids) && ids.some((id) => selected.value.includes(id)); }
function toggle(ids: readonly number[], value: boolean): void {
  if (disabled) return;
  // 仅修改主动勾选的分组，保留其他组、部分授权和目录外的既有授权。
  selected.value = value ? [...new Set([...selected.value, ...ids])] : selected.value.filter((id) => !ids.includes(id));
}
function toggleExpanded(key: string): void {
  collapsed.value = collapsed.value.includes(key) ? collapsed.value.filter((item) => item !== key) : [...collapsed.value, key];
}
</script>

<template>
  <div class="permission-matrix" role="group" aria-label="模块操作权限">
    <div v-if="groups.length" class="permission-tools">
      <ElCheckbox :model-value="checked(allIds)" :indeterminate="partial(allIds)" :disabled="disabled" @change="toggle(allIds, $event === true)">全选</ElCheckbox>
      <ElButton link type="primary" @click="collapsed = collapsed.length ? [] : groups.filter((group) => group.nested).map((group) => group.key)">{{ collapsed.length ? '全部展开' : '全部收起' }}</ElButton>
    </div>
    <section v-for="group in groups" :key="group.key" class="permission-group" :aria-label="group.label">
      <div v-if="group.nested" class="permission-parent">
        <button type="button" class="permission-expand" :aria-label="(collapsed.includes(group.key) ? '展开' : '收起') + group.label" :aria-expanded="!collapsed.includes(group.key)" @click="toggleExpanded(group.key)">
          <ElIcon :class="{ expanded: !collapsed.includes(group.key) }"><ArrowRight /></ElIcon>
        </button>
        <ElCheckbox :model-value="checked(group.ids)" :indeterminate="partial(group.ids)" :disabled="disabled" @change="toggle(group.ids, $event === true)">{{ group.label }}</ElCheckbox>
      </div>
      <div v-show="!group.nested || !collapsed.includes(group.key)" :class="{ 'permission-children': group.nested }">
        <div v-for="page in group.pages" :key="page.module" class="permission-row">
          <ElCheckbox :model-value="checked(page.ids)" :indeterminate="partial(page.ids)" :disabled="disabled" @change="toggle(page.ids, $event === true)">{{ page.label }}</ElCheckbox>
          <div v-if="page.module !== 'web.auth'" class="permission-actions">
            <ElCheckbox v-for="action in page.actions" :key="action.action" :model-value="checked(action.ids)" :indeterminate="partial(action.ids)" :disabled="disabled" v-bind="{ 'aria-label': page.label + '：' + action.label }" @change="toggle(action.ids, $event === true)">{{ action.label }}</ElCheckbox>
          </div>
        </div>
      </div>
    </section>
    <ElEmpty v-if="!groups.length" description="暂无可配置权限" :image-size="60" />
  </div>
</template>

<style scoped>
.permission-matrix { border: 1px solid #e8e8e8; border-radius: 8px; padding: 8px 12px; }
.permission-tools { display: flex; align-items: center; justify-content: space-between; min-height: 32px; border-bottom: 1px solid #f0f0f0; }
.permission-group + .permission-group { border-top: 1px solid #f5f5f5; }
.permission-parent { display: flex; align-items: center; min-height: 32px; }
.permission-expand { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 30px; margin-left: -8px; border: 0; background: none; color: #666; cursor: pointer; }
.permission-expand .el-icon { transition: transform .15s; }
.permission-expand .expanded { transform: rotate(90deg); }
.permission-children { margin-left: 20px; }
.permission-row { display: flex; align-items: center; flex-wrap: wrap; min-height: 32px; gap: 0 12px; }
.permission-row > :deep(.el-checkbox) { min-width: 112px; margin: 0; }
.permission-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 0 12px; }
.permission-actions :deep(.el-checkbox) { margin: 0; }
.permission-matrix :deep(.el-checkbox) { height: 32px; }
.permission-matrix :deep(.el-checkbox__label) { padding-left: 6px; font-size: 14px; }
@media (max-width: 640px) { .permission-matrix { padding: 8px 10px; } .permission-row { align-items: flex-start; flex-direction: column; padding: 4px 0; } .permission-actions { padding-left: 20px; } .permission-children { margin-left: 16px; } }
</style>
