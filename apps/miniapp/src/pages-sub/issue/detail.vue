<script setup lang="ts">
import type { Issue, OrgTreeNode } from "@gbnt/api-client";
import { onLoad, onPullDownRefresh, onUnload } from "@dcloudio/uni-app";
import { computed, shallowRef } from "vue";
import { miniappApi, toAssetUrl } from "@/api/runtime";
import IssueChecklist from "@/components/issue/IssueChecklist.vue";
import IssueInfoList from "@/components/issue/IssueInfoList.vue";
import IssueRectifyHistory from "@/components/issue/IssueRectifyHistory.vue";
import RectifyForm from "@/components/issue/RectifyForm.vue";
import type { RectifyDraftSubmitItem } from "@/components/issue/rectify-types";
import { issueTypeLabel } from "@/domain/issues/definitions";
import {
  errorMessage,
  formatDate,
  formatDateTime,
  hasValidCoordinates,
  issueAbnormalQuizzes,
  issueEditableRectifyQuizzes,
  issuePlanHint,
  issueStatusMeta,
  type IssueInfoRow,
  issueTypeInfoRows,
} from "@/utils/issue-display";

interface PageQuery {
  id?: string;
}

const issueId = shallowRef(0);
const issue = shallowRef<Issue>();
const organizationName = shallowRef("");
const loading = shallowRef(false);
const error = shallowRef("");
const submitting = shallowRef(false);
const restarting = shallowRef(false);
const uploadedFileIds = new Map<string, string>();
let requestSequence = 0;

const status = computed(() => (issue.value ? issueStatusMeta(issue.value.status) : null));
const plan = computed(() => (issue.value ? issuePlanHint(issue.value) : null));
const abnormalQuizzes = computed(() => (issue.value ? issueAbnormalQuizzes(issue.value) : []));
const editableQuizzes = computed(() =>
  issue.value ? issueEditableRectifyQuizzes(issue.value) : [],
);
const canRectify = computed(
  () =>
    Boolean(issue.value) &&
    (issue.value?.status === "new" || issue.value?.status === "pending") &&
    editableQuizzes.value.length > 0,
);
const hasUnsupportedRectification = computed(
  () =>
    Boolean(issue.value) &&
    (issue.value?.status === "new" || issue.value?.status === "pending") &&
    abnormalQuizzes.value.length === 0,
);
const canReRectify = computed(
  () => issue.value?.status === "done" && abnormalQuizzes.value.length > 0,
);
const hasLocation = computed(() =>
  issue.value ? hasValidCoordinates(issue.value.lat, issue.value.lng) : false,
);
const signatureUrl = computed(() =>
  issue.value?.reporter_signature?.url ? toAssetUrl(issue.value.reporter_signature.url) : "",
);
const infoRows = computed<IssueInfoRow[]>(() => {
  const item = issue.value;
  if (!item) return [];
  return [
    {
      label: "所属区域",
      value: organizationName.value || (item.org_id ? `组织 #${item.org_id}` : "—"),
    },
    { label: "项目年度", value: `${item.project_year} 年` },
    { label: "设施编号", value: item.code.trim() || "—" },
    { label: "业务编号", value: item.issue_key || `#${item.id}` },
    { label: "排查时间", value: formatDateTime(item.created_at) },
    { label: "计划完成日期", value: formatDate(item.plan_date) },
    ...issueTypeInfoRows(item),
  ];
});

function findOrganizationPath(
  nodes: readonly OrgTreeNode[],
  targetId: number,
  parents: readonly string[] = [],
): string {
  for (const node of nodes) {
    const path = [...parents, node.name];
    if (node.id === targetId) return path.join(" / ");
    const childPath = findOrganizationPath(node.children, targetId, path);
    if (childPath) return childPath;
  }
  return "";
}

async function loadOrganizationName(targetIssue: Issue, requestId: number): Promise<void> {
  try {
    const result = await miniappApi.regions.list();
    if (requestId !== requestSequence || issue.value?.id !== targetIssue.id) return;
    organizationName.value = findOrganizationPath(result.list, targetIssue.org_id);
  } catch {
    // 区域名称是补充信息；失败时保留组织 ID，不阻断详情展示。
  }
}

async function loadDetail(): Promise<void> {
  if (!issueId.value) return;
  const requestId = ++requestSequence;
  loading.value = true;
  error.value = "";
  organizationName.value = "";

  try {
    const result = await miniappApi.issues.get(issueId.value);
    if (requestId !== requestSequence) return;
    issue.value = result;
    uni.setNavigationBarTitle({ title: `${issueTypeLabel(result.type)}详情` });
    void loadOrganizationName(result, requestId);
  } catch (cause) {
    if (requestId !== requestSequence) return;
    issue.value = undefined;
    error.value = errorMessage(cause, "问题详情加载失败");
  } finally {
    if (requestId === requestSequence) loading.value = false;
  }
}

