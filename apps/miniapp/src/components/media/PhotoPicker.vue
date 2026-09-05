<script setup lang="ts">
import { computed, onMounted, onUnmounted, shallowRef, toRefs, watch } from "vue";
import { miniappApi, toAssetUrl } from "@/api/runtime";
import type { UploadedPhoto } from "@/domain/issues/form";
import RecoverableImage from "@/components/common/RecoverableImage.vue";
import { usePhotoUploads } from "@/composables/report/usePhotoUploads";
import { hasValidCoordinates } from "@/utils/issue-display";
import { showDeviceFailure } from "@/utils/device-permissions";

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
const emit = defineEmits<{ pending: [value: boolean] }>();
const selecting = shallowRef(false);
let active = true;
const uploads = usePhotoUploads(async (job) => {
  const point = location.value;
  if (watermark.value && (!hasValidCoordinates(point.lat!, point.lng!) || !point.address.trim())) {
    throw new Error("请先选择有效现场位置，不能使用缺失坐标生成水印");
  }
  const result = await miniappApi.attachments.uploadImages({
    files: [{ filePath: job.path, fileType: "image" }],
    watermark: watermark.value,
    lat: point.lat === null ? undefined : String(point.lat),
    lng: point.lng === null ? undefined : String(point.lng),
    address: point.address.trim() || undefined,
  });
  const file = result.list[0]!;
  return { fileId: file.file_id, url: toAssetUrl(file.url), localPath: job.path, capturedAt: job.capturedAt, source: job.source };
}, (photo) => {
  model.value = [...model.value, photo];
});
const uploading = computed(() => selecting.value || uploads.running.value);
watch(() => selecting.value || uploads.pending.value, (value) => emit("pending", value), { flush: "sync" });
const now = shallowRef(Date.now());
let clock: ReturnType<typeof setInterval> | null = null;

const remaining = computed(() => Math.max(0, maximum.value - model.value.length - uploads.jobs.value.length));
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

function addPhoto(): void {
  if (uploading.value || uploads.pending.value || remaining.value === 0) {
    return;
  }
  if (watermark.value && (!hasValidCoordinates(location.value.lat!, location.value.lng!) || !location.value.address.trim())) {
    uni.showToast({ title: "请先选择有效现场位置，再拍摄上传照片", icon: "none" });
    return;
  }
  if (cooldownRemaining.value > 0) {
    uni.showToast({ title: "请等待倒计时结束后再拍摄", icon: "none" });
    return;
  }
  selecting.value = true;
  const camera = cameraOnly.value;
  try {
    chooseMedia({
      count: cameraOnly.value ? 1 : remaining.value,
      mediaType: ["image"],
      sourceType: cameraOnly.value ? ["camera"] : ["camera", "album"],
      success: (result) => {
        if (!active) return;
        const paths = result.tempFiles.map((file) => file.tempFilePath).filter(Boolean).slice(0, remaining.value);
        uploads.enqueue(paths, camera ? "camera" : "unknown");
        selecting.value = false;
      },
      fail: (error) => {
        if (!active) return;
        selecting.value = false;
        showDeviceFailure(error, "选择照片");
      },
    });
  } catch {
    selecting.value = false;
    showDeviceFailure({}, "选择照片");
  }
}

function preview(index: number, loadedUrl?: string): void {
  const urls = model.value.map((photo) => photo.url || photo.localPath || "");
  if (loadedUrl) urls[index] = loadedUrl;
  const current = urls[index];
  if (!current) {
    return;
  }
  uni.previewImage({ current, urls: urls.filter(Boolean) });
}

function remove(index: number): void {
  if (uploading.value) return;
  model.value = model.value.filter((_, itemIndex) => itemIndex !== index);
}

onMounted(() => {
  clock = setInterval(() => {
    now.value = Date.now();
  }, 1000);
});

onUnmounted(() => {
  active = false;
  uploads.dispose();
  emit("pending", false);
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
        <RecoverableImage
          class="photo-image"
          :src="photo.url"
          :fallback-src="photo.localPath"
          mode="aspectFill"
          :alt="`现场照片 ${index + 1}`"
          @preview="preview(index, $event)"
        />
        <button
          class="photo-remove"
          :disabled="uploading"
          :aria-label="`删除第 ${index + 1} 张照片`"
          @tap.stop="remove(index)"
        >
          ×
        </button>
      </view>

      <view v-for="job in uploads.jobs.value" :key="job.id" class="photo-job" role="status">
        <text>{{ job.status === 'failed' ? job.error : '照片上传中…' }}</text>
        <view v-if="job.status === 'failed'" class="photo-job__actions">
          <button @tap="uploads.retry(job.id)">重试</button>
          <button @tap="uploads.remove(job.id)">移除</button>
        </view>
      </view>

      <button
        v-if="remaining > 0"
        class="photo-add"
        :disabled="uploading || uploads.pending.value || cooldownRemaining > 0"
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
.photo-job { display: flex; flex-direction: column; justify-content: center; padding: 12rpx; min-height: 160rpx; color: #9a3412; background: #fff7ed; font-size: 24rpx; word-break: break-all; }
.photo-job__actions { display: flex; flex-wrap: wrap; }
.photo-job__actions button { min-height: 44px; padding: 0 10px; font-size: 13px; }
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
  height: 180rpx;
  overflow: hidden;
  border-radius: var(--radius-md);
}

.photo-item {
  background: var(--color-surface-muted);
}

.photo-image {
  display: block;
  width: 100%;
  height: 100%;
}

.photo-remove {
  position: absolute;
  top: 6rpx;
  right: 6rpx;
  display: grid;
  width: 48rpx;
  min-width: 44px;
  height: 48rpx;
  min-height: 44px;
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
