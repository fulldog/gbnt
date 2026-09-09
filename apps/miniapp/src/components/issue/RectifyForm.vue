<script setup lang="ts">
import type { QuizBool } from "@gbnt/api-client";
import { computed, onUnmounted, ref, shallowRef, watch } from "vue";
import type { RectifyDraftSubmitItem } from "@/components/issue/rectify-types";
import { quizLabel } from "@/utils/issue-display";
import { showDeviceFailure } from "@/utils/device-permissions";
import { readRectifyNotes, saveRectifyNotes } from "@/utils/rectify-draft";
import RecoverableImage from "@/components/common/RecoverableImage.vue";

interface RectifyDraft extends RectifyDraftSubmitItem {
  selected: boolean;
}

const props = defineProps<{
  items: readonly QuizBool[];
  submitting: boolean;
  storageKey: string;
}>();

const emit = defineEmits<{
  submit: [items: RectifyDraftSubmitItem[]];
}>();

const drafts = ref<RectifyDraft[]>([]);
const saveFailed = shallowRef(false);
const choosingPhotos = shallowRef(false);
let active = true;
const hasChanges = computed(() => drafts.value.some((draft) => draft.note.trim() || draft.photoPaths.length));
const busy = computed(() => props.submitting || choosingPhotos.value);

watch(
  () => props.items.map((item) => item.type),
  (items) => {
    const saved = readRectifyNotes(props.storageKey, items);
    const existing = new Map<QuizBool["type"], RectifyDraft>([
      ...saved.map((draft) => [draft.type, { ...draft, photoPaths: [] as string[] }] as const),
      ...drafts.value.map((draft) => [draft.type, draft] as const),
    ]);
    drafts.value = items.map(
      (type) =>
        existing.get(type) ?? {
          type,
          note: "",
          photoPaths: [],
          selected: false,
        },
    );
  },
  { immediate: true },
);

function persist(): void {
  saveFailed.value = !saveRectifyNotes(props.storageKey, drafts.value);
}
watch(drafts, persist, { deep: true, flush: "sync" });
function discardSubmitted(types: readonly string[]): void {
  drafts.value = drafts.value.map((draft) => types.includes(draft.type)
    ? { ...draft, note: "", photoPaths: [], selected: false } : draft);
  persist();
}
defineExpose({ hasChanges, discardSubmitted });
onUnmounted(() => { active = false; });

function setSelected(
  index: number,
  event: Event | { detail: { value: boolean } },
): void {
  const draft = drafts.value[index];
  const value = (event as { detail?: { value?: boolean } }).detail?.value;
  if (draft && typeof value === "boolean") draft.selected = value;
}

function choosePhotos(index: number): void {
  const draft = drafts.value[index];
  if (!draft || busy.value) return;
  const remaining = 6 - draft.photoPaths.length;
  if (remaining <= 0) {
    uni.showToast({ title: "每项最多上传 6 张照片", icon: "none" });
    return;
  }

  choosingPhotos.value = true;
  uni.chooseMedia({
    count: remaining,
    mediaType: ["image"],
    sourceType: ["album", "camera"],
    sizeType: ["compressed"],
    success: (result) => {
      if (!active) return;
      const paths = result.tempFiles.map((file) => file.tempFilePath).filter(Boolean);
      draft.photoPaths.push(...paths.slice(0, remaining));
    },
    fail: (error) => { if (active) showDeviceFailure(error, "选择整改照片"); },
    complete: () => { choosingPhotos.value = false; },
  });
}

function removePhoto(draftIndex: number, photoIndex: number): void {
  if (busy.value) return;
  drafts.value[draftIndex]?.photoPaths.splice(photoIndex, 1);
}

function previewPhotos(draft: RectifyDraft, index: number): void {
  uni.previewImage({ current: draft.photoPaths[index], urls: [...draft.photoPaths] });
}

function submit(): void {
  if (busy.value) return;
  const selected = drafts.value.filter((draft) => draft.selected);
  if (selected.length === 0) {
    uni.showToast({ title: "请至少选择一项整改内容", icon: "none" });
    return;
  }

  for (const draft of selected) {
    draft.note = draft.note.trim();
    if (!draft.note) {
      uni.showToast({ title: `请填写“${quizLabel(draft.type)}”的整改说明`, icon: "none" });
      return;
    }
    if (draft.photoPaths.length === 0) {
      uni.showToast({ title: `请上传“${quizLabel(draft.type)}”的整改照片`, icon: "none" });
      return;
    }
  }

  emit(
    "submit",
    selected.map(({ type, note, photoPaths }) => ({
      type,
      note,
      photoPaths: [...photoPaths],
    })),
  );
}
</script>

