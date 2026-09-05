<script setup lang="ts">
import type { IssueStatus, IssueType } from "@gbnt/api-client";
import type { MiniappIssue } from "@/api/types";
import { computed } from "vue";
import { toAssetUrl } from "@/api/runtime";
import IssuePhotoGrid from "@/components/issue/IssuePhotoGrid.vue";
import { formatDateTime, issueChecklistPhotos, issueSummary, issueReporter, issueOrganization, issuePlanHint } from "@/utils/issue-display";

const props = defineProps<{ issue: MiniappIssue; today?: string }>();
const emit = defineEmits<{
  open: [id: number];
  preview: [urls: string[], current: string];
}>();

const typeLabels: Record<IssueType, string> = {
  well: "机井",
  road: "道路",
  bridge: "桥涵闸",
  forest: "林网",
  transformer: "变压器",
};

const typeMarks: Record<IssueType, string> = {
  well: "井",
  road: "路",
  bridge: "桥",
  forest: "林",
  transformer: "电",
};

const statusLabels: Record<IssueStatus, string> = {
  new: "待整改",
  pending: "整改中",
  done: "已整改",
};

const photos = computed(() => {
  return issueChecklistPhotos(props.issue).map((photo) => toAssetUrl(photo.url)).filter(Boolean);
});
const summary = computed(() => issueSummary(props.issue));
const plan = computed(() => issuePlanHint(props.issue, props.today));

const createdText = computed(() => formatDateTime(props.issue.created_at));
const title = computed(
  () => `${typeLabels[props.issue.type]} · ${props.issue.code || props.issue.issue_key}`,
);

function preview(index: number): void {
  const current = photos.value[index];
  if (current) emit("preview", photos.value, current);
}
</script>

<template>
  <view
    class="mine-issue-card"
    role="button"
    :aria-label="`查看${title}详情`"
    @tap="emit('open', issue.id)"
  >
    <view class="mine-issue-card__header">
      <view class="mine-issue-card__mark" aria-hidden="true">
        {{ typeMarks[issue.type] }}
      </view>
      <view class="mine-issue-card__heading">
        <text class="mine-issue-card__title">{{ title }}</text>
        <text v-if="createdText" class="mine-issue-card__time">{{ createdText }}</text>
      </view>
      <text class="mine-issue-card__status" :class="`mine-issue-card__status--${issue.status}`">
        {{ statusLabels[issue.status] }}
      </text>
    </view>

    <view class="mine-issue-card__reporter">
      <text>{{ issueReporter(issue) }}</text>
      <text>{{ issueOrganization(issue) }}</text>
    </view>
    <text class="mine-issue-card__summary">{{ summary }}</text>
    <text class="mine-issue-card__address">{{ issue.address || "暂未填写地址" }}</text>

    <IssuePhotoGrid v-if="photos.length" :urls="photos" :max="3" compact @preview="preview" />

    <view class="mine-issue-card__meta">
      <text>{{ issue.project_year }} 年度</text>
      <text>{{ plan.label }}</text>
      <text class="mine-issue-card__caret" aria-hidden="true">›</text>
    </view>
  </view>
</template>

<style scoped lang="scss">
.mine-issue-card__reporter {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 8px;
  margin-top: 12px;
  color: var(--gbnt-text-secondary, #526277);
  font-size: 13px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.mine-issue-card__summary {
  display: -webkit-box;
  overflow: hidden;
  margin-top: 10px;
  color: var(--gbnt-text, #152033);
  font-size: 14px;
  line-height: 1.6;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.mine-issue-card {
  padding: 16px;
  border: 1px solid var(--gbnt-border, #dce4ee);
  border-radius: 8px;
  background: #ffffff;
}

.mine-issue-card:active {
  background: #f8fafc;
}

.mine-issue-card__header {
  display: flex;
  min-height: 44px;
  align-items: center;
  gap: 10px;
}

.mine-issue-card__mark {
  display: flex;
  width: 40px;
  height: 40px;
  flex: none;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--gbnt-primary-soft, #e8f1fb);
  color: var(--gbnt-primary, #015cbb);
  font-size: 15px;
  font-weight: 700;
}

.mine-issue-card__heading {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
}

.mine-issue-card__title {
  overflow: hidden;
  color: var(--gbnt-text, #152033);
  font-size: 15px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mine-issue-card__time {
  margin-top: 4px;
  color: #7b8798;
  font-size: 12px;
}

.mine-issue-card__status {
  display: flex;
  min-height: 28px;
  flex: none;
  align-items: center;
  padding: 0 9px;
  border-radius: 4px;
  font-size: 12px;
}

.mine-issue-card__status--new {
  background: #fff3e0;
  color: #a45b00;
}

.mine-issue-card__status--pending {
  background: #e8f1fb;
  color: #015cbb;
}

.mine-issue-card__status--done {
  background: #e7f6ee;
  color: #197447;
}

.mine-issue-card__address {
  display: block;
  margin-top: 12px;
  color: var(--gbnt-text-secondary, #526277);
  font-size: 14px;
  line-height: 1.55;
}

.mine-issue-card__photos {
  display: flex;
  gap: 7px;
  margin-top: 12px;
}

.mine-issue-card__photo {
  width: calc((100vw - 94px) / 3);
  height: calc((100vw - 94px) / 3);
  max-width: 108px;
  max-height: 108px;
  border-radius: 5px;
  background: #eef3f8;
}

.mine-issue-card__meta {
  display: flex;
  min-height: 44px;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
  border-top: 1px solid #eef2f6;
  color: #7b8798;
  font-size: 12px;
}

.mine-issue-card__caret {
  margin-left: auto;
  color: #a8b2c0;
  font-size: 24px;
}
</style>
