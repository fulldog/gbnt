<script setup lang="ts">
import type { QuizBool } from "@gbnt/api-client";
import { computed, onUnmounted, shallowRef, watch } from "vue";
import type { RectifyFeedbackDraft } from "@/components/issue/rectify-types";
import { showDeviceFailure } from "@/utils/device-permissions";
import { readRectifyFeedback, saveRectifyFeedback, clearRectifyFeedback } from "@/utils/rectify-draft";
import RecoverableImage from "@/components/common/RecoverableImage.vue";

const props = defineProps<{
  items: readonly QuizBool[];
  submitting: boolean;
  storageKey: string;
}>();
const emit = defineEmits<{ submit: [feedback: RectifyFeedbackDraft] }>();
const note = shallowRef(readRectifyFeedback(props.storageKey, props.items.map((item) => item.type)));
const photoPaths = shallowRef<string[]>([]);
const saveFailed = shallowRef(false);
const choosingPhotos = shallowRef(false);
const busy = computed(() => props.submitting || choosingPhotos.value);
const hasChanges = computed(() => Boolean(note.value.trim() || photoPaths.value.length));
let active = true;

function persist(): void {
  saveFailed.value = !saveRectifyFeedback(props.storageKey, note.value);
}
watch(note, persist, { flush: "sync" });
function discardSubmitted(): void {
  note.value = "";
  photoPaths.value = [];
  clearRectifyFeedback(props.storageKey);
}
defineExpose({ hasChanges, discardSubmitted });
onUnmounted(() => { active = false; });

function choosePhotos(): void {
  if (busy.value) return;
  const remaining = 6 - photoPaths.value.length;
  if (remaining <= 0) return;
  choosingPhotos.value = true;
  try {
    uni.chooseMedia({
      count: remaining, mediaType: ["image"], sourceType: ["album", "camera"], sizeType: ["compressed"],
      success: (result) => {
        if (!active) return;
        const paths = result.tempFiles.map((file) => file.tempFilePath).filter(Boolean);
        photoPaths.value = [...photoPaths.value, ...paths.slice(0, remaining)];
      },
      fail: (error) => { if (active) showDeviceFailure(error, "选择整改照片"); },
      complete: () => { choosingPhotos.value = false; },
    });
  } catch (error) {
    choosingPhotos.value = false;
    showDeviceFailure({ errMsg: error instanceof Error ? error.message : "" }, "选择整改照片");
  }
}
function removePhoto(index: number): void {
  if (!busy.value) photoPaths.value = photoPaths.value.filter((_, i) => i !== index);
}
function previewPhotos(index: number): void {
  uni.previewImage({ current: photoPaths.value[index], urls: [...photoPaths.value] });
}
function submit(): void {
  if (busy.value) return;
  const text = note.value.trim();
  if (!text || [...text].length > 500) {
    uni.showToast({ title: "请填写 1–500 字的整改说明", icon: "none" });
    return;
  }
  if (!photoPaths.value.length) {
    uni.showToast({ title: "请上传整改照片", icon: "none" });
    return;
  }
  emit("submit", { note: text, photoPaths: [...photoPaths.value] });
}
</script>

<template>
  <view class="rectify-form">
    <view class="rectify-form__panel">
      <textarea v-model="note" class="rectify-form__textarea" :disabled="busy" :maxlength="500" auto-height
        placeholder="填写整改说明" placeholder-class="rectify-form__placeholder" />
      <view class="rectify-form__photos">
        <view v-for="(path, index) in photoPaths" :key="`${path}-${index}`" class="rectify-form__photo-wrap">
          <view class="rectify-form__photo-button">
            <RecoverableImage class="rectify-form__photo" :src="path" mode="aspectFill" :alt="`第 ${index + 1} 张整改照片`" @preview="previewPhotos(index)" />
          </view>
          <button class="rectify-form__remove" :disabled="busy" aria-label="删除照片" @tap.stop="removePhoto(index)">
            <view class="rectify-form__remove-mark" aria-hidden="true"><image class="rectify-form__remove-icon" src="/static/icons/close-white.svg" mode="aspectFit" /></view>
          </button>
        </view>
        <button v-if="photoPaths.length < 6" class="rectify-form__add-photo" :disabled="busy" aria-label="添加整改照片" @tap="choosePhotos">
          <image class="rectify-form__add-icon" src="/static/icons/plus-muted.svg" mode="aspectFit" aria-hidden="true" />
        </button>
      </view>
    </view>
    <text v-if="saveFailed" class="rectify-form__hint rectify-form__save-error" role="alert" @tap="persist">整改说明保存失败，请勿退出，点击重试</text>
    <view class="rectify-form__actions">
      <button class="rectify-form__submit" :class="{ 'rectify-form__submit--disabled': busy }" :disabled="busy" @tap="submit">{{ submitting ? "正在提交" : "提交整改" }}</button>
    </view>
  </view>
</template>

<style scoped lang="scss">
.rectify-form__save-error {
  color: #b42318;
}
.rectify-form__photos {
  display: flex;
  flex-wrap: nowrap;
  align-items: stretch;
  justify-content: flex-start;
  gap: 10px;
  width: 100%;
  margin-top: 10px;
  padding-bottom: 2px;
  overflow-x: auto;
  overflow-y: hidden;
}

.rectify-form__photo-wrap,
.rectify-form__photo-button,
.rectify-form__add-photo {
  flex: 0 0 88px;
  width: 88px;
  height: 88px;
}

.rectify-form__photo-wrap {
  position: relative;
}

.rectify-form__photo-button {
  min-height: 0;
  padding: 0;
  overflow: hidden;
  border: 0;
  border-radius: 6px;
  background: #f0f2f5;
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
  top: 0;
  right: 0;
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
  align-items: center;
  justify-content: center;
  min-height: 0;
  margin: 0;
  padding: 0;
  border: 1.5px dashed #c5ccd6;
  border-radius: 6px;
  background: #fff;
  color: #a0aab8;
  line-height: 1;
}

.rectify-form__add-icon {
  flex: none;
  width: 28px;
  height: 28px;
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

.rectify-form__submit--disabled {
  opacity: 0.62;
}
.rectify-form__remove-mark {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 0 6px 0 6px;
  background: rgba(207, 19, 34, .8);
}
.rectify-form__remove-icon {
  flex: none;
  width: 16px;
  height: 16px;
}
.rectify-form__actions {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 20;
  padding: 12px 16px max(28px, env(safe-area-inset-bottom));
  background: linear-gradient(180deg, rgba(255, 255, 255, 0), #fff 28%);
}
.rectify-form__panel {
  margin-top: 8px;
  padding: 10px 12px 12px;
  border-radius: 8px;
  background: #f0f4f8;
}
.rectify-form__textarea {
  display: block;
  width: 100%;
  min-height: 72px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #000;
  font-size: 14px;
  line-height: 1.5;
}
.rectify-form__placeholder { color: #9aa3af; }
</style>
