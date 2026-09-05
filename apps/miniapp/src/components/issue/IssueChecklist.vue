<script setup lang="ts">
import type { Issue, QuizType } from "@gbnt/api-client";
import { computed } from "vue";
import { toAssetUrl } from "@/api/runtime";
import IssuePhotoGrid from "@/components/issue/IssuePhotoGrid.vue";
import { quizIndicatesIssue, quizLabel } from "@/utils/issue-display";

interface ChecklistDisplayItem {
  type: QuizType;
  label: string;
  answer: string;
  description: string;
  abnormal: boolean;
  photos: string[];
}

const props = defineProps<{
  issue: Issue;
}>();

const items = computed<ChecklistDisplayItem[]>(() =>
  props.issue.type_ext.checklist.map((quiz) => ({
    type: quiz.type,
    label: quizLabel(quiz.type),
    answer: quiz.value ? "是" : "否",
    description: quiz.desc.trim(),
    abnormal: quizIndicatesIssue(quiz),
    photos: (quiz.photos ?? []).map((photo) => toAssetUrl(photo.url)),
  })),
);

function preview(urls: readonly string[], index: number): void {
  uni.previewImage({ current: urls[index], urls: [...urls] });
}
</script>

<template>
  <view class="checklist">
    <view v-for="item in items" :key="item.type" class="checklist__item">
      <view class="checklist__header">
        <text class="checklist__label">{{ item.label }}</text>
        <text class="checklist__answer" :class="{ 'checklist__answer--abnormal': item.abnormal }">
          {{ item.answer }}
        </text>
      </view>
      <text v-if="item.description" class="checklist__description">{{ item.description }}</text>
      <IssuePhotoGrid
        v-if="item.photos.length"
        :urls="item.photos"
        compact
        @preview="preview(item.photos, $event)"
      />
    </view>
  </view>
</template>

<style scoped lang="scss">
.checklist__item {
  padding: 24rpx 0;
  border-bottom: 1rpx solid var(--gb-color-border, #edf0f4);
}

.checklist__item:first-child {
  padding-top: 4rpx;
}

.checklist__item:last-child {
  padding-bottom: 4rpx;
  border-bottom: 0;
}

.checklist__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20rpx;
}

.checklist__label {
  flex: 1;
  min-width: 0;
  color: var(--gb-color-text-primary, #172033);
  font-size: 28rpx;
  font-weight: 600;
  line-height: 1.5;
}

.checklist__answer {
  flex-shrink: 0;
  min-width: 64rpx;
  padding: 6rpx 14rpx;
  border-radius: var(--gb-radius-sm, 10rpx);
  background: rgba(26, 127, 75, 0.1);
  color: var(--gb-color-success, #1a7f4b);
  font-size: 26rpx;
  font-weight: 600;
  line-height: 1.3;
  text-align: center;
}

.checklist__answer--abnormal {
  background: rgba(207, 19, 34, 0.09);
  color: var(--gb-color-danger, #cf1322);
}

.checklist__description {
  display: block;
  margin-top: 14rpx;
  color: var(--gb-color-text-secondary, #566176);
  font-size: 26rpx;
  line-height: 1.65;
  white-space: pre-wrap;
}
</style>
