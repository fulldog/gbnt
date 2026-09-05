<script setup lang="ts">
import { computed, reactive, ref, shallowRef, watch } from "vue";
import { onHide, onLoad, onUnload } from "@dcloudio/uni-app";
import type { IssueType } from "@gbnt/api-client";
import { miniappApi, toAssetUrl } from "@/api/runtime";
import SignaturePad from "@/components/media/SignaturePad.vue";
import RecoverableImage from "@/components/common/RecoverableImage.vue";
import IssueTypeFields from "@/components/report/IssueTypeFields.vue";
import QuizCard from "@/components/report/QuizCard.vue";
import { useLocation } from "@/composables/report/useLocation";
import { useRegions } from "@/composables/report/useRegions";
import { useReportDraft } from "@/composables/report/useReportDraft";
import {
  ISSUE_TYPE_OPTIONS,
  PROJECT_YEAR_OPTIONS,
  QUIZ_DEFINITIONS,
  issueTypeLabel,
} from "@/domain/issues/definitions";
import {
  createReportForm,
  changeQuizAnswer,
  replaceIssueType,
  type QuizFormItem,
  type ReportDetailsForm,
  type ReportFormState,
  type UploadedPhoto,
} from "@/domain/issues/form";
import { buildCreateIssueInput } from "@/domain/issues/mapper";
import {
  reportNeedsRectify,
  validateBasicStep,
  validateQuizItem,
  validateSubmitStep,
} from "@/domain/issues/validation";
import { inputEventValue, type InputEventLike } from "@/utils/events";
import { useAuthStore } from "@/stores/auth";

interface PickerEventLike {
  detail: { value: string | number };
}

type SignaturePadInstance = InstanceType<typeof SignaturePad>;

const step = shallowRef(1);
const form = reactive<ReportFormState>(createReportForm());
const errors = ref<string[]>([]);
const submitting = shallowRef(false);
const uploadingSignature = shallowRef(false);
const signatureRef = ref<SignaturePadInstance | null>(null);
const pendingPhotos = shallowRef<ReadonlySet<string>>(new Set());
const hasPendingPhotos = computed(() => pendingPhotos.value.size > 0);
const draftReady = shallowRef(false);
const draftOwnerId = shallowRef<number | null>(null);
let draftTimer: ReturnType<typeof setTimeout> | undefined;
let active = true;
let latestSignatureUploadToken = 0;
let activeSignatureUploadToken: number | null = null;
const authStore = useAuthStore();
const { options: regionOptions, loading: regionsLoading, error: regionsError, load } =
  useRegions();
const { choosing: choosingLocation, choose } = useLocation();
const { loadDraft, saveDraft, clearDraft, saveState } = useReportDraft(
  () => draftOwnerId.value,
);

const definitions = computed(() => QUIZ_DEFINITIONS[form.type]);
const needsRectify = computed(() => reportNeedsRectify(form));
const totalSteps = computed(() => definitions.value.length + 2);
const currentQuiz = computed(() => form.quizzes[step.value - 2]);
const currentDefinition = computed(() => definitions.value[step.value - 2]);
const progress = computed(() => `${Math.round((step.value / totalSteps.value) * 100)}%`);
const stepTitle = computed(() => {
  if (step.value === 1) return "填写设施信息";
  if (step.value < totalSteps.value) return currentDefinition.value?.label || "完成现场排查";
  return "确认并提交";
});
const draftHint = computed(() => saveState.value === "failed" ? "草稿保存失败，请勿退出，可点击重试" :
  saveState.value === "saved" ? "草稿已保存到本机" : "填写内容将自动保存到本机");
const locationInput = computed(() => ({
  lat: form.lat,
  lng: form.lng,
  address: form.address,
}));
const regionPickerIndex = computed(() =>
  Math.max(0, regionOptions.value.findIndex((item) => item.id === form.orgId)),
);
const yearPickerIndex = computed(() =>
  Math.max(
    0,
    PROJECT_YEAR_OPTIONS.findIndex((item) => item.value === form.projectYear),
  ),
);
const typePickerIndex = computed(() =>
  Math.max(0, ISSUE_TYPE_OPTIONS.findIndex((item) => item.value === form.type)),
);