function openMap(): void {
  const item = issue.value;
  if (!item || !hasLocation.value) return;
  const address = encodeURIComponent(item.address || "问题位置");
  uni.navigateTo({
    url: `/pages-sub/issue/map?id=${item.id}&lat=${item.lat}&lng=${item.lng}&address=${address}`,
  });
}

function previewSignature(): void {
  if (!signatureUrl.value) return;
  uni.previewImage({ current: signatureUrl.value, urls: [signatureUrl.value] });
}

async function uploadRectifyPhotos(paths: readonly string[], item: Issue): Promise<string[]> {
  const fileIds: string[] = [];
  for (const path of paths) {
    const cached = uploadedFileIds.get(path);
    if (cached) {
      fileIds.push(cached);
      continue;
    }

    const result = await miniappApi.attachments.uploadImages({
      files: [{ filePath: path, fileType: "image" }],
      watermark: true,
      lat: hasValidCoordinates(item.lat, item.lng) ? String(item.lat) : undefined,
      lng: hasValidCoordinates(item.lat, item.lng) ? String(item.lng) : undefined,
      address: item.address || undefined,
    });
    const fileId = result.list[0]?.file_id;
    if (!fileId) throw new Error("整改照片上传结果缺少文件编号");
    uploadedFileIds.set(path, fileId);
    fileIds.push(fileId);
  }
  return fileIds;
}

async function submitRectification(drafts: RectifyDraftSubmitItem[]): Promise<void> {
  const item = issue.value;
  if (!item || submitting.value) return;
  submitting.value = true;

  try {
    const rectifyList = [];
    for (const draft of drafts) {
      rectifyList.push({
        type: draft.type,
        note: draft.note,
        file_uuids: await uploadRectifyPhotos(draft.photoPaths, item),
      });
    }
    const updated = await miniappApi.issues.rectify(item.id, { rectify_list: rectifyList });
    issue.value = updated;
    uploadedFileIds.clear();
    uni.showToast({ title: updated.status === "done" ? "整改已完成" : "本次整改已提交", icon: "success" });
  } catch (cause) {
    uni.showToast({ title: errorMessage(cause, "整改提交失败"), icon: "none", duration: 3000 });
  } finally {
    submitting.value = false;
  }
}

function requestReRectify(): void {
  const item = issue.value;
  if (!item || restarting.value) return;
  uni.showModal({
    title: "重新整改",
    content: "重新整改后状态将变为“整改中”，原整改记录会保留。是否继续？",
    confirmText: "继续",
    success: async (result) => {
      if (!result.confirm || restarting.value) return;
      restarting.value = true;
      try {
        issue.value = await miniappApi.issues.reRectify(item.id);
        uni.showToast({ title: "已进入重新整改", icon: "success" });
      } catch (cause) {
        uni.showToast({ title: errorMessage(cause, "重新整改失败"), icon: "none", duration: 3000 });
      } finally {
        restarting.value = false;
      }
    },
  });
}

onLoad((rawQuery) => {
  const query = (rawQuery ?? {}) as PageQuery;
  issueId.value = Number(query.id);
  if (!Number.isInteger(issueId.value) || issueId.value <= 0) {
    issueId.value = 0;
    error.value = "问题编号无效";
    return;
  }
  void loadDetail();
});

onPullDownRefresh(async () => {
  try {
    await loadDetail();
  } finally {
    uni.stopPullDownRefresh();
  }
});

onUnload(() => {
  requestSequence += 1;
  uploadedFileIds.clear();
});
</script>