<template>
  <view class="rectify-form">
    <text class="rectify-form__hint" :class="{ 'rectify-form__save-error': saveFailed }" @tap="persist">
      {{ saveFailed ? '整改说明保存失败，请勿退出，点击重试保存' : '整改说明保存在本机；照片提交时上传，离开页面后需重新选择' }}
    </text>
    <view v-for="(draft, index) in drafts" :key="draft.type" class="rectify-form__item">
      <view class="rectify-form__item-header">
        <view class="rectify-form__item-title-wrap">
          <text class="rectify-form__required">*</text>
          <text class="rectify-form__item-title">{{ quizLabel(draft.type) }}</text>
        </view>
        <label class="rectify-form__select-label">
          <text>本次提交</text>
          <switch
            :checked="draft.selected"
            :disabled="busy"
            color="#015cbb"
            @change="setSelected(index, $event)"
          />
        </label>
      </view>

      <view v-if="draft.selected" class="rectify-form__fields">
        <textarea
          v-model="draft.note"
          class="rectify-form__textarea"
          :disabled="busy"
          :maxlength="500"
          auto-height
          placeholder="请填写整改措施和结果"
          placeholder-class="rectify-form__placeholder"
        />

        <view class="rectify-form__photos">
          <view
            v-for="(path, photoIndex) in draft.photoPaths"
            :key="`${path}-${photoIndex}`"
            class="rectify-form__photo-wrap"
          >
            <view
              class="rectify-form__photo-button"
            >
              <RecoverableImage class="rectify-form__photo" :src="path" mode="aspectFill" :alt="`第 ${photoIndex + 1} 张整改照片`" @preview="previewPhotos(draft, photoIndex)" />
            </view>
            <button
              class="rectify-form__remove"
              :disabled="busy"
              aria-label="删除照片"
              @tap.stop="removePhoto(index, photoIndex)"
            >
              <view class="rectify-form__remove-mark" aria-hidden="true">
                <image class="rectify-form__remove-icon" src="/static/icons/close-white.svg" mode="aspectFit" />
              </view>
            </button>
          </view>
          <button
            v-if="draft.photoPaths.length < 6"
            class="rectify-form__add-photo"
            :disabled="busy"
            @tap="choosePhotos(index)"
          >
            <image class="rectify-form__add-icon" src="/static/icons/plus-primary.svg" mode="aspectFit" aria-hidden="true" />
            <text>整改照片</text>
          </button>
        </view>
      </view>
    </view>

    <text class="rectify-form__hint">可以分批提交；全部异常项完成后，记录将变为“已整改”。</text>
    <view class="rectify-form__actions">
      <button
        class="rectify-form__submit"
        :disabled="busy"
        @tap="submit"
      >
        {{ submitting ? "正在提交" : "提交本次整改" }}
      </button>
    </view>
  </view>
</template>

<style scoped lang="scss">
.rectify-form__save-error {
  color: #b42318;
}
.rectify-form__item {
  padding: 28rpx 0;
  border-bottom: 1rpx solid var(--gb-color-border, #edf0f4);
}

.rectify-form__item:first-child {
  padding-top: 4rpx;
}

.rectify-form__item-header,
.rectify-form__item-title-wrap,
.rectify-form__select-label {
  display: flex;
  align-items: center;
}

.rectify-form__item-header {
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 20rpx;
}

.rectify-form__item-title-wrap {
  flex: 1 1 160px;
  min-width: 0;
  align-items: flex-start;
  gap: 6rpx;
}

.rectify-form__required {
  color: var(--gb-color-danger, #cf1322);
  font-size: 14px;
  line-height: 1.5;
}

.rectify-form__item-title {
  color: var(--gb-color-text-primary, #172033);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.5;
}

.rectify-form__select-label {
  flex-shrink: 0;
  gap: 12rpx;
  color: var(--gb-color-text-muted, #8490a3);
  font-size: 14px;
}

.rectify-form__select-label switch {
  transform: scale(0.72);
  transform-origin: right center;
}

.rectify-form__fields {
  margin-top: 22rpx;
}

.rectify-form__textarea {
  width: 100%;
  min-height: 72px;
  padding: 10px 12px;
  border: 0;
  border-radius: 8px;
  background: #f0f4f8;
  color: var(--gb-color-text-primary);
  font-size: 14px;
  line-height: 1.6;
}

.rectify-form__photos {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
  margin-top: 20rpx;
}

.rectify-form__photo-wrap,
.rectify-form__photo-button,
.rectify-form__add-photo {
  width: 72px;
  height: 72px;
}

.rectify-form__photo-wrap {
  position: relative;
}

.rectify-form__photo-button,
.rectify-form__add-photo {
  min-height: 0;
  padding: 0;
  overflow: hidden;
  border: 1rpx solid var(--gb-color-border, #dfe5ec);
  border-radius: var(--gb-radius-sm, 12rpx);
  background: #f7f9fc;
  line-height: 1;
}

.rectify-form__photo-button::after,
.rectify-form__add-photo::after,
.rectify-form__remove::after {
  border: 0;
}

.rectify-form__photo {
  display: block;
  width: 100%;
  height: 100%;
}

.rectify-form__remove {
  position: absolute;
  top: -4px;
  right: -4px;
  z-index: 2;
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  width: 44px;
  height: 44px;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  line-height: 1;
}

.rectify-form__add-photo {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  color: var(--gb-color-text-secondary, #566176);
  font-size: 14px;
}

.rectify-form__add-icon {
  flex: none;
  width: 24px;
  height: 24px;
}

.rectify-form__hint {
  display: block;
  margin-top: 12px;
  color: var(--gb-color-text-muted);
  font-size: 12px;
  line-height: 1.55;
}

.rectify-form__submit {
  width: 100%;
  height: 44px;
  margin: 0;
  padding: 0 12px;
  border: 0;
  border-radius: 8px;
  background: var(--gb-color-primary);
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  line-height: 44px;
}

.rectify-form__submit::after {
  border: 0;
}

.rectify-form__submit[disabled] {
  opacity: 0.62;
}
.rectify-form__remove-mark {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: 1px solid #fff;
  border-radius: 50%;
  background: rgba(0, 0, 0, .55);
}
.rectify-form__remove-icon {
  flex: none;
  width: 14px;
  height: 14px;
}
.rectify-form__actions {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 20;
  padding: 12px 16px calc(16px + env(safe-area-inset-bottom));
  background: linear-gradient(180deg, rgba(255, 255, 255, .86), #fff 35%);
}
</style>