function assignForm(next: ReportFormState): void {
  Object.assign(form, next);
}

function showFirstError(nextErrors: string[]): void {
  errors.value = nextErrors;
  if (nextErrors[0]) {
    uni.showToast({ title: nextErrors[0], icon: "none", duration: 2800 });
  }
  uni.pageScrollTo({ scrollTop: 0, duration: 180 });
}

function setPhotosPending(type: string, value: boolean): void {
  const next = new Set(pendingPhotos.value);
  if (value) next.add(type); else next.delete(type);
  pendingPhotos.value = next;
}

function blockForPhotos(): boolean {
  if (!hasPendingPhotos.value) return false;
  uni.showToast({ title: "请等待照片上传完成，失败照片请重试或移除", icon: "none" });
  return true;
}

function selectType(event: PickerEventLike): void {
  if (blockForPhotos() || submitting.value) return;
  const option = ISSUE_TYPE_OPTIONS[Number(event.detail.value)];
  if (!option || option.value === form.type) {
    return;
  }
  uni.showModal({
    title: "切换设施类型",
    content: "切换后将清空当前类型的扩展字段、排查项和签名，是否继续？",
    confirmText: "继续切换",
    success: (result) => {
      if (result.confirm) {
        replaceIssueType(form, option.value);
        errors.value = [];
      }
    },
  });
}

function selectYear(event: PickerEventLike): void {
  const option = PROJECT_YEAR_OPTIONS[Number(event.detail.value)];
  if (option) {
    form.projectYear = option.value;
  }
}

function selectRegion(event: PickerEventLike): void {
  const option = regionOptions.value[Number(event.detail.value)];
  if (option) {
    form.orgId = option.id;
    form.orgLabel = option.label;
  }
}

function updateText(
  key: "code" | "address",
  event: Event | InputEventLike,
): void {
  form[key] = inputEventValue(event);
}

function updateDetail(key: keyof ReportDetailsForm, value: string): void {
  const details = form.details as unknown as Record<keyof ReportDetailsForm, string>;
  details[key] = value;
}

function updateQuizPhotos(item: QuizFormItem, photos: UploadedPhoto[]): void {
  item.photos = photos;
  saveDraft(form);
}

async function chooseLocation(): Promise<void> {
  try {
    const location = await choose();
    if (!location) {
      return;
    }
    form.address = location.address;
    form.lat = location.latitude;
    form.lng = location.longitude;
  } catch (error) {
    uni.showToast({
      title: error instanceof Error ? error.message : "选择位置失败",
      icon: "none",
    });
  }
}

function currentStepErrors(): string[] {
  if (step.value === 1) {
    return validateBasicStep(form);
  }
  if (step.value < totalSteps.value && currentQuiz.value) {
    return validateQuizItem(form.type, currentQuiz.value);
  }
  return [];
}

function nextStep(): void {
  if (blockForPhotos() || submitting.value || uploadingSignature.value) return;
  const nextErrors = currentStepErrors();
  if (nextErrors.length > 0) {
    showFirstError(nextErrors);
    return;
  }
  errors.value = [];
  saveDraft(form);
  step.value = Math.min(totalSteps.value, step.value + 1);
  uni.pageScrollTo({ scrollTop: 0, duration: 180 });
}

function previousStep(): void {
  if (blockForPhotos() || submitting.value || uploadingSignature.value) return;
  errors.value = [];
  saveDraft(form);
  step.value = Math.max(1, step.value - 1);
  uni.pageScrollTo({ scrollTop: 0, duration: 180 });
}

function resetSignatureUpload(): void {
  latestSignatureUploadToken += 1;
  form.signatureFileId = "";
  form.signaturePreviewUrl = "";
  if (draftReady.value && !submitting.value) saveDraft(form);
}

