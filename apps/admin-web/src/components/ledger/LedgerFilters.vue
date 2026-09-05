<script setup lang="ts">
import type { OrgOption } from "@/api/types";
import { Search } from "@element-plus/icons-vue";

defineProps<{ streets: OrgOption[]; loading: boolean; unavailable: boolean }>();
const streetOrgId = defineModel<number | undefined>("streetOrgId");
const dateRange = defineModel<[string, string] | undefined>("dateRange");
const emit = defineEmits<{ search: []; reset: [] }>();
function onSubmit(event: Event): void { event.preventDefault(); emit("search"); }
</script>

<template>
  <ElForm class="ledger-filters" v-bind="{ onSubmit }">
    <ElFormItem label="街道" class="!mb-0">
      <ElSelect v-model="streetOrgId" clearable filterable :loading="loading" :disabled="loading || unavailable" class="w-full" placeholder="全部街道">
        <ElOption v-for="org in streets" :key="org.id" :label="org.name" :value="org.id" />
      </ElSelect>
    </ElFormItem>
    <ElFormItem label="起止日期" class="!mb-0">
      <ElDatePicker v-model="dateRange" type="daterange" value-format="YYYY-MM-DD" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" class="!w-full" />
    </ElFormItem>
    <div class="ledger-filter-actions">
      <ElButton @click="$emit('reset')">重置</ElButton>
      <ElButton type="primary" :icon="Search" @click="$emit('search')">查询</ElButton>
    </div>
  </ElForm>
</template>

<style scoped>
.ledger-filters { display: grid; grid-template-columns: minmax(200px, 1fr) minmax(310px, 1.25fr) auto; align-items: center; gap: 20px 32px; padding: 24px; border-radius: 8px; background: #fff; }
.ledger-filter-actions { display: flex; justify-content: flex-end; gap: 8px; }
@media (max-width: 1100px) { .ledger-filters { grid-template-columns: minmax(190px, 1fr) minmax(280px, 1.3fr); } .ledger-filter-actions { grid-column: 1 / -1; } }
@media (max-width: 640px) { .ledger-filters { grid-template-columns: minmax(0, 1fr); padding: 16px; gap: 16px; } }
</style>
