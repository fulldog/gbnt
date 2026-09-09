<script setup lang="ts">
import PageTopInset from "@/components/common/PageTopInset.vue";
import { computed, reactive, ref, shallowRef, watch } from "vue";
import { onHide, onLoad, onShareAppMessage, onShareTimeline, onUnload } from "@dcloudio/uni-app";
import { miniappApi, toAssetUrl } from "@/api/runtime";
import SignaturePad from "@/components/media/SignaturePad.vue";
import RecoverableImage from "@/components/common/RecoverableImage.vue";
import IssueTypeFields from "@/components/report/IssueTypeFields.vue";
import QuizCard from "@/components/report/QuizCard.vue";
import FacilityTypeTabs from "@/components/report/FacilityTypeTabs.vue";
import RegionPicker from "@/components/region/RegionPicker.vue";
import { useFacilityTypeSelection } from "@/composables/report/useFacilityTypeSelection";
import { useLocation } from "@/composables/report/useLocation";
import { useRegions } from "@/composables/report/useRegions";
import { useReportDraft } from "@/composables/report/useReportDraft";
import {
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
import { hasValidCoordinates } from "@/utils/issue-display";
import { useAuthStore } from "@/stores/auth";

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
const { tree: regionTree, loading: regionsLoading, error: regionsError, load } =
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
const hasLocation = computed(() =>
  form.lat !== null && form.lng !== null && hasValidCoordinates(form.lat, form.lng),
);
const typeSelectionDisabled = computed(() =>
  !draftReady.value || step.value !== 1 || hasPendingPhotos.value ||
  submitting.value || uploadingSignature.value,
);
const { selectingType, selectType } = useFacilityTypeSelection({
  currentType: () => form.type,
  disabled: () => !active || typeSelectionDisabled.value,
  commit: (type) => {
    replaceIssueType(form, type);
    errors.value = [];
  },
});

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

function selectRegion(option: { id: number | null; label: string }): void {
  if (option.id === null) return;
  form.orgId = option.id;
  form.orgLabel = option.label;
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

onShareAppMessage(() => ({
  title: "农田专项整治 · 巡查上报",
  path: "/pages/report/index",
}));

onShareTimeline(() => ({
  title: "农田专项整治 · 巡查上报",
  query: "",
}));

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
    <PageTopInset />
    <view v-if="!draftReady" class="section-card">正在恢复登录状态与上报草稿…</view>
    <template v-else>
    <FacilityTypeTabs
      v-if="step === 1"
      :value="form.type"
      :disabled="typeSelectionDisabled || selectingType"
      @select="selectType"
    />
    <view v-if="step > 1" class="report-progress">
      <view class="progress" :aria-label="`${stepTitle}，第 ${step} 步，共 ${totalSteps} 步`">
        <view class="progress__value" :style="{ width: progress }" />
      </view>
    </view>
    <button v-if="saveState === 'failed'" class="draft-status draft-status--failed" @tap="saveDraft(form)">{{ draftHint }}</button>

    <view v-if="errors.length" class="error-summary" role="alert">
      <text class="error-summary__title">请检查以下内容</text>
      <text v-for="message in errors" :key="message" class="error-summary__item">· {{ message }}</text>
    </view>

    <template v-if="step === 1">
      <view class="report-fields">
        <view class="form-field">
          <text class="form-label">区划</text>
          <view class="form-control">
            <RegionPicker
              :tree="regionTree" :value="form.orgId" :label="form.orgLabel"
              :loading="regionsLoading" :error="regionsError" :disabled="!draftReady || submitting"
              @select="selectRegion" @retry="load"
            />
          </view>
        </view>
        <view class="form-field">
          <text class="form-label">项目年度</text>
          <view class="year-options" role="radiogroup" aria-label="项目年度">
            <button v-for="option in PROJECT_YEAR_OPTIONS" :key="option.value" class="year-option"
              :class="{ 'year-option--selected': form.projectYear === option.value }"
              role="radio" :aria-checked="form.projectYear === option.value"
              @tap="form.projectYear = option.value">{{ option.value }}</button>
          </view>
        </view>
        <view class="form-field">
          <text class="form-label">设施编号</text>
          <input class="form-input" :value="form.code" placeholder="请输入设施编号" @input="updateText('code', $event)" />
        </view>
        <IssueTypeFields :type="form.type" :details="form.details" @update-field="updateDetail" />
        <view class="location-row">
          <template v-if="hasLocation">
            <view class="location-pin" aria-hidden="true">
              <image class="location-icon" src="/static/icons/map-pin-primary.svg" mode="aspectFit" />
            </view>
            <textarea class="location-address" :value="form.address" maxlength="300" auto-height
              placeholder="可补充详细地址" @input="updateText('address', $event)" />
            <button class="location-button" :disabled="choosingLocation"
              :aria-label="choosingLocation ? '正在获取定位' : '重新获取定位'" @tap="chooseLocation">
              <image class="location-icon" :class="{ 'location-icon--loading': choosingLocation }"
                src="/static/icons/refresh-primary.svg" mode="aspectFit" aria-hidden="true" />
            </button>
          </template>
          <button v-else class="location-acquire" :disabled="choosingLocation" :loading="choosingLocation" @tap="chooseLocation">
            {{ choosingLocation ? '正在获取定位…' : '获取定位' }}
          </button>
        </view>
      </view>
    </template>

    <template v-else-if="step < totalSteps">
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
          <text class="section-heading__desc">请核对现场信息后签名确认</text>
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
        <view class="signature-preview"><RecoverableImage :src="toAssetUrl(form.signaturePreviewUrl)" mode="aspectFit" alt="已确认的电子签名" /></view>
        <text>签名已确认，重新书写后请再次确认。</text>
      </view>
      <button class="secondary-button signature-button" :disabled="uploadingSignature || submitting" @tap="uploadSignature">
        {{ uploadingSignature ? "正在上传签名…" : form.signatureFileId ? "重新确认签名" : "确认签名" }}
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
.report-page {
  min-height: 100vh;
  padding-bottom: 92px;
  background: #fff;
}
.report-progress {
  padding: 12px 16px 4px;
}
.progress {
  height: 6px;
  overflow: hidden;
  border-radius: 3px;
  background: #e8edf3;
}
.progress__value {
  height: 100%;
  border-radius: inherit;
  background: var(--color-primary);
  transition: width 200ms ease;
}
.draft-status {
  width: calc(100% - 32px);
  min-height: 44px;
  margin: 8px 16px;
  padding: 8px 12px;
  border-radius: 6px;
  color: #8c4c00;
  background: #fff3e0;
  font-size: 12px;
  line-height: 1.5;
  text-align: left;
}
.report-fields {
  margin: 0 16px 8px;
}
.form-field {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 48px;
  padding: 10px 0;
  border-bottom: 1px solid #eef2f6;
}
.form-label {
  flex: none;
  color: #000;
  font-size: 14px;
  line-height: 1.5;
}
.form-control {
  flex: 1;
  min-width: 0;
}
.form-input, .picker-value {
  flex: 1;
  min-width: 0;
  height: 28px;
  padding: 0;
  background: transparent;
  color: var(--color-text);
  font-size: 14px;
  line-height: 28px;
  text-align: right;
}
.year-options {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  min-width: 0;
}
.year-option {
  flex: 1;
  max-width: 52px;
  height: 32px;
  margin: 0;
  padding: 0 4px;
  border: 0;
  border-radius: 6px;
  background: #f0f4f8;
  color: #666;
  font-size: 14px;
  line-height: 32px;
}
.year-option--selected {
  background: var(--color-primary);
  color: #fff;
  font-weight: 600;
}
.location-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 14px 0 8px;
}
.location-pin {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 20px;
  height: 20px;
  margin-top: 1px;
}
.location-icon {
  flex: none;
  width: 18px;
  height: 18px;
}
.location-icon--loading {
  animation: location-spin 1s linear infinite;
}
@keyframes location-spin {
  to { transform: rotate(360deg); }
}
.location-address {
  flex: 1;
  min-width: 0;
  min-height: 32px;
  padding-top: 2px;
  color: #5a677a;
  font-size: 14px;
  line-height: 1.45;
}
.location-button {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 32px;
  height: 32px;
  margin: -4px 0 0;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--color-primary);
  line-height: 32px;
}
.location-button[disabled] {
  opacity: .6;
}
.location-acquire {
  width: 100%;
  min-height: 40px;
  margin: 0;
  padding: 0 12px;
  border: 0;
  border-radius: 6px;
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-size: 14px;
  line-height: 40px;
}
.location-acquire[disabled] {
  background: var(--color-primary-soft);
  color: var(--color-primary);
  opacity: .6;
}
.quiz-list {
  margin: 12px 16px 20px;
}
.section-card {
  margin: 12px 16px 16px;
  padding: 0;
  background: #fff;
}
.section-heading {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 8px;
}
.section-heading__title {
  font-size: 16px;
  font-weight: 600;
  line-height: 1.4;
}
.section-heading__desc {
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.5;
}
.error-summary {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 12px 16px;
  padding: 12px;
  border-radius: 6px;
  color: #991b1b;
  background: #fef2f2;
}
.error-summary__title {
  font-size: 14px;
  font-weight: 600;
}
.error-summary__item {
  font-size: 12px;
  line-height: 1.5;
}
.review-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  min-height: 40px;
  padding: 10px 0;
  border-bottom: 1px solid #eef2f6;
  color: var(--color-text-secondary);
  font-size: 14px;
  line-height: 1.5;
}
.review-row > text:first-child {
  flex: none;
}
.review-row > text:last-child {
  min-width: 0;
  color: var(--color-text);
  text-align: right;
  overflow-wrap: anywhere;
}
.review-plan {
  justify-content: space-between;
}
.review-plan picker {
  flex: 1;
  min-width: 0;
}
.required {
  margin-right: 3px;
  color: var(--color-danger);
}
.picker-value--placeholder {
  color: #b0b8c4;
}
.status-pill {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
}
.status-pill--warning {
  color: #92400e !important;
  background: #fff3e0;
}
.status-pill--success {
  color: #166534 !important;
  background: #e8f6ee;
}
.signature-confirmed {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 12px 16px;
  padding: 10px;
  border-radius: 6px;
  color: #166534;
  background: #eef7f2;
  font-size: 12px;
  line-height: 1.5;
}
.signature-preview {
  flex: none;
  width: 64px;
  height: 44px;
  background: #fff;
}
.signature-button {
  width: calc(100% - 32px);
  margin: 10px 16px 0 !important;
}
.sticky-actions {
  position: fixed;
  z-index: 20;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  gap: 10px;
  padding: 12px 16px 10px;
  background: #fff;
}
.primary-button, .secondary-button {
  flex: 1;
  min-width: 0;
  height: 46px;
  margin: 0;
  padding: 0 12px;
  border: 1px solid var(--color-primary);
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  line-height: 44px;
}
.primary-button {
  color: #fff;
  background: var(--color-primary);
}
.secondary-button {
  color: var(--color-primary);
  background: #fff;
}
.primary-button[disabled], .secondary-button[disabled] {
  opacity: .45;
}
@media (prefers-reduced-motion: reduce) { .progress__value { transition: none; } }
</style>
