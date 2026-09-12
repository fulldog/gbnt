<script setup lang="ts">
import type { OrgTreeNode } from "@gbnt/api-client";
import type { MiniappIssue as Issue } from "@/api/types";
import { onLoad, onPullDownRefresh, onShareAppMessage, onShareTimeline, onUnload } from "@dcloudio/uni-app";
import { computed, shallowRef } from "vue";
import { miniappApi, toAssetUrl } from "@/api/runtime";
import IssueChecklist from "@/components/issue/IssueChecklist.vue";
import IssueInfoList from "@/components/issue/IssueInfoList.vue";
import IssueRectifyResult from "@/components/issue/IssueRectifyResult.vue";
import IssueRectifyHistory from "@/components/issue/IssueRectifyHistory.vue";
import IssuePhotoGrid from "@/components/issue/IssuePhotoGrid.vue";
import RectifyForm from "@/components/issue/RectifyForm.vue";
import RecoverableImage from "@/components/common/RecoverableImage.vue";
import { useAuthStore } from "@/stores/auth";
import { rectifyDraftKey } from "@/utils/rectify-draft";
import { formatOrganization } from "@/utils/regions";
import { useBusinessToday } from "@/composables/useBusinessToday";
import type { RectifyFeedbackDraft } from "@/components/issue/rectify-types";
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
const shareTitle = computed(() =>
  `农田专项整治 · ${issue.value ? issueTypeLabel(issue.value.type) : "问题"}详情`,
);
const organizationName = shallowRef("");
const loading = shallowRef(false);
const error = shallowRef("");
const submitting = shallowRef(false);
const showHistory = shallowRef(false);
const uploadedFileIds = new Map<string, string>();
let requestSequence = 0;
let active = true;
const auth = useAuthStore();
const rectifyFormRef = shallowRef<InstanceType<typeof RectifyForm> | null>(null);
const draftKey = computed(() => rectifyDraftKey(auth.user?.id, issueId.value, issue.value?.rectify_round ?? 0));

const status = computed(() => (issue.value ? issueStatusMeta(issue.value.status) : null));
const today = useBusinessToday();
const plan = computed(() => (issue.value ? issuePlanHint(issue.value, today.value) : null));
const abnormalQuizzes = computed(() => (issue.value ? issueAbnormalQuizzes(issue.value) : []));
const editableQuizzes = computed(() =>
  issue.value ? issueEditableRectifyQuizzes(issue.value) : [],
);
const canRectify = computed(
  () =>
    Boolean(issue.value) &&
    (issue.value?.status === "new" || issue.value?.status === "pending") &&
    editableQuizzes.value.length > 0 &&
    issue.value?.within_org_scope === true &&
    Boolean(auth.user?.id && (issue.value?.assignee_user === 0 || issue.value?.assignee_user === auth.user.id)),
);
const isHistoricalReadOnly = computed(() => issue.value?.within_org_scope !== true);
const hasUnsupportedRectification = computed(
  () =>
    Boolean(issue.value) &&
    (issue.value?.status === "new" || issue.value?.status === "pending") &&
    abnormalQuizzes.value.length === 0,
);
const currentRecords = computed(() => issue.value?.rectify_records.filter((record) => (record.round ?? 0) === (issue.value?.rectify_round ?? 0)) ?? []);
const hasLocation = computed(() =>
  issue.value ? hasValidCoordinates(issue.value.lat, issue.value.lng) : false,
);
const signatureUrl = computed(() =>
  issue.value?.reporter_signature?.url ? toAssetUrl(issue.value.reporter_signature.url) : "",
);
const panoramaUrls = computed(() => {
  const item = issue.value;
  if (!item || item.type !== "well") return [];
  return (item.type_ext.panorama_photos ?? []).map((photo) => toAssetUrl(photo.url)).filter(Boolean);
});
const showAdditionalInfo = shallowRef(false);
const infoRows = computed<IssueInfoRow[]>(() => {
  const item = issue.value;
  if (!item) return [];
  return [
    { label: "行政区划", value: formatOrganization(item.org_path || item.org_name || organizationName.value || (item.org_id ? `组织 #${item.org_id}` : "—")) },
    { label: "项目年度", value: `${item.project_year} 年` },
    { label: "设施编号", value: item.code.trim() || "—" },
    { label: "排查日期", value: formatDateTime(item.created_at).slice(0, 10) },
    ...issueTypeInfoRows(item).slice(0, -2),
  ];
});
const additionalInfoRows = computed<IssueInfoRow[]>(() => {
  const item = issue.value;
  if (!item) return [];
  return [
    { label: "设施类型", value: issueTypeLabel(item.type) },
    { label: "当前状态", value: status.value?.label || "—" },
    { label: "业务编号", value: item.issue_key || `#${item.id}` },
    { label: "排查时间", value: formatDateTime(item.created_at) },
    { label: "计划完成日期", value: formatDate(item.plan_date) },
    { label: "上报人", value: item.report_user_name || "未提供" },
    { label: "整改责任人", value: item.assignee_user_name || "未指派或信息缺失" },
    { label: "整改轮次", value: `第 ${(item.rectify_round ?? 0) + 1} 轮` },
    ...issueTypeInfoRows(item).slice(-2),
  ];
});