function isCurrentSignatureUpload(token: number, revision: number): boolean {
  return (
    active && token === latestSignatureUploadToken &&
    signatureRef.value?.getRevision() === revision
  );
}

async function uploadSignature(): Promise<boolean> {
  if (!active || submitting.value || uploadingSignature.value) {
    return false;
  }

  const uploadToken = ++latestSignatureUploadToken;
  activeSignatureUploadToken = uploadToken;
  uploadingSignature.value = true;
  try {
    const signature = await signatureRef.value?.exportPng();
    if (!signature) {
      throw new Error("签名板尚未准备完成");
    }
    if (!isCurrentSignatureUpload(uploadToken, signature.revision)) {
      if (active) uni.showToast({ title: "签名已变更，请重新确认", icon: "none" });
      return false;
    }

    const result = await miniappApi.attachments.uploadImages({
      files: [{ filePath: signature.filePath, fileType: "image" }],
      watermark: false,
    });
    if (!isCurrentSignatureUpload(uploadToken, signature.revision)) {
      if (active) uni.showToast({ title: "签名已变更，请重新确认", icon: "none" });
      return false;
    }

    const file = result.list[0];
    if (!file) {
      throw new Error("签名上传结果为空");
    }
    form.signatureFileId = file.file_id;
    form.signaturePreviewUrl = toAssetUrl(file.url) || signature.filePath;
    saveDraft(form);
    uni.showToast({ title: "签名已确认", icon: "success" });
    return true;
  } catch (error) {
    if (active) uni.showToast({
      title: error instanceof Error ? error.message : "签名上传失败",
      icon: "none",
    });
    return false;
  } finally {
    if (activeSignatureUploadToken === uploadToken) {
      activeSignatureUploadToken = null;
      uploadingSignature.value = false;
    }
  }
}

async function submit(): Promise<void> {
  if (submitting.value || uploadingSignature.value || blockForPhotos()) {
    return;
  }
  if (!form.signatureFileId && !(await uploadSignature())) {
    return;
  }
  const nextErrors = validateSubmitStep(form);
  if (nextErrors.length > 0) {
    showFirstError(nextErrors);
    return;
  }
  submitting.value = true;
  uni.showLoading({ title: "正在提交", mask: true });
  try {
    const issue = await miniappApi.issues.create(buildCreateIssueInput(form));
    const draftCleared = clearDraft();
    if (!active) return;
    assignForm(createReportForm());
    step.value = 1;
    signatureRef.value?.clear();
    uni.hideLoading();
    const warning = issue.display_warning || (!draftCleared ? "上报已成功，本机草稿清理失败，请勿重复提交" : "");
    uni.showToast({ title: warning || `上报成功：${issue.issue_key}`, icon: warning ? "none" : "success", duration: warning ? 3500 : 1500 });
    setTimeout(() => {
      if (active) uni.switchTab({ url: "/pages/todo/index" });
    }, 900);
  } catch (error) {
    uni.hideLoading();
    if (!active) return;
    saveDraft(form);
    uni.showToast({
      title: error instanceof Error ? error.message : "上报失败，请稍后重试",
      icon: "none",
      duration: 3000,
    });
  } finally {
    uni.hideLoading();
    submitting.value = false;
  }
}

function restoreDraft(): void {
  const draft = loadDraft();
  if (!draft) {
    draftReady.value = true;
    return;
  }
  uni.showModal({
    title: "发现未提交草稿",
    content: "是否继续上次的巡查上报？",
    confirmText: "继续填写",
    cancelText: "放弃草稿",
    success: (result) => {
      if (!active) return;
      if (result.confirm) {
        assignForm(draft);
        draftReady.value = true;
        return;
      }
      clearDraft();
      draftReady.value = true;
    },
    fail: () => { if (active) draftReady.value = true; },
  });
}

