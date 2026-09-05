<script setup lang="ts">
import type { RectifyRecord } from "@gbnt/api-client";
import { toAssetUrl } from "@/api/runtime";
import IssuePhotoGrid from "@/components/issue/IssuePhotoGrid.vue";
import { formatDateTime, quizLabel } from "@/utils/issue-display";

defineProps<{
  records: readonly RectifyRecord[];
  currentRound?: number;
}>();

function photoUrls(record: RectifyRecord): string[] {
  return record.photos.map((photo) => toAssetUrl(photo.url));
}

function preview(record: RectifyRecord, index: number): void {
  const urls = photoUrls(record);
  uni.previewImage({ current: urls[index], urls });
}
</script>

<template>
  <view class="history">
    <view v-for="record in records" :key="record.id" class="history__item">
      <view class="history__header">
        <text class="history__title">{{ quizLabel(record.quiz_type) }}</text>
        <text class="history__time">{{ formatDateTime(record.created_at) }}</text>
      </view>
      <text class="history__time">第 {{ (record.round ?? 0) + 1 }} 轮{{ record.round === currentRound ? ' · 本轮反馈' : '' }}</text>
      <text class="history__note">{{ record.note }}</text>
      <IssuePhotoGrid
        v-if="record.photos.length"
        :urls="photoUrls(record)"
        compact
        @preview="preview(record, $event)"
      />
    </view>
  </view>
</template>

<style scoped lang="scss">
.history__item {
  position: relative;
  padding: 24rpx 0 24rpx 28rpx;
  border-bottom: 1rpx solid var(--gb-color-border, #edf0f4);
}

.history__item::before {
  position: absolute;
  top: 34rpx;
  left: 0;
  width: 14rpx;
  height: 14rpx;
  border-radius: 50%;
  background: var(--gb-color-success, #1a7f4b);
  content: "";
}

.history__item:last-child {
  border-bottom: 0;
}

.history__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20rpx;
}

.history__title {
  flex: 1;
  min-width: 0;
  color: var(--gb-color-text-primary, #172033);
  font-size: 27rpx;
  font-weight: 600;
  line-height: 1.45;
}

.history__time {
  flex-shrink: 0;
  color: var(--gb-color-text-muted, #8490a3);
  font-size: 23rpx;
  line-height: 1.45;
}

.history__note {
  display: block;
  margin-top: 12rpx;
  color: var(--gb-color-text-secondary, #566176);
  font-size: 26rpx;
  line-height: 1.65;
  white-space: pre-wrap;
}
</style>
