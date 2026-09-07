<script setup lang="ts">
import { ArrowDown, ArrowUp } from "@element-plus/icons-vue";
import { shallowRef } from "vue";

const { loading, columns = 2 } = defineProps<{ loading?: boolean; columns?: 1 | 2 }>();
defineEmits<{ search: []; reset: [] }>();
const expanded = shallowRef(false);
</script>

<template>
  <section class="query-panel" @submit.prevent="$emit('search')">
  <ElForm label-position="right" label-width="90px">
    <div class="query-grid" :class="{ 'query-grid-single': columns === 1 }">
      <slot />
      <div v-if="expanded" class="query-advanced"><slot name="advanced" /></div>
      <div class="query-actions">
        <ElButton @click="$emit('reset')">重置</ElButton>
        <ElButton type="primary" native-type="submit" :loading="loading">查询</ElButton>
        <ElButton v-if="$slots.advanced" link type="primary" v-bind="{ 'aria-expanded': expanded }" @click="expanded = !expanded">
          {{ expanded ? '收起' : '展开' }}<ElIcon class="ml-1"><component :is="expanded ? ArrowUp : ArrowDown" /></ElIcon>
        </ElButton>
      </div>
    </div>
  </ElForm>
  </section>
</template>

<style scoped>
.query-panel { padding: 24px 20px; background: #fff; border-radius: 8px 8px 0 0; }
.query-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)) auto; gap: 18px 28px; align-items: center; }
.query-grid :deep(.el-form-item) { margin: 0; min-width: 0; }
.query-grid :deep(.el-form-item__content) { min-width: 0; }
.query-grid :deep(.el-form-item__label) { color: #333; }
.query-advanced { display: contents; }
.query-actions { grid-column: 3; grid-row: 1; display: flex; align-items: center; justify-content: flex-end; gap: 10px; padding-left: 12px; }
.query-actions :deep(.el-button + .el-button) { margin-left: 0; }
.query-grid-single { grid-template-columns: minmax(0, 1fr) auto; }
.query-grid-single .query-actions { grid-column: 2; }
@media (max-width: 1100px) { .query-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; } .query-actions { grid-column: 1 / -1; grid-row: auto; } }
@media (max-width: 640px) { .query-panel { padding: 16px 12px; } .query-grid { grid-template-columns: minmax(0, 1fr); } .query-grid-single .query-actions { grid-column: 1; grid-row: auto; } }
</style>