onLoad(async () => {
  await authStore.restore();
  if (!active) return;
  if (!authStore.isAuthenticated) { uni.reLaunch({ url: "/pages/login/index" }); return; }
  draftOwnerId.value = authStore.user?.id ?? null;
  void load();
  restoreDraft();
});

watch(form, () => {
  if (!draftReady.value || submitting.value) return;
  if (draftTimer) clearTimeout(draftTimer);
  draftTimer = setTimeout(() => saveDraft(form), 500);
}, { deep: true });

watch(() => JSON.stringify({ type: form.type, year: form.projectYear, org: form.orgId,
  address: form.address, lat: form.lat, lng: form.lng, code: form.code, details: form.details, quizzes: form.quizzes, planDate: form.planDate }),
() => {
  if (draftReady.value && form.signatureFileId) resetSignatureUpload();
}, { flush: "sync" });

onHide(() => {
  if (!submitting.value && draftReady.value) {
    if (draftTimer) clearTimeout(draftTimer);
    saveDraft(form);
  }
});
onUnload(() => {
  active = false;
  latestSignatureUploadToken += 1;
  if (draftTimer) clearTimeout(draftTimer);
});
</script>

<template>
  <view class="report-page page-shell">
    <view v-if="!draftReady" class="section-card">正在恢复登录状态与上报草稿…</view>
    <template v-else>
    <view class="report-hero">
      <view class="report-hero__eyebrow">现场巡查</view>
      <text class="report-hero__title">{{ stepTitle }}</text>
      <text class="report-hero__subtitle">第 {{ step }} 步，共 {{ totalSteps }} 步</text>
      <button class="draft-status" :class="{ 'draft-status--failed': saveState === 'failed' }" @tap="saveDraft(form)">{{ draftHint }}</button>
      <view class="progress" aria-label="上报进度">
        <view class="progress__value" :style="{ width: progress }" />
      </view>
    </view>

    <view v-if="errors.length" class="error-summary" role="alert">
      <text class="error-summary__title">请检查以下内容</text>
      <text v-for="message in errors" :key="message" class="error-summary__item">· {{ message }}</text>
    </view>

    <template v-if="step === 1">
      <view class="section-card">
        <view class="section-heading">
          <text class="section-heading__title">基本信息</text>
          <text class="section-heading__desc">带 * 的内容为必填项</text>
        </view>

        <view class="form-stack">
          <view class="form-field">
            <text class="form-label"><text class="required">*</text>设施类型</text>
            <picker :range="ISSUE_TYPE_OPTIONS" range-key="label" :value="typePickerIndex" @change="selectType">
              <view class="picker-value">{{ issueTypeLabel(form.type) }}</view>
            </picker>
          </view>

          <view class="form-field">
            <text class="form-label"><text class="required">*</text>行政区划</text>
            <picker
              :disabled="regionsLoading || regionOptions.length === 0"
              :range="regionOptions"
              range-key="label"
              :value="regionPickerIndex"
              @change="selectRegion"
            >
              <view class="picker-value" :class="{ 'picker-value--placeholder': !form.orgLabel }">
                {{ form.orgLabel || (regionsLoading ? "正在加载…" : "请选择末级行政区划") }}
              </view>
            </picker>
            <view v-if="regionsError" class="inline-error">
              <text>{{ regionsError }}</text>
              <button class="text-button" @tap="load">重新加载</button>
            </view>
          </view>

          <view class="form-field">
            <text class="form-label"><text class="required">*</text>项目年度</text>
            <picker :range="PROJECT_YEAR_OPTIONS" range-key="label" :value="yearPickerIndex" @change="selectYear">
              <view class="picker-value">{{ form.projectYear }} 年</view>
            </picker>
          </view>

          <view class="form-field">
            <text class="form-label">设施编号</text>
            <input class="form-input" :value="form.code" placeholder="不填写时由后端生成" @input="updateText('code', $event)" />
          </view>

          <view class="form-field">
            <view class="form-label-row">
              <text class="form-label"><text class="required">*</text>现场位置</text>
              <button class="location-button" :disabled="choosingLocation" @tap="chooseLocation">
                {{ choosingLocation ? "正在打开地图…" : form.lat === null ? "选择位置" : "重新选择" }}
              </button>
            </view>
            <textarea
              class="form-textarea"
              :value="form.address"
              maxlength="300"
              auto-height
              placeholder="先选择地图位置，再补充详细地址"
              @input="updateText('address', $event)"
            />
            <text v-if="form.lat !== null && form.lng !== null" class="coordinate">
              GCJ-02：{{ form.lat.toFixed(6) }}, {{ form.lng.toFixed(6) }}
            </text>
          </view>
        </view>
      </view>

      <view class="section-card">
        <view class="section-heading">
          <text class="section-heading__title">{{ issueTypeLabel(form.type) }}信息</text>
          <text class="section-heading__desc">字段严格对应当前后端契约</text>
        </view>
        <IssueTypeFields :type="form.type" :details="form.details" @update-field="updateDetail" />
      </view>
    </template>

    <template v-else-if="step < totalSteps">
      <view class="section-intro">
        <text class="section-intro__title">{{ issueTypeLabel(form.type) }}排查清单</text>
        <text class="section-intro__desc">
          当前第 {{ step - 1 }} 题，共 {{ definitions.length }} 题；完成本题后进入下一题。
        </text>
      </view>
      <view class="quiz-list">
        <QuizCard
          v-if="currentQuiz && currentDefinition"
          :key="currentQuiz.type"
          :item="currentQuiz"
          :definition="currentDefinition"
          :disabled="hasPendingPhotos"
          :issue-type="form.type"
          :location="locationInput"
          @answer="changeQuizAnswer(currentQuiz, $event)"
          @description="currentQuiz.desc = $event"
          @photos="updateQuizPhotos(currentQuiz, $event)"
          @pending="setPhotosPending(currentQuiz.type, $event)"
        />
      </view>
    </template>

    <template v-else>
      <view class="section-card review-card">
        <view class="section-heading">
          <text class="section-heading__title">上报确认</text>
          <text class="section-heading__desc">提交后将进入正式问题台账</text>
        </view>
        <view class="review-list">
          <view class="review-row"><text>设施类型</text><text>{{ issueTypeLabel(form.type) }}</text></view>
          <view class="review-row"><text>行政区划</text><text>{{ form.orgLabel }}</text></view>
          <view class="review-row"><text>项目年度</text><text>{{ form.projectYear }} 年</text></view>
          <view class="review-row"><text>现场地址</text><text>{{ form.address }}</text></view>
          <view class="review-row">
            <text>预计状态</text>
            <text class="status-pill" :class="needsRectify ? 'status-pill--warning' : 'status-pill--success'">
              {{ needsRectify ? "待整改" : "已整改" }}
            </text>
          </view>
        </view>

        <view v-if="needsRectify" class="form-field review-plan">
          <text class="form-label"><text class="required">*</text>计划整改完成日期</text>
          <picker mode="date" :value="form.planDate" @change="form.planDate = String($event.detail.value)">
            <view class="picker-value" :class="{ 'picker-value--placeholder': !form.planDate }">
              {{ form.planDate || "请选择计划日期" }}
            </view>
          </picker>
        </view>
      </view>

      <SignaturePad ref="signatureRef" :disabled="submitting" @changed="resetSignatureUpload" @cleared="resetSignatureUpload" />
      <view v-if="form.signaturePreviewUrl" class="signature-confirmed">
        <view class="signature-preview"><RecoverableImage :src="form.signaturePreviewUrl" mode="aspectFit" alt="已确认的电子签名" /></view>
        <text>签名已上传；重新书写后需要再次确认。</text>
      </view>
      <button class="secondary-button signature-button" :disabled="uploadingSignature || submitting" @tap="uploadSignature">
        {{ uploadingSignature ? "正在上传签名…" : form.signatureFileId ? "重新确认签名" : "确认并上传签名" }}
      </button>
    </template>

    <view class="sticky-actions safe-bottom">
      <button v-if="step > 1" class="secondary-button" :disabled="submitting || uploadingSignature || hasPendingPhotos" @tap="previousStep">
        上一步
      </button>
      <button v-if="step < totalSteps" class="primary-button" :disabled="hasPendingPhotos" @tap="nextStep">
        下一步
      </button>
      <button v-else class="primary-button" :disabled="submitting || uploadingSignature || hasPendingPhotos" @tap="submit">
        {{ submitting ? "正在提交…" : "提交巡查记录" }}
      </button>
    </view>
    </template>
  </view>