function findOrganizationPath(
  nodes: readonly OrgTreeNode[],
  targetId: number,
  parents: readonly string[] = [],
): string {
  for (const node of nodes) {
    const path = [...parents, node.name];
    if (node.id === targetId) return path.join("");
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
  if (!issueId.value || submitting.value) return;
  const requestId = ++requestSequence;
  loading.value = true;
  error.value = "";
  organizationName.value = "";

  try {
    const result = await miniappApi.issues.get(issueId.value);
    if (requestId !== requestSequence) return;
    issue.value = result;
    uni.setNavigationBarTitle({ title: `${issueTypeLabel(result.type)}详情` });
    if (!result.org_path && !result.org_name) void loadOrganizationName(result, requestId);
  } catch (cause) {
    if (requestId !== requestSequence) return;
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

function previewPanorama(index: number): void {
  const urls = panoramaUrls.value;
  if (!urls[index]) return;
  uni.previewImage({ current: urls[index], urls: [...urls] });
}

async function uploadRectifyPhotos(paths: readonly string[], item: Issue): Promise<string[]> {
  if (!hasValidCoordinates(item.lat, item.lng) || !item.address.trim()) {
    throw new Error("原记录缺少有效定位，请先由后台补齐地址和坐标，不能生成虚假水印");
  }
  const fileIds: string[] = [];
  for (const path of paths) {
    if (!active) throw new Error("页面已离开，本次整改未提交");
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

async function submitRectification(draft: RectifyFeedbackDraft): Promise<void> {
  const item = issue.value;
  if (!item || !canRectify.value || submitting.value || loading.value) return;
  submitting.value = true;
  try {
    const fileIds = await uploadRectifyPhotos(draft.photoPaths, item);
    if (!active) return;
    const updated = await miniappApi.issues.submitFeedback(item.id, {
      note: draft.note, file_uuids: fileIds, expected_round: item.rectify_round ?? 0,
    });
    if (!active) return;
    rectifyFormRef.value?.discardSubmitted();
    issue.value = updated;
    uploadedFileIds.clear();
    uni.showToast({ title: updated.display_warning || "整改已完成", icon: updated.display_warning ? "none" : "success" });
  } catch (cause) {
    if (active) uni.showToast({ title: errorMessage(cause, "整改提交失败"), icon: "none", duration: 3000 });
  } finally { submitting.value = false; }
}

onShareAppMessage(() => ({
  title: shareTitle.value,
  path: issueId.value > 0 ? `/pages-sub/issue/detail?id=${issueId.value}` : "/pages/todo/index",
}));

onShareTimeline(() => ({
  title: shareTitle.value,
  query: issueId.value > 0 ? `id=${issueId.value}` : "",
}));

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
    if (rectifyFormRef.value?.hasChanges) {
      const confirmed = await new Promise<boolean>((resolve) => uni.showModal({
        title: "确认刷新", content: "刷新可能更新可整改项。说明已尝试保存到本机，未提交照片请勿丢弃。是否继续？",
        success: (result) => resolve(result.confirm), fail: () => resolve(false),
      }));
      if (!confirmed) return;
    }
    await loadDetail();
  } finally {
    uni.stopPullDownRefresh();
  }
});

onUnload(() => {
  active = false;
  requestSequence += 1;
  uploadedFileIds.clear();
});
</script>

<template>
  <view class="detail-page" :class="{ 'detail-page--rectify': canRectify }">
    <view v-if="issue && error" class="detail-page__warning" role="alert">
      <text>更新失败，当前显示上次数据：{{ error }}</text>
      <button @tap="loadDetail">重新加载</button>
    </view>
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
      <view class="detail-page__section detail-page__section--basic">
        <view class="detail-page__section-heading">
          <text class="detail-page__section-title">基本信息</text>
          <text v-if="plan" class="detail-page__section-note" :class="`tone-text-${plan.tone}`">{{ plan.label }}</text>
        </view>
        <IssueInfoList :rows="infoRows" />
        <view v-if="panoramaUrls.length" class="detail-page__panorama">
          <text class="detail-page__panorama-label">全景照片</text>
          <IssuePhotoGrid :urls="panoramaUrls" compact @preview="previewPanorama" />
        </view>
        <button class="detail-page__more" :aria-expanded="showAdditionalInfo" @tap="showAdditionalInfo = !showAdditionalInfo">
          <text>补充信息</text>
          <view class="detail-page__more-action">
            <text>{{ showAdditionalInfo ? '收起' : '展开' }}</text>
            <image class="detail-page__more-icon" :class="{ 'detail-page__more-icon--expanded': showAdditionalInfo }" src="/static/icons/chevron-down.svg" mode="aspectFit" aria-hidden="true" />
          </view>
        </button>
        <IssueInfoList v-if="showAdditionalInfo" :rows="additionalInfoRows" />
        <button
          class="detail-page__location"
          :disabled="!hasLocation"
          @tap="openMap"
        >
          <image class="detail-page__location-icon" src="/static/icons/map-pin-primary.svg" mode="aspectFit" aria-hidden="true" />
          <text class="detail-page__location-text">{{ issue.address || "未填写地址" }}</text>
          <view v-if="hasLocation" class="detail-page__location-action">
            <text>查看地图</text>
            <image class="detail-page__location-chevron" src="/static/icons/chevron-right-primary.svg" mode="aspectFit" aria-hidden="true" />
          </view>
          <text v-else class="detail-page__location-action detail-page__location-action--muted">暂无坐标</text>
        </button>
      </view>

      <view class="detail-page__section">
        <text class="detail-page__section-title">排查清单</text>
        <IssueChecklist :issue="issue" />
      </view>

      <view class="detail-page__section detail-page__section--signature">
        <text class="detail-page__section-title">电子签名</text>
        <view
          v-if="signatureUrl"
          class="detail-page__signature-button"
        >
          <RecoverableImage class="detail-page__signature" :src="signatureUrl" mode="aspectFit" alt="电子签名" @preview="previewSignature" />
        </view>
        <text v-else class="detail-page__empty-text">暂无签名图片</text>
      </view>

      <view v-if="issue.status === 'done' && currentRecords.length" class="detail-page__result-section">
        <IssueRectifyResult :records="currentRecords" />
      </view>
      <view v-if="issue.rectify_records.length" class="detail-page__section">
        <button class="detail-page__more" :aria-expanded="showHistory" @tap="showHistory = !showHistory">
          <text>历史整改记录</text><text>{{ showHistory ? '收起' : '查看' }}</text>
        </button>
        <IssueRectifyHistory v-if="showHistory" :records="issue.rectify_records" :current-round="issue.rectify_round" />
      </view>

      <view v-if="canRectify" class="detail-page__section detail-page__section--rectify">
        <view class="detail-page__section-heading">
          <text class="detail-page__section-title">整改反馈</text>
        </view>
        <RectifyForm
          ref="rectifyFormRef"
          :key="`${issue.id}:${issue.rectify_round ?? 0}`"
          :items="editableQuizzes"
          :storage-key="draftKey"
          :submitting="submitting || loading"
          @submit="submitRectification"
        />
      </view>

      <view v-else-if="isHistoricalReadOnly" class="detail-page__warning">
        <text class="detail-page__warning-title">该记录仅可查看</text>
        <text class="detail-page__warning-text">
          该整改已不在当前账号所属组织范围内，不能再提交、整改或删除。
        </text>
      </view>

      <view v-else-if="hasUnsupportedRectification" class="detail-page__warning">
        <text class="detail-page__warning-title">当前记录暂时无法在线整改</text>
        <text class="detail-page__warning-text">
          记录缺少可处理的排查项，请联系管理员核对后再整改。
        </text>
      </view>

    </template>
  </view>
</template>

<style scoped lang="scss">
.detail-page {
  min-height: 100vh;
  padding-bottom: calc(24px + env(safe-area-inset-bottom));
  background: #fff;
  font-size: 14px;
  line-height: 1.55;
}

.detail-page__section-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.detail-page__section {
  padding: 14px 16px 16px;
  border-top: 10px solid #f5f7fb;
  background: #fff;
}

.detail-page__section--rectify {
  padding-bottom: 32rpx;
}

.detail-page__section-title {
  display: block;
  color: #000;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.35;
}

.detail-page__section-note {
  color: var(--gb-color-text-secondary);
  font-size: 14px;
}

.detail-page__panorama {
  padding: 6px 0 0;
}

.detail-page__panorama-label {
  display: block;
  margin-bottom: 10px;
  color: var(--gb-color-text-secondary, #6b7a90);
  font-size: 14px;
  line-height: 1.55;
}

.detail-page__location {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  width: 100%;
  min-height: 0;
  margin-top: 10px;
  padding: 10px 0 0;
  border: 0;
  border-top: 1px solid #eef1f5;
  border-radius: 0;
  background: transparent;
  color: var(--gb-color-primary);
  font-size: 14px;
  line-height: 1.5;
  text-align: left;
}

.detail-page__location::after,
.detail-page__signature-button::after,
.detail-page__retry::after {
  border: 0;
}

.detail-page__location-icon {
  flex: none;
  width: 16px;
  height: 16px;
  margin-top: 2px;
}

.detail-page__location-text {
  flex: 1;
  min-width: 0;
  color: var(--gb-color-primary);
  font-size: 14px;
  overflow-wrap: anywhere;
}

.detail-page__location-action {
  display: flex;
  flex: none;
  align-items: center;
  gap: 2px;
  margin-top: 1px;
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--gb-color-primary-soft);
  color: var(--gb-color-primary);
  font-size: 14px;
  font-weight: 600;
}

.detail-page__location-chevron {
  flex: none;
  width: 14px;
  height: 14px;
}

.detail-page__location-action--muted {
  color: var(--gb-color-text-muted, #8490a3);
}

.detail-page__signature-button {
  width: 100%;
  height: 120px;
  margin-top: 8px;
  padding: 0;
  overflow: hidden;
  border: 0;
  border-radius: 6px;
  background: #fff;
  line-height: 1;
}

.detail-page__signature {
  display: block;
  width: 100%;
  height: 120px;
}

.detail-page__empty-text {
  display: block;
  padding: 40rpx 0 20rpx;
  color: var(--gb-color-text-muted, #8490a3);
  font-size: 14px;
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
  font-size: 16px;
  font-weight: 600;
}

.detail-page__warning-text {
  margin-top: 10rpx;
  color: #75531b;
  font-size: 14px;
  line-height: 1.6;
}

.detail-page__retry {
  min-height: 84rpx;
  border: 1rpx solid var(--gb-color-primary, #015cbb);
  border-radius: var(--gb-radius-md, 16rpx);
  background: #fff;
  color: var(--gb-color-primary, #015cbb);
  font-size: 16px;
  line-height: 82rpx;
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
  font-size: 16px;
  font-weight: 600;
}

.detail-page__state-text {
  margin-top: 14rpx;
  font-size: 14px;
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
  color: var(--gb-color-danger);
}

.tone-text-warning {
  color: var(--gb-color-warning);
}

.tone-text-primary {
  color: var(--gb-color-primary);
}
.tone-text-muted {
  color: var(--gb-color-text-secondary);
}
.tone-text-success {
  color: var(--gb-color-success);
}

@keyframes detail-spin {
  to {
    transform: rotate(360deg);
  }
}
.detail-page__section--basic {
  border-top: 0;
}
.detail-page__section--signature {
  border-top-color: #f5f7fb;
}
.detail-page__result-section {
  border-top: 10px solid #f5f7fb;
}
.detail-page--rectify {
  padding-bottom: calc(112px + env(safe-area-inset-bottom));
}
.detail-page__more {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 36px;
  margin: 4px 0 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: #fff;
  color: var(--gb-color-text-secondary);
  font-size: 12px;
  line-height: 36px;
}
.detail-page__more-action {
  display: flex;
  align-items: center;
  gap: 4px;
}
.detail-page__more-icon {
  flex: none;
  width: 14px;
  height: 14px;
}
.detail-page__more-icon--expanded {
  transform: rotate(180deg);
}
</style>
