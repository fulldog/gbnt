<script setup lang="ts">
import { computed, reactive, ref, shallowRef, watch, onBeforeUnmount } from "vue";
import { onHide } from "@dcloudio/uni-app";
import { ApiError, FACILITY_CODE_CONFLICT, ISSUE_REQUEST_CONFLICT, prepareIssueSubmission } from "@gbnt/api-client";
import type { OrgTreeNode, FacilityCodeMode } from "@gbnt/api-client";
import type { ReportTypeDraft } from "@/composables/report/useReportWorkspace";
import { miniappApi, toAssetUrl } from "@/api/runtime";
import SignaturePad from "@/components/media/SignaturePad.vue";
import PhotoPicker from "@/components/media/PhotoPicker.vue";
import RecoverableImage from "@/components/common/RecoverableImage.vue";
import IssueTypeFields from "@/components/report/IssueTypeFields.vue";
import QuizCard from "@/components/report/QuizCard.vue";
import RegionPicker from "@/components/region/RegionPicker.vue";
import { useLocation } from "@/composables/report/useLocation";
import {
  PROJECT_YEAR_OPTIONS,
  QUIZ_DEFINITIONS,
} from "@/domain/issues/definitions";
import {
  changeQuizAnswer,
  normalizeReportFormSchema,
  restoreReportCodeMode,
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

type SignaturePadInstance = InstanceType<typeof SignaturePad>;

const props = defineProps<{
  draft: ReportTypeDraft;
  visible: boolean;
  initialPosition?: { latitude: number; longitude: number } | null;
  regionTree: OrgTreeNode[];
  regionsLoading: boolean;
  regionsError: string;
}>();
const emit = defineEmits<{
  save: [draft: ReportTypeDraft];
  submitted: [code: string];
  busy: [value: boolean];
  retryRegions: [];
  permissionDenied: [];
  locationPicker: [visible: boolean];
}>();
const step = shallowRef(props.draft.step);
const form = reactive<ReportFormState>(JSON.parse(JSON.stringify(props.draft.form)));
normalizeReportFormSchema(form);
restoreReportCodeMode(form);
watch(() => props.initialPosition, (point) => {
  if (point && form.lat === null && form.lng === null) {
    form.lat = point.latitude;
    form.lng = point.longitude;
  }
}, { immediate: true });
const errors = ref<string[]>([]);
const submitting = shallowRef(false);
const uploadingSignature = shallowRef(false);
const signatureRef = ref<SignaturePadInstance | null>(null);
const pendingPhotos = shallowRef<ReadonlySet<string>>(new Set());
const hasPendingPhotos = computed(() => pendingPhotos.value.size > 0);
const draftReady = shallowRef(true);
let draftTimer: ReturnType<typeof setTimeout> | undefined;
let active = true;
let submitted = false;
let latestSignatureUploadToken = 0;
let activeSignatureUploadToken: number | null = null;
let loadingShown = false;
const {
  choosing: choosingLocation,
  refreshing: refreshingLocation,
  busy: locationBusy,
  choose,
  refresh,
} = useLocation({
  onPickerVisibilityChange: (visible) => emit("locationPicker", visible),
});
const regionTree = computed(() => props.regionTree);
const regionsLoading = computed(() => props.regionsLoading);
const regionsError = computed(() => props.regionsError);
const codeError = shallowRef("");
watch(() => [form.orgId, form.type, form.code, form.codeMode], () => { codeError.value = ""; });
function load(): void { emit("retryRegions"); }
function showLoading(title: string): void {
  uni.showLoading({ title, mask: true });
  loadingShown = true;
}
function hideLoading(): void {
  // showToast 与 showLoading 共用提示层；成功或错误提示后不能再次 hideLoading。
  if (!loadingShown) return;
  loadingShown = false;
  uni.hideLoading();
}
function saveDraft(_form?: ReportFormState): void {
  if (!active || submitted) return;
  emit("save", { form: JSON.parse(JSON.stringify(form)) as ReportFormState, step: step.value });
}
watch(() => submitting.value || uploadingSignature.value, (value) => emit("busy", value), { flush: "sync" });
watch(step, () => saveDraft());

const definitions = computed(() => QUIZ_DEFINITIONS[form.type]);
const needsRectify = computed(() => reportNeedsRectify(form));
const totalSteps = computed(() => definitions.value.length + 2);
const currentQuiz = computed(() => form.quizzes[step.value - 2]);
const currentDefinition = computed(() => definitions.value[step.value - 2]);
const progress = computed(() => `${Math.round((step.value / totalSteps.value) * 100)}%`);
const stepTitle = computed(() => {
  if (step.value === 1) return "填写设施信息";
  if (step.value < totalSteps.value) return currentDefinition.value?.label || "完成现场排查";
  return "电子签名";
});
const locationInput = computed(() => ({
  lat: form.lat,
  lng: form.lng,
  address: form.address,
}));
const hasLocation = computed(() =>
  form.lat !== null && form.lng !== null && hasValidCoordinates(form.lat, form.lng),
);
function showFirstError(nextErrors: string[]): void {
  errors.value = nextErrors;
  if (nextErrors[0]) {
    uni.showToast({ title: nextErrors[0], icon: "none", duration: 2800 });
  }
  uni.pageScrollTo({ scrollTop: 0, duration: 180 });
}

// 照片组件卸载时仍会回传 pending=false；按来源题目处理，不能再读取已经变化的 currentQuiz。
function setPhotoSourcePending(type: string, value: boolean): void {
  if (!active) return;
  const next = new Set(pendingPhotos.value);
  if (value) next.add(type); else next.delete(type);
  pendingPhotos.value = next;
}

function setPhotosPending({ type, value }: { type: QuizFormItem['type']; value: boolean }): void {
  setPhotoSourcePending(type, value);
}

function setPanoramaPending(value: boolean): void {
  setPhotoSourcePending("well-panorama", value);
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
  const value = inputEventValue(event);
  if (key === "code") { form.codeMode = "manual"; form.code = value; saveDraft(); }
  else form.address = value;
}

function setCodeMode(mode: FacilityCodeMode): void {
  if (submitting.value || uploadingSignature.value) return;
  form.codeMode = mode;
  saveDraft();
}

function updateDetail(key: keyof ReportDetailsForm, value: string): void {
  const details = form.details as unknown as Record<keyof ReportDetailsForm, string>;
  details[key] = value;
}

function updateSignatureStrokes(strokes: ReportFormState["signatureStrokes"]): void {
  form.signatureStrokes = strokes;
  saveDraft();
}

function updateQuizAnswer({ type, value }: { type: QuizFormItem['type']; value: boolean }): void {
  const item = form.quizzes.find((quiz) => quiz.type === type);
  if (active && item) changeQuizAnswer(item, value);
}

function updateQuizDescription({ type, value }: { type: QuizFormItem['type']; value: string }): void {
  const item = form.quizzes.find((quiz) => quiz.type === type);
  if (active && item) item.desc = value;
}

function updateQuizPhotos({ type, value }: { type: QuizFormItem['type']; value: UploadedPhoto[] }): void {
  const item = form.quizzes.find((quiz) => quiz.type === type);
  if (!active || !item) return;
  item.photos = value;
  saveDraft(form);
}

function updatePanoramaPhotos(value: UploadedPhoto[]): void {
  if (!active) return;
  form.panoramaPhotos = value;
  saveDraft(form);
}

function applyLocation(location: { address: string; latitude: number; longitude: number }): void {
  form.address = location.address;
  form.lat = location.latitude;
  form.lng = location.longitude;
  saveDraft(form);
}

async function selectLocationOnMap(): Promise<void> {
  try {
    const center = hasLocation.value
      ? { latitude: form.lat as number, longitude: form.lng as number }
      : props.initialPosition ?? undefined;
    const location = await choose(center);
    if (location) applyLocation(location);
  } catch (error) {
    uni.showToast({
      title: error instanceof Error ? error.message : "选择位置失败",
      icon: "none",
    });
  }
}

async function refreshCurrentLocation(): Promise<void> {
  const location = await refresh();
  if (location) applyLocation(location);
}

function currentStepErrors(): string[] {
  if (step.value === 1) {
    return validateBasicStep(form);
  }
  if (step.value < totalSteps.value && currentQuiz.value) {
    const nextErrors = validateQuizItem(form.type, currentQuiz.value);
    if (step.value === totalSteps.value - 1 && needsRectify.value && !form.planDate) nextErrors.push("请选择计划整改完成日期");
    return nextErrors;
  }
  return [];
}

function nextStep(): void {
  if (!props.visible || blockForPhotos() || submitting.value || uploadingSignature.value) return;
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
  if (!props.visible || blockForPhotos() || submitting.value || uploadingSignature.value) return;
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
    showLoading("正在生成签名");
    const signature = await signatureRef.value?.exportPng();
    if (!signature) {
      throw new Error("签名板尚未准备完成");
    }
    if (!isCurrentSignatureUpload(uploadToken, signature.revision)) {
      hideLoading();
      if (active) uni.showToast({ title: "签名已变更，请重新确认", icon: "none" });
      return false;
    }

    showLoading("正在上传签名");
    const result = await miniappApi.attachments.uploadImages({
      files: [{ filePath: signature.filePath, fileType: "image" }],
      watermark: false,
    });
    if (!isCurrentSignatureUpload(uploadToken, signature.revision)) {
      hideLoading();
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
    return true;
  } catch (error) {
    hideLoading();
    if (active && props.visible) uni.showToast({
      title: error instanceof Error ? error.message : "签名上传失败",
      icon: "none",
    });
    return false;
  } finally {
    if (activeSignatureUploadToken === uploadToken) {
      hideLoading();
      activeSignatureUploadToken = null;
      uploadingSignature.value = false;
    }
  }
}

async function submit(): Promise<void> {
  if (!props.visible || submitted || submitting.value || uploadingSignature.value || blockForPhotos()) {
    return;
  }
  const nextErrors = validateSubmitStep(form, false);
  if (nextErrors.length > 0) { showFirstError(nextErrors); return; }
  if (!form.signatureFileId && !(await uploadSignature())) return;
  submitting.value = true;
  try {
    showLoading("正在提交");
    const input = buildCreateIssueInput(form);
    form.submissionAttempt = prepareIssueSubmission(input, form.submissionAttempt);
    saveDraft();
    const issue = await miniappApi.issues.create({ ...input, request_id: form.submissionAttempt.requestId });
    if (!active) return;
    submitted = true;
    hideLoading();
    emit("submitted", issue.code);
    if (issue.display_warning) uni.showToast({ title: issue.display_warning, icon: "none", duration: 3500 });
  } catch (error) {
    hideLoading();
    if (!active) return;
    if (error instanceof ApiError && error.code === FACILITY_CODE_CONFLICT) {
      codeError.value = error.message;
      step.value = 1;
      uni.pageScrollTo({ scrollTop: 0, duration: 180 });
    }
    if (error instanceof ApiError && error.code === ISSUE_REQUEST_CONFLICT) form.submissionAttempt = undefined;
    saveDraft(form);
    uni.showToast({
      title: error instanceof Error ? error.message : "上报失败，请稍后重试",
      icon: "none",
      duration: 3000,
    });
  } finally {
    hideLoading();
    submitting.value = false;
  }
}

watch(form, () => {
  if (!draftReady.value || submitting.value) return;
  if (draftTimer) clearTimeout(draftTimer);
  draftTimer = setTimeout(() => saveDraft(form), 500);
}, { deep: true });

watch(() => JSON.stringify({ type: form.type, year: form.projectYear, org: form.orgId,
  address: form.address, lat: form.lat, lng: form.lng, code: form.code, codeMode: form.codeMode, details: form.details,
  panoramaPhotos: form.panoramaPhotos, quizzes: form.quizzes, planDate: form.planDate }),
() => {
  if (draftReady.value && form.signatureFileId) resetSignatureUpload();
}, { flush: "sync" });

onHide(() => {
  if (!submitting.value && draftReady.value) {
    if (draftTimer) clearTimeout(draftTimer);
    saveDraft(form);
  }
});
onBeforeUnmount(() => {
  hideLoading();
  if (!submitted) saveDraft();
  emit("busy", false);
  active = false;
  latestSignatureUploadToken += 1;
  if (draftTimer) clearTimeout(draftTimer);
});
</script>

<template>
  <view class="report-form">
    <view v-if="step > 1" class="report-progress">
      <view class="progress" :aria-label="`${stepTitle}，第 ${step} 步，共 ${totalSteps} 步`">
        <view class="progress__value" :style="{ width: progress }" />
      </view>
    </view>

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
              start-level="street" :tree="regionTree" :value="form.orgId" :label="form.orgLabel"
              :loading="regionsLoading" :error="regionsError" :disabled="!props.visible || submitting"
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
          <view class="code-control">
            <view class="code-mode-options">
              <button :class="{ selected: form.codeMode === 'auto' }" :disabled="submitting" @tap="setCodeMode('auto')">自动生成</button>
              <button :class="{ selected: form.codeMode === 'manual' }" :disabled="submitting" @tap="setCodeMode('manual')">手动填写</button>
            </view>
            <text v-if="form.codeMode === 'auto'" class="code-hint">提交时自动生成</text>
            <input v-else class="form-input" :value="form.code" :disabled="submitting" maxlength="64" placeholder="请输入设施编号" @input="updateText('code', $event)" />
            <text v-if="codeError" class="code-error">{{ codeError }}</text>
          </view>
        </view>
        <IssueTypeFields :type="form.type" :details="form.details" @update-field="updateDetail">
          <template #after-type-fields>
            <view v-if="form.type === 'well'" class="panorama-field">
              <text class="panorama-label"><text class="required">*</text>全景照片</text>
              <PhotoPicker
                :model-value="form.panoramaPhotos"
                :location="locationInput"
                @update:model-value="updatePanoramaPhotos"
                @pending="setPanoramaPending"
                @permission-denied="emit('permissionDenied')"
              />
            </view>
          </template>
        </IssueTypeFields>
        <view class="location-row">
          <button class="location-button location-button--map" :disabled="locationBusy"
            :aria-label="choosingLocation ? '正在打开地图' : '打开地图选择位置'" @tap="selectLocationOnMap">
            <image class="location-icon" src="/static/icons/map-pin-primary.svg" mode="aspectFit" aria-hidden="true" />
          </button>
          <textarea class="location-address" :value="form.address" maxlength="300" auto-height
            placeholder="请选择定位或填写详细地址" @input="updateText('address', $event)" />
          <button class="location-button" :disabled="locationBusy"
            :aria-label="refreshingLocation ? '正在重新定位' : '重新定位'" @tap="refreshCurrentLocation">
            <image class="location-icon" :class="{ 'location-icon--loading': refreshingLocation }"
              src="/static/icons/refresh-primary.svg" mode="aspectFit" aria-hidden="true" />
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
          @answer="updateQuizAnswer"
          @description="updateQuizDescription"
          @photos="updateQuizPhotos"
          @pending="setPhotosPending"
          @permission-denied="emit('permissionDenied')"
        />
        <view v-if="needsRectify && step === totalSteps - 1" class="form-field plan-field">
          <text class="form-label"><text class="required">*</text>计划整改完成日期</text>
          <picker mode="date" :value="form.planDate" @change="form.planDate = String($event.detail.value)">
            <view class="picker-value">{{ form.planDate || "请选择计划日期" }}</view>
          </picker>
        </view>
      </view>
    </template>

    <template v-else>
      <view v-if="form.signatureFileId && !form.signatureStrokes.length" class="signature-confirmed">
        <text class="section-heading__title">电子签名：</text>
        <view class="signature-preview"><RecoverableImage :src="toAssetUrl(form.signaturePreviewUrl)" mode="aspectFit" alt="电子签名" /></view>
        <button class="secondary-button" @tap="resetSignatureUpload">清空重签</button>
      </view>
      <SignaturePad v-else ref="signatureRef" :strokes="form.signatureStrokes" @update:strokes="updateSignatureStrokes" :active="props.visible" :disabled="submitting || uploadingSignature"
        @changed="resetSignatureUpload" @cleared="resetSignatureUpload" />
    </template>

    <view class="sticky-actions safe-bottom">
      <button v-if="step > 1" class="secondary-button" :disabled="submitting || uploadingSignature || hasPendingPhotos" @tap="previousStep">
        上一步
      </button>
      <button v-if="step < totalSteps" class="primary-button" :disabled="hasPendingPhotos" @tap="nextStep">
        下一步
      </button>
      <button v-else class="primary-button" :loading="submitting || uploadingSignature" :disabled="submitting || uploadingSignature || hasPendingPhotos" @tap="submit">
        {{ uploadingSignature ? "正在处理签名…" : submitting ? "正在提交…" : "提交巡查记录" }}
      </button>
    </view>
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
.panorama-field {
  padding: 12px 0 8px;
  border-bottom: 1px solid #eef2f6;
}
.panorama-label {
  display: block;
  margin-bottom: 10px;
  color: var(--color-text);
  font-size: 14px;
  line-height: 1.5;
}
.code-control { flex: 1; min-width: 0; text-align: right; }
.code-mode-options { display: flex; justify-content: flex-end; gap: 8px; margin-bottom: 6px; }
.code-mode-options button { margin: 0; padding: 4px 10px; font-size: 13px; line-height: 24px; background: #f1f4f8; color: var(--color-text-secondary); }
.code-mode-options button.selected { color: var(--color-primary); background: #edf5ff; }
.code-hint { font-size: 13px; line-height: 28px; color: var(--color-text-secondary); }
.code-error { display: block; text-align: left; font-size: 12px; line-height: 20px; color: #c74735; }
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
  align-items: center;
  gap: 8px;
  padding: 14px 0 8px;
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
  min-height: 24px;
  padding: 0;
  color: #5a677a;
  font-size: 14px;
  line-height: 24px;
}
.location-button {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 32px;
  height: 32px;
  margin: 0;
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
.location-button--map {
  width: 24px;
  height: 32px;
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
