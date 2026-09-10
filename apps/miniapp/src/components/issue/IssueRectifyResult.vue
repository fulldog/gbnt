<script setup lang="ts">
import type { RectifyRecord } from "@gbnt/api-client";
import { computed } from "vue";
import { toAssetUrl } from "@/api/runtime";
import IssuePhotoGrid from "./IssuePhotoGrid.vue";
import { formatDateTime } from "@/utils/issue-display";

const props = defineProps<{ records: readonly RectifyRecord[] }>();
// 同一次反馈会覆盖多个异常项，结果区合并重复说明与照片；完整分项记录仍可展开查看。
const notes = computed(() => [...new Set(props.records.map((record) => record.note.trim()).filter(Boolean))]);
const photos = computed(() => [...new Set(props.records.flatMap((record) => record.photos.map((photo) => toAssetUrl(photo.url))))]);
const completedAt = computed(() => props.records.reduce((latest, record) =>
  Date.parse(record.created_at) > Date.parse(latest || "1970-01-01") ? record.created_at : latest, ""));
function preview(index: number): void {
  uni.previewImage({ current: photos.value[index], urls: [...photos.value] });
}
</script>

<template>
  <view class="rectify-result">
    <view class="rectify-result__heading">
      <view class="rectify-result__icon"><image class="rectify-result__check" src="/static/icons/check-white.svg" mode="aspectFit" aria-hidden="true" /></view>
      <text class="rectify-result__title">整改反馈</text>
      <text class="rectify-result__badge">已完成</text>
    </view>
    <text v-for="note in notes" :key="note" class="rectify-result__note">{{ note }}</text>
    <IssuePhotoGrid v-if="photos.length" :urls="photos" compact @preview="preview" />
    <text class="rectify-result__time">完成时间：{{ formatDateTime(completedAt) }}</text>
  </view>
</template>

<style scoped lang="scss">
.rectify-result { margin: 4px 16px 16px; padding: 14px 14px 16px; border-radius: 8px; background: #eef7f2; }
.rectify-result__heading { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.rectify-result__icon { display: flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 50%; background: #1a7f4b; }
.rectify-result__check { width: 13px; height: 13px; }
.rectify-result__title { flex: 1; min-width: 0; color: #0f3d28; font-size: 14px; font-weight: 700; }
.rectify-result__badge { height: 22px; padding: 0 8px; border-radius: 4px; background: rgba(26, 127, 75, .14); color: #1a7f4b; font-size: 12px; font-weight: 600; line-height: 22px; }
.rectify-result__note { display: block; margin-bottom: 8px; color: #1a2b22; font-size: 14px; line-height: 1.6; overflow-wrap: anywhere; white-space: pre-wrap; }
.rectify-result__time { display: block; margin-top: 10px; color: #1a2b22; font-size: 14px; line-height: 1.4; }
</style>
