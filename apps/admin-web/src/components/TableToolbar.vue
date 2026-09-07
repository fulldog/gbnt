<script setup lang="ts">
import { FullScreen, Refresh, Search, Setting } from "@element-plus/icons-vue";
import { useFullscreen } from "@/composables/useFullscreen";

const { title, loading = false, target, columns = [], filterable = true } = defineProps<{
  title: string;
  loading?: boolean;
  target: () => HTMLElement | null | undefined;
  filterable?: boolean;
  columns?: readonly { key: string; label: string }[];
}>();
defineEmits<{ refresh: [] }>();
const filtersVisible = defineModel<boolean>("filtersVisible", { default: true });
const visibleColumns = defineModel<string[]>("visibleColumns", { default: () => [] });
const { fullscreen, toggle } = useFullscreen(() => target());
function toggleColumn(key: string, checked: boolean): void {
  visibleColumns.value = checked ? [...visibleColumns.value, key] : visibleColumns.value.filter((value) => value !== key);
}
</script>

<template>
  <header class="table-toolbar">
    <h1>{{ title }}</h1>
    <div class="table-toolbar-actions">
      <slot />
      <span v-if="$slots.default" class="toolbar-divider" />
      <ElButton v-if="filterable" circle :icon="Search" @click="filtersVisible = !filtersVisible"  v-bind="{ 'aria-label': filtersVisible ? '隐藏查询' : '显示查询', 'title': filtersVisible ? '隐藏查询' : '显示查询', 'aria-pressed': filtersVisible }" />
      <ElButton circle :icon="Refresh" :loading="loading" @click="$emit('refresh')"  v-bind="{ 'aria-label': '刷新表格', 'title': '刷新表格' }" />
      <ElButton circle :icon="FullScreen" @click="toggle"  v-bind="{ 'aria-label': fullscreen ? '退出全屏' : '全屏查看', 'title': fullscreen ? '退出全屏' : '全屏查看' }" />
      <ElPopover v-if="columns.length" placement="bottom-end" trigger="click" :width="180">
        <template #reference><ElButton circle :icon="Setting"  v-bind="{ 'aria-label': '列设置', 'title': '列设置' }" /></template>
        <div class="column-options" role="group" aria-label="显示列">
          <ElCheckbox v-for="column in columns" :key="column.key" :model-value="visibleColumns.includes(column.key)" @change="toggleColumn(column.key, $event === true)">{{ column.label }}</ElCheckbox>
        </div>
      </ElPopover>
    </div>
  </header>
</template>

<style scoped>
.table-toolbar { display: flex; flex-shrink: 0; justify-content: space-between; align-items: center; gap: 16px; min-height: 56px; padding: 12px 16px; }
h1 { margin: 0; color: #333; font-size: 16px; font-weight: 600; }
.table-toolbar-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
.table-toolbar-actions :deep(.el-button + .el-button) { margin-left: 0; }
.toolbar-divider { width: 1px; height: 20px; background: var(--gbnt-border); margin: 0 2px; }
.column-options { display: flex; flex-direction: column; max-height: 360px; overflow: auto; }
.column-options :deep(.el-checkbox) { margin: 0; }
@media (max-width: 640px) { .table-toolbar { align-items: flex-start; flex-wrap: wrap; padding: 12px; } }
</style>
