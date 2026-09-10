<script setup lang="ts">
import type { MiniappIssue } from "@/api/types";
import { computed } from "vue";
import { toAssetUrl } from "@/api/runtime";
import IssuePhotoGrid from "@/components/issue/IssuePhotoGrid.vue";
import { issueDeadlineHint } from "@/utils/issue-deadline";
import { issueTypeLabel } from "@/domain/issues/definitions";
import {
  formatDateTime,
  hasValidCoordinates,
  issueChecklistPhotos,
  issueSummary,
  issueReporter,
  issueOrganization,
} from "@/utils/issue-display";

const props = defineProps<{
  issue: MiniappIssue;
  now?: number;
}>();

const emit = defineEmits<{
  open: [id: number];
  map: [id: number];
  preview: [urls: string[], index: number];
}>();

const typeLabel = computed(() => issueTypeLabel(props.issue.type));
const plan = computed(() => issueDeadlineHint(props.issue, props.now));
const summary = computed(() => issueSummary(props.issue));
const photoUrls = computed(() =>
  issueChecklistPhotos(props.issue).map((photo) => toAssetUrl(photo.url)),
);
const hasLocation = computed(() => hasValidCoordinates(props.issue.lat, props.issue.lng));
const displayCode = computed(() => props.issue.code.trim() || props.issue.issue_key || `#${props.issue.id}`);
const reporter = computed(() => issueReporter(props.issue));

function preview(urls: readonly string[], index: number): void {
  emit("preview", [...urls], index);
}
</script>

<template>
  <view class="issue-card" role="button" :aria-label="`查看${reporter}上报的${typeLabel}${displayCode}详情`" hover-class="issue-card--pressed" @tap="emit('open', issue.id)">
    <view class="issue-card__avatar" aria-hidden="true">{{ reporter.slice(0, 1) }}</view>
    <view class="issue-card__main">
      <view class="issue-card__header">
        <view class="issue-card__who">
          <text class="issue-card__title">{{ reporter }}</text>
          <text class="issue-card__time" :aria-label="formatDateTime(issue.created_at)"> · {{ formatDateTime(issue.created_at).slice(5, 10) }}</text>
        </view>
        <text class="issue-card__plan" :class="`tone-${plan.tone}`">{{ plan.label }}</text>
      </view>
      <text class="issue-card__facility">{{ displayCode }}</text>
      <text class="issue-card__summary">{{ summary }}</text>
      <IssuePhotoGrid v-if="photoUrls.length" :urls="photoUrls" @preview="preview(photoUrls, $event)" />
      <view class="issue-card__tags">
        <text class="issue-card__tag">{{ issueOrganization(issue) }}</text>
      </view>
      <view class="issue-card__location" :class="{ 'issue-card__location--muted': !hasLocation }" role="button" :aria-label="hasLocation ? '查看地图' : '暂无坐标'" @tap.stop="hasLocation && emit('map', issue.id)">
        <image
          class="issue-card__pin"
          :src="hasLocation ? '/static/icons/map-pin-primary.svg' : '/static/icons/map-pin-muted.svg'"
          mode="aspectFit"
          aria-hidden="true"
        />
        <text class="issue-card__address">{{ issue.address || '未填写地址' }}</text>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.issue-card {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 14px 12px 12px;
  border: 0;
  border-radius: 8px;
  background: #fff;
}
.issue-card--pressed {
  background: #f8fafc;
}
.issue-card__avatar {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 6px;
  background: #e8f1fb;
  color: var(--gb-color-primary);
  font-size: 14px;
  font-weight: 600;
}
.issue-card__main {
  flex: 1;
  min-width: 0;
}
.issue-card__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  line-height: 1.35;
}
.issue-card__who {
  flex: 1;
  min-width: 0;
}
.issue-card__title {
  font-size: 14px;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.issue-card__time {
  color: #8a94a3;
  font-size: 12px;
  white-space: nowrap;
}
.issue-card__plan {
  flex: none;
  font-size: 12px;
  font-weight: 600;
}
.issue-card__facility {
  display: block;
  margin-top: 6px;
  font-size: 14px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.issue-card__summary {
  display: -webkit-box;
  overflow: hidden;
  margin-top: 6px;
  font-size: 14px;
  line-height: 1.5;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
}
.issue-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.issue-card__tag {
  min-width: 0;
  padding: 2px 8px;
  border-radius: 4px;
  background: #f0f4f8;
  color: #5a677a;
  font-size: 12px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}
.issue-card__tag--type {
  color: var(--gb-color-primary);
}
.issue-card__location {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-top: 8px;
  color: var(--gb-color-primary);
}
.issue-card__location--muted {
  color: var(--gb-color-text-secondary);
}
.issue-card__pin {
  display: block;
  flex: none;
  width: 14px;
  height: 14px;
  margin-top: 2px;
}
.issue-card__address {
  display: -webkit-box;
  overflow: hidden;
  flex: 1;
  min-width: 0;
  font-size: 12px;
  line-height: 1.45;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.tone-primary {
  color: var(--gb-color-primary);
}
.tone-success {
  color: var(--gb-color-success);
}
.tone-warning {
  color: var(--gb-color-warning);
}
.tone-danger {
  color: var(--gb-color-danger);
}
.tone-muted {
  color: var(--gb-color-text-muted);
}
</style>