</template>

<style scoped lang="scss">
.draft-status { padding: 8rpx 0; margin: 8rpx 0 0; min-height: 44px; background: transparent; color: #e6efff; text-align: left; font-size: 24rpx; line-height: 1.5; }
.draft-status::after { border: 0; }
.draft-status--failed { color: #fff2b3; }
.report-page {
  padding-bottom: calc(150rpx + env(safe-area-inset-bottom));
}

.report-hero {
  padding: 36rpx 32rpx 34rpx;
  color: #fff;
  background: linear-gradient(145deg, #014f9f, #0872c9);
}

.report-hero__eyebrow {
  display: inline-flex;
  padding: 8rpx 18rpx;
  color: #dbeafe;
  font-size: 22rpx;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.14);
  border: 2rpx solid rgba(255, 255, 255, 0.2);
  border-radius: 999rpx;
}

.report-hero__title {
  display: block;
  margin-top: 20rpx;
  font-size: 40rpx;
  font-weight: 700;
  line-height: 1.25;
}

.report-hero__subtitle {
  display: block;
  margin-top: 10rpx;
  color: #dbeafe;
  font-size: 25rpx;
  line-height: 1.5;
}

.progress {
  height: 10rpx;
  margin-top: 28rpx;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 999rpx;
}

.progress__value {
  height: 100%;
  background: #fff;
  border-radius: inherit;
  transition: width 200ms ease;
}

.section-card,
.section-intro,
.error-summary,
.signature-confirmed {
  margin: 24rpx 24rpx 0;
}

.section-card {
  padding: 30rpx;
  background: var(--color-surface);
  border: 2rpx solid var(--color-border);
  border-radius: var(--radius-xl);
}

.section-heading {
  display: flex;
  margin-bottom: 30rpx;
  flex-direction: column;
  gap: 6rpx;
}

.section-heading__title,
.section-intro__title {
  color: var(--color-text);
  font-size: 32rpx;
  font-weight: 700;
  line-height: 1.4;
}

.section-heading__desc,
.section-intro__desc {
  color: var(--color-text-secondary);
  font-size: 24rpx;
  line-height: 1.55;
}

.form-stack {
  display: flex;
  flex-direction: column;
  gap: 28rpx;
}

.form-label-row {
  display: flex;
  margin-bottom: 12rpx;
  align-items: center;
  justify-content: space-between;
}

.form-label {
  display: block;
  margin-bottom: 12rpx;
  color: var(--color-text);
  font-size: 27rpx;
  font-weight: 600;
  line-height: 1.45;
}

.form-label-row .form-label {
  margin-bottom: 0;
}

.required {
  margin-right: 6rpx;
  color: var(--color-danger);
}

.form-input,
.picker-value,
.form-textarea {
  box-sizing: border-box;
  width: 100%;
  color: var(--color-text);
  font-size: 28rpx;
  background: var(--color-surface-muted);
  border: 2rpx solid transparent;
  border-radius: var(--radius-md);
}

.form-input,
.picker-value {
  min-height: 88rpx;
  padding: 0 24rpx;
  line-height: 88rpx;
}

.form-textarea {
  min-height: 148rpx;
  padding: 20rpx 24rpx;
  line-height: 1.6;
}

.picker-value--placeholder {
  color: var(--color-text-tertiary);
}

.location-button,
.text-button {
  min-height: 72rpx;
  margin: 0;
  padding: 0 18rpx;
  color: var(--color-primary);
  font-size: 25rpx;
  line-height: 72rpx;
  background: var(--color-primary-soft);
  border: 0;
  border-radius: var(--radius-sm);
}

.location-button::after,
.text-button::after {
  border: 0;
}

.coordinate {
  display: block;
  margin-top: 12rpx;
  color: var(--color-text-tertiary);
  font-size: 23rpx;
  font-variant-numeric: tabular-nums;
}

.inline-error {
  display: flex;
  margin-top: 12rpx;
  color: var(--color-danger);
  font-size: 24rpx;
  align-items: center;
  justify-content: space-between;
}

.section-intro {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.quiz-list {
  display: flex;
  margin: 24rpx;
  flex-direction: column;
  gap: 20rpx;
}

.error-summary {
  display: flex;
  padding: 24rpx;
  color: #991b1b;
  background: #fef2f2;
  border: 2rpx solid #fecaca;
  border-radius: var(--radius-lg);
  flex-direction: column;
  gap: 8rpx;
}

.error-summary__title {
  font-size: 27rpx;
  font-weight: 700;
}

.error-summary__item {
  font-size: 24rpx;
  line-height: 1.5;
}

.review-list {
  display: flex;
  flex-direction: column;
}

.review-row {
  display: grid;
  min-height: 80rpx;
  padding: 16rpx 0;
  color: var(--color-text-secondary);
  font-size: 26rpx;
  line-height: 1.5;
  border-bottom: 2rpx solid var(--color-border);
  align-items: center;
  grid-template-columns: 180rpx 1fr;
  gap: 20rpx;
}

.review-row > text:last-child {
  color: var(--color-text);
  text-align: right;
}

.review-plan {
  margin-top: 30rpx;
}

.status-pill {
  display: inline-flex;
  justify-self: end;
  width: fit-content;
  padding: 8rpx 18rpx;
  font-size: 24rpx;
  font-weight: 650;
  border-radius: 999rpx;
}

.status-pill--warning {
  color: #92400e !important;
  background: #fef3c7;
}

.status-pill--success {
  color: #166534 !important;
  background: #dcfce7;
}

.signature-confirmed {
  display: flex;
  padding: 20rpx;
  color: #166534;
  font-size: 24rpx;
  line-height: 1.5;
  background: #f0fdf4;
  border: 2rpx solid #bbf7d0;
  border-radius: var(--radius-lg);
  align-items: center;
  gap: 20rpx;
}

.signature-preview {
  width: 128rpx;
  height: 44px;
  flex: none;
  background: #fff;
  border-radius: var(--radius-sm);
}

.signature-button {
  width: calc(100% - 48rpx);
  margin: 20rpx 24rpx 0;
}

.sticky-actions {
  position: fixed;
  z-index: 20;
  right: 0;
  bottom: 0;
  left: 0;
  display: grid;
  padding: 18rpx 24rpx calc(18rpx + env(safe-area-inset-bottom));
  background: rgba(255, 255, 255, 0.96);
  border-top: 2rpx solid var(--color-border);
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20rpx;
}

.sticky-actions > button:only-child {
  grid-column: 1 / -1;
}

.primary-button,
.secondary-button {
  min-height: 92rpx;
  margin: 0;
  font-size: 29rpx;
  font-weight: 650;
  line-height: 92rpx;
  border-radius: var(--radius-md);
}

.primary-button {
  color: #fff;
  background: var(--color-primary);
}

.secondary-button {
  color: var(--color-primary);
  background: var(--color-surface);
  border: 2rpx solid var(--color-primary);
}

.primary-button::after,
.secondary-button::after {
  border: 0;
}

.primary-button[disabled],
.secondary-button[disabled] {
  opacity: 0.5;
}
</style>
