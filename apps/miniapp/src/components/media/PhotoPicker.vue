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

const props = withDefaults(defineProps<{
  maximum?: number;
  cameraOnly?: boolean;
  cooldownSeconds?: number;
  watermark?: boolean;
  location: LocationInput;
}>(), {
  maximum: 6,
  cameraOnly: false,
  cooldownSeconds: 0,
  watermark: true,
});
const { maximum, cameraOnly, cooldownSeconds, watermark, location } = toRefs(props);

const model = defineModel<UploadedPhoto[]>({ required: true });
const emit = defineEmits<{ pending: [value: boolean]; permissionDenied: [] }>();
const selecting = shallowRef(false);
let active = true;
const uploads = usePhotoUploads(async (job) => {
  const point = job.location ?? location.value;
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
        uploads.enqueue(paths, camera ? "camera" : "unknown", Date.now(), { ...location.value });
        selecting.value = false;
      },
      fail: (error) => {
        if (!active) return;
        selecting.value = false;
        if (/auth|permission|deny|denied|privacy/i.test(error.errMsg || "")) emit("permissionDenied");
        showDeviceFailure(error, "选择照片");
      },
    });
  } catch {
    selecting.value = false;
    showDeviceFailure({}, "选择照片");
  }
}

function preview(index: number, loadedUrl?: string): void {
  const urls = model.value.map((photo) => toAssetUrl(photo.url) || (!watermark.value ? photo.localPath : "") || "");
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
          :src="toAssetUrl(photo.url)"
          :fallback-src="watermark ? undefined : photo.localPath"
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
          <view class="photo-remove__mark" aria-hidden="true">
            <image class="photo-remove__icon" src="/static/icons/close-white.svg" mode="aspectFit" />
          </view>
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
        <image class="photo-add__icon" src="/static/icons/plus-muted.svg" mode="aspectFit" aria-hidden="true" />
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
  gap: 6px;
}
.photo-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.photo-item, .photo-add {
  position: relative;
  flex: none;
  width: 88px;
  height: 88px;
  overflow: hidden;
  border-radius: 6px;
}
.photo-item {
  background: #f0f4f8;
}
.photo-image {
  display: block;
  width: 100%;
  height: 100%;
}
.photo-add {
  display: flex;
  align-items: center;
  flex-direction: column;
  justify-content: center;
  min-height: 88px;
  margin: 0;
  padding: 8px;
  border: 1px dashed #c8d1de;
  background: #fff;
  color: #8a94a3;
}
.photo-add[disabled] {
  opacity: .58;
}
.photo-add__icon {
  flex: none;
  width: 28px;
  height: 28px;
}
.photo-add__label {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.35;
  text-align: center;
}
.photo-hint {
  color: var(--color-text-tertiary);
  font-size: 12px;
  line-height: 1.5;
}
.photo-remove {
  position: absolute;
  top: 0;
  right: 0;
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  width: 44px;
  height: 44px;
  margin: 0;
  padding: 4px;
  border: 0;
  background: transparent;
  line-height: 1;
}
.photo-remove__mark {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: rgba(0, 0, 0, .55);
}
.photo-remove__icon {
  flex: none;
  width: 14px;
  height: 14px;
}
.photo-job {
  display: flex;
  flex-direction: column;
  justify-content: center;
  width: 88px;
  min-height: 88px;
  padding: 6px;
  border-radius: 6px;
  color: #9a3412;
  background: #fff7ed;
  font-size: 12px;
  word-break: break-all;
}
.photo-job__actions {
  display: flex;
  flex-wrap: wrap;
}
.photo-job__actions button {
  min-height: 44px;
  padding: 0 8px;
  font-size: 12px;
}
</style>
