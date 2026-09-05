<script setup lang="ts">
import { computed, onMounted, onUnmounted, shallowRef, toRefs } from "vue";
import { miniappApi, toAssetUrl } from "@/api/runtime";
import type { UploadedPhoto } from "@/domain/issues/form";

interface LocationInput {
  lat: number | null;
  lng: number | null;
  address: string;
}

interface ChooseMediaFile {
  tempFilePath: string;
}

interface ChooseMediaResult {
  tempFiles: ChooseMediaFile[];
}

const {
  maximum,
  cameraOnly,
  cooldownSeconds,
  watermark,
  location,
} = toRefs(
  withDefaults(
    defineProps<{
      maximum?: number;
      cameraOnly?: boolean;
      cooldownSeconds?: number;
      watermark?: boolean;
      location: LocationInput;
    }>(),
    {
      maximum: 6,
      cameraOnly: false,
      cooldownSeconds: 0,
      watermark: true,
    },
  ),
);

const model = defineModel<UploadedPhoto[]>({ required: true });
const uploading = shallowRef(false);
const now = shallowRef(Date.now());
let clock: ReturnType<typeof setInterval> | null = null;

const remaining = computed(() => Math.max(0, maximum.value - model.value.length));
const cooldownRemaining = computed(() => {
  if (!cooldownSeconds.value || model.value.length === 0) {
    return 0;
  }
  const capturedAt = model.value[0]?.capturedAt;
  if (!capturedAt || model.value.length > 1) {
    return 0;
  }
  return Math.max(
    0,
    Math.ceil((capturedAt + cooldownSeconds.value * 1000 - now.value) / 1000),
  );
});

const addLabel = computed(() => {
  if (uploading.value) {
    return "上传中…";
  }
  if (cooldownRemaining.value > 0) {
    const minutes = Math.floor(cooldownRemaining.value / 60);
    const seconds = String(cooldownRemaining.value % 60).padStart(2, "0");
    return `${minutes}:${seconds} 后可继续拍摄`;
  }
  return cameraOnly.value ? "现场拍摄" : "添加照片";
});

function chooseMedia(options: {
  count: number;
  mediaType: string[];
  sourceType: string[];
  success: (result: ChooseMediaResult) => void;
  fail: (error: { errMsg?: string }) => void;
}): void {
  const api = uni.chooseMedia as unknown as (input: typeof options) => void;
  api(options);
}

async function uploadFiles(files: ChooseMediaFile[]): Promise<void> {
  if (files.length === 0) {
    return;
  }
  uploading.value = true;
  const capturedAt = Date.now();
  try {
    const result = await miniappApi.attachments.uploadImages({
      files: files.map((file) => ({
        filePath: file.tempFilePath,
        fileType: "image" as const,
      })),
      watermark: watermark.value,
      lat: location.value.lat === null ? undefined : String(location.value.lat),
      lng: location.value.lng === null ? undefined : String(location.value.lng),
      address: location.value.address.trim() || undefined,
    });
    const additions = result.list.map((file, index) => ({
      fileId: file.file_id,
      url: toAssetUrl(file.url),
      localPath: files[index]?.tempFilePath,
      capturedAt,
    }));
    model.value = [...model.value, ...additions].slice(0, maximum.value);
  } catch (error) {
    uni.showToast({
      title: error instanceof Error ? error.message : "照片上传失败",
      icon: "none",
    });
  } finally {
    uploading.value = false;
  }
}

function addPhoto(): void {
  if (uploading.value || remaining.value === 0) {
    return;
  }
  if (cooldownRemaining.value > 0) {
    uni.showToast({ title: "请等待倒计时结束后再拍摄", icon: "none" });
    return;
  }
  chooseMedia({
    count: cameraOnly.value ? 1 : remaining.value,
    mediaType: ["image"],
    sourceType: cameraOnly.value ? ["camera"] : ["camera", "album"],
    success: (result) => {
      void uploadFiles(result.tempFiles);
    },
    fail: (error) => {
      if (!error.errMsg?.includes("cancel")) {
        uni.showToast({ title: error.errMsg || "无法选择照片", icon: "none" });
      }
    },
  });
}

function preview(index: number): void {
  const urls = model.value.map((photo) => photo.url || photo.localPath || "");
  const current = urls[index];
  if (!current) {
    return;
  }
  uni.previewImage({ current, urls: urls.filter(Boolean) });
}

function remove(index: number): void {
  model.value = model.value.filter((_, itemIndex) => itemIndex !== index);
}

onMounted(() => {
  clock = setInterval(() => {
    now.value = Date.now();
  }, 1000);
});

onUnmounted(() => {
  if (clock) {
    clearInterval(clock);
  }
});
</script>

<template>
  <view class="photo-picker">
    <view class="photo-grid">
      <view
        v-for="(photo, index) in model"
        :key="photo.fileId"
        class="photo-item"
      >
        <image
          class="photo-image"
          :src="photo.url || photo.localPath"
          mode="aspectFill"
          :aria-label="`现场照片 ${index + 1}`"
          @tap="preview(index)"
        />
        <button
          class="photo-remove"
          :aria-label="`删除第 ${index + 1} 张照片`"
          @tap.stop="remove(index)"
        >
          ×
        </button>
      </view>

      <button
        v-if="remaining > 0"
        class="photo-add"
        :disabled="uploading || cooldownRemaining > 0"
        :aria-label="addLabel"
        @tap="addPhoto"
      >
        <text class="photo-add__icon">＋</text>
        <text class="photo-add__label">{{ addLabel }}</text>
      </button>
    </view>
    <text class="photo-hint">
      已上传 {{ model.length }}/{{ maximum }} 张{{ cameraOnly ? "，仅允许现场拍摄" : "" }}
    </text>
  </view>
</template>

<style scoped lang="scss">
.photo-picker {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.photo-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16rpx;
}

.photo-item,
.photo-add {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: var(--radius-md);
}

.photo-item {
  background: var(--color-surface-muted);
}

.photo-image {
  width: 100%;
  height: 100%;
}

.photo-remove {
  position: absolute;
  top: 6rpx;
  right: 6rpx;
  display: grid;
  width: 48rpx;
  min-width: 48rpx;
  height: 48rpx;
  min-height: 48rpx;
  padding: 0;
  color: #fff;
  font-size: 34rpx;
  line-height: 44rpx;
  background: rgba(15, 23, 42, 0.72);
  border: 0;
  border-radius: 50%;
  place-items: center;
}

.photo-add {
  display: flex;
  min-height: 180rpx;
  margin: 0;
  padding: 16rpx;
  color: var(--color-text-secondary);
  background: var(--color-surface-muted);
  border: 2rpx dashed var(--color-border-strong);
  align-items: center;
  flex-direction: column;
  justify-content: center;
}

.photo-add::after,
.photo-remove::after {
  border: 0;
}

.photo-add[disabled] {
  opacity: 0.58;
}

.photo-add__icon {
  font-size: 44rpx;
  line-height: 1;
}

.photo-add__label {
  margin-top: 8rpx;
  font-size: 24rpx;
  line-height: 1.35;
  text-align: center;
}

.photo-hint {
  color: var(--color-text-tertiary);
  font-size: 24rpx;
  line-height: 1.5;
}
</style>
