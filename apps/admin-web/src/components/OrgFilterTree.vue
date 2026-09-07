<script setup lang="ts">
import { Search } from "@element-plus/icons-vue";
import { ElTree, vLoading } from "element-plus";
import { computed, nextTick, shallowRef, useTemplateRef, watch } from "vue";
import type { OrgOption } from "@/api/types";
import { buildOrgTree } from "@/utils/org";

const { orgs, loading = false, unavailable = false } = defineProps<{ orgs: readonly OrgOption[]; loading?: boolean; unavailable?: boolean }>();
const model = defineModel<number | undefined>({ required: true });
const keyword = shallowRef("");
const expanded = shallowRef(true);
const tree = useTemplateRef<InstanceType<typeof ElTree>>("tree");
const nodes = computed(() => buildOrgTree(orgs));
function select(node: { id: number }): void { if (!loading && !unavailable) model.value = node.id; }
function filter(value: string, node: Record<string, unknown>): boolean { return !value || (typeof node.name === 'string' && node.name.includes(value)); }
watch([keyword, expanded, () => orgs], async () => { await nextTick(); tree.value?.filter(keyword.value.trim()); });
</script>

<template>
  <aside class="org-filter" aria-label="按单位组织筛选人员">
    <header><h2>单位组织</h2><ElButton link type="primary" :disabled="loading || unavailable" @click="model = undefined">全部</ElButton></header>
    <ElInput v-model="keyword" placeholder="搜索单位名称" :prefix-icon="Search" clearable :disabled="unavailable" v-bind="{ 'aria-label': '搜索单位名称' }" />
    <div class="org-tree-tools"><button type="button" :class="{ active: expanded }" @click="expanded = true">展开全部</button><button type="button" :class="{ active: !expanded }" @click="expanded = false">折叠全部</button></div>
    <div v-loading="loading" class="org-tree-scroll">
      <p v-if="unavailable" class="org-tree-error">组织加载失败，请重试。</p>
      <ElTree v-else :key="String(expanded)" ref="tree" :data="nodes" :props="{ label: 'name', children: 'children' }" node-key="id" :default-expand-all="expanded" :current-node-key="model" :expand-on-click-node="false" :filter-node-method="filter" highlight-current empty-text="暂无组织" @node-click="select" />
    </div>
  </aside>
</template>

<style scoped>
.org-filter { display: flex; flex-direction: column; flex: 0 0 250px; min-width: 0; min-height: 0; padding: 16px 12px; border-radius: 8px; background: #fff; }
header { display: flex; align-items: center; justify-content: space-between; padding: 0 4px 14px; }
h2 { margin: 0; font-size: 14px; font-weight: 600; }
.org-tree-tools { display: flex; gap: 8px; padding: 12px 0; }
.org-tree-tools button { border: 0; border-radius: 4px; background: #f5f7fa; padding: 4px 8px; color: #6b7a90; cursor: pointer; font-size: 12px; }
.org-tree-tools button.active { color: var(--gbnt-primary); background: var(--gbnt-primary-soft); }
.org-tree-scroll { min-height: 0; flex: 1; overflow: auto; }
.org-tree-scroll :deep(.el-tree-node__content) { height: 36px; border-radius: 4px; }
.org-tree-scroll :deep(.el-tree-node__label) { font-size: 14px; white-space: nowrap; }
.org-tree-scroll :deep(.el-tree) { min-width: max-content; }
.org-tree-error { color: #c0392b; font-size: 13px; }
@media (max-width: 900px) { .org-filter { flex: 0 0 auto; max-height: 280px; } }
</style>
