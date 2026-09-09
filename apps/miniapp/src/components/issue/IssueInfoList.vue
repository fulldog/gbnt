<script setup lang="ts">
import type { IssueInfoRow } from "@/utils/issue-display";

defineProps<{
  rows: readonly IssueInfoRow[];
}>();
</script>

<template>
  <view class="info-list">
    <view v-for="row in rows" :key="row.label" class="info-list__row">
      <text class="info-list__label">{{ row.label }}：</text>
      <text class="info-list__value">{{ row.value }}</text>
    </view>
  </view>
</template>

<style scoped lang="scss">
.info-list {
  margin-top: 8px;
}

.info-list__row {
  padding: 6px 0;
  font-size: 14px;
  line-height: 1.55;
  text-align: left;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.info-list__label {
  color: var(--gb-color-text-secondary, #6b7a90);
}

.info-list__value {
  color: var(--gb-color-text-primary, #172033);
}
</style>