<template>
  <view class="detail-page">
    <view v-if="loading && !issue" class="detail-page__state">
      <view class="detail-page__spinner" />
      <text>正在加载详情…</text>
    </view>

    <view v-else-if="!issue" class="detail-page__state">
      <text class="detail-page__state-title">无法查看问题详情</text>
      <text class="detail-page__state-text">{{ error }}</text>
      <button v-if="issueId" class="detail-page__retry" @tap="loadDetail">重新加载</button>
    </view>

    <template v-else>
      <view class="detail-page__hero">
        <view class="detail-page__hero-main">
          <text class="detail-page__type">{{ issueTypeLabel(issue.type) }}</text>
          <text class="detail-page__code">{{ issue.code || issue.issue_key || `#${issue.id}` }}</text>
        </view>
        <text v-if="status" class="detail-page__status" :class="`tone-${status.tone}`">
          {{ status.label }}
        </text>
        <view class="detail-page__hero-meta">
          <text>{{ formatDateTime(issue.created_at) }}</text>
          <text v-if="plan" :class="`tone-text-${plan.tone}`">{{ plan.label }}</text>
        </view>
      </view>

      <view class="detail-page__section">
        <text class="detail-page__section-title">基本信息</text>
        <IssueInfoList :rows="infoRows" />
        <button
          class="detail-page__location"
          :disabled="!hasLocation"
          @tap="openMap"
        >
          <text class="detail-page__location-dot" aria-hidden="true">●</text>
          <text class="detail-page__location-text">{{ issue.address || "未填写地址" }}</text>
          <text v-if="hasLocation" class="detail-page__location-action">查看地图 ›</text>
          <text v-else class="detail-page__location-action detail-page__location-action--muted">暂无坐标</text>
        </button>
      </view>

      <view class="detail-page__section">
        <text class="detail-page__section-title">排查清单</text>
        <IssueChecklist :issue="issue" />
      </view>

      <view class="detail-page__section">
        <text class="detail-page__section-title">排查电子签名</text>
        <button
          v-if="signatureUrl"
          class="detail-page__signature-button"
          aria-label="查看排查电子签名"
          @tap="previewSignature"
        >
          <image class="detail-page__signature" :src="signatureUrl" mode="aspectFit" />
        </button>
        <text v-else class="detail-page__empty-text">暂无签名图片</text>
      </view>

      <view v-if="issue.rectify_records.length" class="detail-page__section">
        <text class="detail-page__section-title">整改记录</text>
        <IssueRectifyHistory :records="issue.rectify_records" />
      </view>

      <view v-if="canRectify" class="detail-page__section detail-page__section--rectify">
        <view class="detail-page__section-heading">
          <text class="detail-page__section-title">整改反馈</text>
          <text class="detail-page__section-note">逐项填写，可分批提交</text>
        </view>
        <RectifyForm
          :key="issue.id"
          :items="editableQuizzes"
          :submitting="submitting"
          @submit="submitRectification"
        />
      </view>

      <view v-else-if="hasUnsupportedRectification" class="detail-page__warning">
        <text class="detail-page__warning-title">当前记录暂时无法在线整改</text>
        <text class="detail-page__warning-text">
          后端状态要求整改，但详情中没有可对应的排查项。请联系管理员核对损坏数量与整改项模型。
        </text>
      </view>

      <view v-if="canReRectify" class="detail-page__actions">
        <button
          class="detail-page__secondary-button"
          :disabled="restarting"
          @tap="requestReRectify"
        >
          重新整改
        </button>
      </view>
    </template>
  </view>
</template>

