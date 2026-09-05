<script setup lang="ts">
import type { QuizBool } from "@gbnt/api-client";
import { ref, watch } from "vue";
import type { RectifyDraftSubmitItem } from "@/components/issue/rectify-types";
import { quizLabel } from "@/utils/issue-display";

interface RectifyDraft extends RectifyDraftSubmitItem {
  selected: boolean;
}

const props = defineProps<{
  items: readonly QuizBool[];
  submitting: boolean;
}>();

const emit = defineEmits<{
  submit: [items: RectifyDraftSubmitItem[]];
}>();

const drafts = ref<RectifyDraft[]>([]);

watch(
  () => props.items.map((item) => item.type),
  (items) => {
    const existing = new Map(drafts.value.map((draft) => [draft.type, draft]));
    drafts.value = items.map(
      (type) =>
        existing.get(type) ?? {
          type,
          note: "",
          photoPaths: [],
          selected: true,
        },
    );
  },
  { immediate: true },
);

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
  if (!draft || props.submitting) return;
  const remaining = 6 - draft.photoPaths.length;
  if (remaining <= 0) {
    uni.showToast({ title: "每项最多上传 6 张照片", icon: "none" });
    return;
  }

  uni.chooseMedia({
    count: remaining,
    mediaType: ["image"],
    sourceType: ["album", "camera"],
    sizeType: ["compressed"],
    success: (result) => {
      const paths = result.tempFiles.map((file) => file.tempFilePath).filter(Boolean);
      draft.photoPaths.push(...paths);
    },
  });
}

function removePhoto(draftIndex: number, photoIndex: number): void {
  if (props.submitting) return;
  drafts.value[draftIndex]?.photoPaths.splice(photoIndex, 1);
}

function previewPhotos(draft: RectifyDraft, index: number): void {
  uni.previewImage({ current: draft.photoPaths[index], urls: [...draft.photoPaths] });
}

function submit(): void {
  if (props.submitting) return;
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
            :disabled="submitting"
            color="#015cbb"
            @change="setSelected(index, $event)"
          />
        </label>
      </view>

      <view v-if="draft.selected" class="rectify-form__fields">
        <textarea
          v-model="draft.note"
          class="rectify-form__textarea"
          :disabled="submitting"
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
            <button
              class="rectify-form__photo-button"
              :aria-label="`预览第 ${photoIndex + 1} 张整改照片`"
              @tap="previewPhotos(draft, photoIndex)"
            >
              <image class="rectify-form__photo" :src="path" mode="aspectFill" />
            </button>
            <button
              class="rectify-form__remove"
              :disabled="submitting"
              aria-label="删除照片"
              @tap.stop="removePhoto(index, photoIndex)"
            >
              ×
            </button>
          </view>
          <button
            v-if="draft.photoPaths.length < 6"
            class="rectify-form__add-photo"
            :disabled="submitting"
            @tap="choosePhotos(index)"
          >
            <text class="rectify-form__add-icon">＋</text>
            <text>整改照片</text>
          </button>
        </view>
      </view>
    </view>

    <text class="rectify-form__hint">可以分批提交；全部异常项完成后，记录将变为“已整改”。</text>
    <button
      class="rectify-form__submit"
      :disabled="submitting"
      @tap="submit"
    >
      {{ submitting ? "正在提交" : "提交本次整改" }}
    </button>
  </view>
</template>

<style scoped lang="scss">
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
  justify-content: space-between;
  gap: 20rpx;
}

.rectify-form__item-title-wrap {
  flex: 1;
  min-width: 0;
  align-items: flex-start;
  gap: 6rpx;
}

.rectify-form__required {
  color: var(--gb-color-danger, #cf1322);
  font-size: 28rpx;
  line-height: 1.5;
}

.rectify-form__item-title {
  color: var(--gb-color-text-primary, #172033);
  font-size: 28rpx;
  font-weight: 600;
  line-height: 1.5;
}

.rectify-form__select-label {
  flex-shrink: 0;
  gap: 12rpx;
  color: var(--gb-color-text-muted, #8490a3);
  font-size: 24rpx;
}

.rectify-form__select-label switch {
  transform: scale(0.72);
  transform-origin: right center;
}

.rectify-form__fields {
  margin-top: 22rpx;
}

.rectify-form__textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 176rpx;
  padding: 20rpx;
  border: 1rpx solid var(--gb-color-border, #dfe5ec);
  border-radius: var(--gb-radius-sm, 12rpx);
  background: #fafbfd;
  color: var(--gb-color-text-primary, #172033);
  font-size: 27rpx;
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
  width: 150rpx;
  height: 150rpx;
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
  top: -14rpx;
  right: -14rpx;
  z-index: 2;
  width: 44rpx;
  min-width: 44rpx;
  height: 44rpx;
  min-height: 44rpx;
  padding: 0;
  border: 3rpx solid #fff;
  border-radius: 50%;
  background: rgba(23, 32, 51, 0.86);
  color: #fff;
  font-size: 30rpx;
  line-height: 38rpx;
}

.rectify-form__add-photo {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  color: var(--gb-color-text-secondary, #566176);
  font-size: 24rpx;
}

.rectify-form__add-icon {
  color: var(--gb-color-primary, #015cbb);
  font-size: 42rpx;
  font-weight: 300;
}

.rectify-form__hint {
  display: block;
  margin-top: 24rpx;
  color: var(--gb-color-text-muted, #8490a3);
  font-size: 24rpx;
  line-height: 1.55;
}

.rectify-form__submit {
  width: 100%;
  min-height: 88rpx;
  margin-top: 24rpx;
  border: 0;
  border-radius: var(--gb-radius-md, 16rpx);
  background: var(--gb-color-primary, #015cbb);
  color: #fff;
  font-size: 29rpx;
  font-weight: 600;
  line-height: 88rpx;
}

.rectify-form__submit::after {
  border: 0;
}

.rectify-form__submit[disabled] {
  opacity: 0.62;
}
</style>
