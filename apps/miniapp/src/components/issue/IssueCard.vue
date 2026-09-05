<script setup lang="ts">
import type { Issue } from "@gbnt/api-client";
import { computed } from "vue";
import { toAssetUrl } from "@/api/runtime";
import IssuePhotoGrid from "@/components/issue/IssuePhotoGrid.vue";
import { issueTypeLabel } from "@/domain/issues/definitions";
import {
  formatDateTime,
  hasValidCoordinates,
  issueChecklistPhotos,
  issuePlanHint,
  issueStatusMeta,
} from "@/utils/issue-display";

const props = defineProps<{
  issue: Issue;
}>();

const emit = defineEmits<{
  open: [id: number];
  map: [id: number];
  preview: [urls: string[], index: number];
}>();

const typeLabel = computed(() => issueTypeLabel(props.issue.type));
const status = computed(() => issueStatusMeta(props.issue.status));
const plan = computed(() => issuePlanHint(props.issue));
const photoUrls = computed(() =>
  issueChecklistPhotos(props.issue).map((photo) => toAssetUrl(photo.url)),
);
const hasLocation = computed(() => hasValidCoordinates(props.issue.lat, props.issue.lng));
const displayCode = computed(() => props.issue.code.trim() || props.issue.issue_key || `#${props.issue.id}`);

function preview(urls: readonly string[], index: number): void {
  emit("preview", [...urls], index);
}
</script>

<template>
  <view class="issue-card" hover-class="issue-card--pressed" @tap="emit('open', issue.id)">
    <view class="issue-card__header">
      <view class="issue-card__title-wrap">
        <text class="issue-card__type">{{ typeLabel }}</text>
        <text class="issue-card__title">{{ displayCode }}</text>
      </view>
      <text class="issue-card__status" :class="`tone-${status.tone}`">{{ status.label }}</text>
    </view>

    <view class="issue-card__meta">
      <text>{{ issue.project_year }} 年</text>
      <text class="issue-card__dot">·</text>
      <text>{{ formatDateTime(issue.created_at) }}</text>
      <text class="issue-card__plan" :class="`tone-${plan.tone}`">{{ plan.label }}</text>
    </view>

    <IssuePhotoGrid
      v-if="photoUrls.length"
      :urls="photoUrls"
      :max="3"
      compact
      @preview="preview(photoUrls, $event)"
    />

    <view class="issue-card__location-row">
      <text class="issue-card__pin" aria-hidden="true">●</text>
      <text class="issue-card__address">{{ issue.address || "未填写地址" }}</text>
      <button
        v-if="hasLocation"
        class="issue-card__map-button"
        aria-label="查看地图"
        @tap.stop="emit('map', issue.id)"
      >
        地图
      </button>
    </view>
  </view>
</template>

<style scoped lang="scss">
.issue-card {
  padding: 28rpx 28rpx 24rpx;
  border: 1rpx solid var(--gb-color-border, #e5eaf0);
  border-radius: var(--gb-radius-md, 16rpx);
  background: var(--gb-color-surface, #fff);
  transition: background-color 120ms ease;
}

.issue-card--pressed {
  background: #f7f9fc;
}

.issue-card__header,
.issue-card__title-wrap,
.issue-card__meta,
.issue-card__location-row {
  display: flex;
  align-items: center;
}

.issue-card__header {
  justify-content: space-between;
  gap: 20rpx;
}

.issue-card__title-wrap {
  min-width: 0;
  gap: 14rpx;
}

.issue-card__type {
  flex-shrink: 0;
  padding: 5rpx 10rpx;
  border-radius: 6rpx;
  background: rgba(1, 92, 187, 0.1);
  color: var(--gb-color-primary, #015cbb);
  font-size: 24rpx;
  line-height: 1.3;
}

.issue-card__title {
  overflow: hidden;
  color: var(--gb-color-text-primary, #172033);
  font-size: 30rpx;
  font-weight: 650;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.issue-card__status {
  flex-shrink: 0;
  padding: 6rpx 12rpx;
  border-radius: 999rpx;
  font-size: 24rpx;
  font-weight: 600;
  line-height: 1.3;
}

.issue-card__meta {
  flex-wrap: wrap;
  gap: 8rpx;
  margin-top: 14rpx;
  color: var(--gb-color-text-muted, #8490a3);
  font-size: 24rpx;
  line-height: 1.5;
}

.issue-card__plan {
  margin-left: auto;
  font-weight: 600;
}

.issue-card__location-row {
  align-items: flex-start;
  gap: 12rpx;
  margin-top: 22rpx;
  padding-top: 20rpx;
  border-top: 1rpx solid var(--gb-color-border, #edf0f4);
}

.issue-card__pin {
  margin-top: 7rpx;
  color: var(--gb-color-primary, #015cbb);
  font-size: 18rpx;
}

.issue-card__address {
  flex: 1;
  min-width: 0;
  color: var(--gb-color-text-secondary, #566176);
  font-size: 26rpx;
  line-height: 1.5;
}

.issue-card__map-button {
  flex-shrink: 0;
  min-width: 88rpx;
  min-height: 64rpx;
  margin: -8rpx -8rpx -8rpx 0;
  padding: 0 12rpx;
  border: 0;
  background: transparent;
  color: var(--gb-color-primary, #015cbb);
  font-size: 26rpx;
  line-height: 64rpx;
}

.issue-card__map-button::after {
  border: 0;
}

.tone-primary {
  background: rgba(1, 92, 187, 0.1);
  color: var(--gb-color-primary, #015cbb);
}

.tone-success {
  background: rgba(26, 127, 75, 0.1);
  color: var(--gb-color-success, #1a7f4b);
}

.tone-warning {
  background: rgba(212, 136, 6, 0.1);
  color: var(--gb-color-warning, #d48806);
}

.tone-danger {
  background: rgba(207, 19, 34, 0.09);
  color: var(--gb-color-danger, #cf1322);
}

.tone-muted {
  background: transparent;
  color: var(--gb-color-text-muted, #8490a3);
}
</style>