<style scoped lang="scss">
.detail-page {
  min-height: 100vh;
  padding-bottom: calc(48rpx + var(--gb-safe-area-bottom, 0px));
  background: var(--gb-color-background, #f4f7fa);
}

.detail-page__hero {
  position: relative;
  padding: 32rpx 28rpx 28rpx;
  background: linear-gradient(135deg, var(--gb-color-primary-dark, #004a98), var(--gb-color-primary, #015cbb));
  color: #fff;
}

.detail-page__hero-main,
.detail-page__hero-meta,
.detail-page__section-heading {
  display: flex;
  align-items: center;
}

.detail-page__hero-main {
  gap: 16rpx;
  padding-right: 160rpx;
}

.detail-page__type {
  flex-shrink: 0;
  padding: 5rpx 12rpx;
  border-radius: 8rpx;
  background: rgba(255, 255, 255, 0.18);
  font-size: 25rpx;
}

.detail-page__code {
  overflow: hidden;
  font-size: 34rpx;
  font-weight: 650;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-page__status {
  position: absolute;
  top: 32rpx;
  right: 28rpx;
  padding: 7rpx 14rpx;
  border-radius: 999rpx;
  font-size: 25rpx;
  font-weight: 600;
}

.detail-page__hero-meta {
  justify-content: space-between;
  gap: 20rpx;
  margin-top: 22rpx;
  color: rgba(255, 255, 255, 0.78);
  font-size: 24rpx;
}

.detail-page__section {
  margin-top: 16rpx;
  padding: 28rpx;
  background: var(--gb-color-surface, #fff);
}

.detail-page__section--rectify {
  padding-bottom: 32rpx;
}

.detail-page__section-heading {
  justify-content: space-between;
  gap: 20rpx;
}

.detail-page__section-title {
  display: block;
  color: var(--gb-color-text-primary, #172033);
  font-size: 30rpx;
  font-weight: 650;
  line-height: 1.4;
}

.detail-page__section-note {
  color: var(--gb-color-text-muted, #8490a3);
  font-size: 23rpx;
}

.detail-page__location {
  display: flex;
  align-items: flex-start;
  gap: 12rpx;
  width: 100%;
  min-height: 80rpx;
  margin-top: 16rpx;
  padding: 18rpx 0 0;
  border: 0;
  border-top: 1rpx solid var(--gb-color-border, #edf0f4);
  border-radius: 0;
  background: transparent;
  color: inherit;
  line-height: 1.5;
  text-align: left;
}

.detail-page__location::after,
.detail-page__signature-button::after,
.detail-page__retry::after,
.detail-page__secondary-button::after {
  border: 0;
}

.detail-page__location-dot {
  margin-top: 8rpx;
  color: var(--gb-color-primary, #015cbb);
  font-size: 18rpx;
}

.detail-page__location-text {
  flex: 1;
  min-width: 0;
  color: var(--gb-color-text-secondary, #566176);
  font-size: 26rpx;
  word-break: break-all;
}

.detail-page__location-action {
  flex-shrink: 0;
  color: var(--gb-color-primary, #015cbb);
  font-size: 25rpx;
}

.detail-page__location-action--muted {
  color: var(--gb-color-text-muted, #8490a3);
}

.detail-page__signature-button {
  width: 100%;
  min-height: 220rpx;
  margin-top: 22rpx;
  padding: 0;
  overflow: hidden;
  border: 1rpx solid var(--gb-color-border, #e5eaf0);
  border-radius: var(--gb-radius-sm, 12rpx);
  background: #fcfaf4;
  line-height: 1;
}

.detail-page__signature {
  display: block;
  width: 100%;
  height: 220rpx;
}

.detail-page__empty-text {
  display: block;
  padding: 40rpx 0 20rpx;
  color: var(--gb-color-text-muted, #8490a3);
  font-size: 26rpx;
  text-align: center;
}

.detail-page__warning {
  margin: 20rpx 24rpx 0;
  padding: 24rpx;
  border: 1rpx solid rgba(212, 136, 6, 0.35);
  border-radius: var(--gb-radius-md, 16rpx);
  background: #fffbe6;
}

.detail-page__warning-title,
.detail-page__warning-text {
  display: block;
}

.detail-page__warning-title {
  color: #8d5b00;
  font-size: 27rpx;
  font-weight: 600;
}

.detail-page__warning-text {
  margin-top: 10rpx;
  color: #75531b;
  font-size: 24rpx;
  line-height: 1.6;
}

.detail-page__actions {
  padding: 28rpx 24rpx 0;
}

.detail-page__secondary-button,
.detail-page__retry {
  min-height: 84rpx;
  border: 1rpx solid var(--gb-color-primary, #015cbb);
  border-radius: var(--gb-radius-md, 16rpx);
  background: #fff;
  color: var(--gb-color-primary, #015cbb);
  font-size: 28rpx;
  line-height: 82rpx;
}

.detail-page__secondary-button {
  width: 100%;
}

.detail-page__state {
  display: flex;
  min-height: 80vh;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48rpx;
  color: var(--gb-color-text-muted, #8490a3);
  text-align: center;
}

.detail-page__spinner {
  width: 48rpx;
  height: 48rpx;
  margin-bottom: 24rpx;
  border: 5rpx solid rgba(1, 92, 187, 0.16);
  border-top-color: var(--gb-color-primary, #015cbb);
  border-radius: 50%;
  animation: detail-spin 800ms linear infinite;
}

.detail-page__state-title {
  color: var(--gb-color-text-primary, #172033);
  font-size: 30rpx;
  font-weight: 600;
}

.detail-page__state-text {
  margin-top: 14rpx;
  font-size: 25rpx;
  line-height: 1.6;
}

.detail-page__retry {
  min-width: 180rpx;
  margin-top: 28rpx;
  padding: 0 24rpx;
}

.tone-danger {
  background: #fff1f0;
  color: var(--gb-color-danger, #cf1322);
}

.tone-warning {
  background: #fffbe6;
  color: #8d5b00;
}

.tone-success {
  background: #eef9f2;
  color: var(--gb-color-success, #1a7f4b);
}

.tone-text-danger {
  color: #ffd1d5;
}

.tone-text-warning {
  color: #ffe4a3;
}

.tone-text-primary,
.tone-text-muted,
.tone-text-success {
  color: rgba(255, 255, 255, 0.86);
}

@keyframes detail-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
