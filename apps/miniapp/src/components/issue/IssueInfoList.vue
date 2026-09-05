<script setup lang="ts">
import type { IssueInfoRow } from "@/utils/issue-display";

defineProps<{
  rows: readonly IssueInfoRow[];
}>();
</script>

<template>
  <view class="info-list">
    <view v-for="row in rows" :key="row.label" class="info-list__row">
      <text class="info-list__label">{{ row.label }}</text>
      <text class="info-list__value">{{ row.value }}</text>
    </view>
  </view>
</template>

<style scoped lang="scss">
.info-list__row {
  display: flex;
  align-items: flex-start;
  gap: 28rpx;
  padding: 14rpx 0;
  font-size: 27rpx;
  line-height: 1.55;
}

.info-list__label {
  flex: 0 0 184rpx;
  color: var(--gb-color-text-muted, #8490a3);
}

.info-list__value {
  flex: 1;
  min-width: 0;
  color: var(--gb-color-text-primary, #172033);
  text-align: right;
  word-break: break-all;
}
</style>
