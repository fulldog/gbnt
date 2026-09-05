<script setup lang="ts">
import type { FileItem } from "@gbnt/api-client";
import { Close, Plus } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import type { UploadRequestOptions, UploadRawFile } from "element-plus";
import { computed, onBeforeUnmount, shallowRef, watch } from "vue";
import { useAdminApi } from "@/api/runtime";
import { errorMessage } from "@/utils/error";
import { resolveAssetUrl } from "@/utils/asset";

const {
  photos = [],
  disabled = false,
  limit = 6,
  address,
  lat,
  lng,
} = defineProps<{
  photos?: readonly FileItem[];
  disabled?: boolean;
  limit?: number;
  address?: string;
  lat?: number;
  lng?: number;
}>();

const emit = defineEmits<{ uploading: [busy: boolean] }>();
const files = defineModel<string[]>({ required: true });
const api = useAdminApi();
const pendingCount = shallowRef(0);
const uploading = computed(() => pendingCount.value > 0);
const uploadedItems = shallowRef<FileItem[]>([]);
// 同一批多个响应可能在父组件回传 v-model 前完成，先更新本地镜像，避免丢失先完成的文件。
const currentIds = shallowRef<string[]>([...files.value]);
let disposed = false;

watch(files, (value) => { currentIds.value = [...value]; }, { deep: true, flush: "sync" });
onBeforeUnmount(() => {
  disposed = true;
  if (pendingCount.value) emit("uploading", false);
});

const locationError = computed(() => {
  if (!address?.trim()) return "请先填写现场定位地址，再上传照片。";
  if (typeof lat !== "number" || !Number.isFinite(lat) || lat < -90 || lat > 90
    || typeof lng !== "number" || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    return "请先填写有效纬度（-90～90）和经度（-180～180），再上传照片。";
  }
  if (lat === 0 && lng === 0) return "当前坐标为未定位占位值 (0, 0)，请先填写实际现场坐标，再上传照片。";
  return "";
});

const visibleItems = computed(() => {
  const byId = new Map<string, FileItem>();
  [...photos, ...uploadedItems.value].forEach((item) => byId.set(item.file_id, item));
  return currentIds.value.map((id) => byId.get(id) ?? { file_id: id, url: "" });
});

function validationError(file: UploadRawFile): string {
  if (disposed || disabled) return "当前不可上传照片";
  if (!file.type.startsWith("image/")) return "只能上传图片文件";
  if (file.size === 0) return "不能上传空图片文件";
  if (file.size > 10 * 1024 * 1024) return "单张图片不能超过 10MB";
  if (locationError.value) return locationError.value;
  if (currentIds.value.length + pendingCount.value >= limit) return `最多上传 ${limit} 张图片（包含上传中的照片）`;
  return "";
}

function beforeUpload(file: UploadRawFile): boolean {
  const message = validationError(file);
  if (message && !disposed) ElMessage.error(message);
  return !message;
}

async function upload(options: UploadRequestOptions): Promise<unknown> {
  // before-upload 可并行通过，真正发送前还需为本文件保留一个名额。
  const message = validationError(options.file);
  if (message) {
    if (!disposed) ElMessage.error(message);
    throw new Error(message);
  }
  const input = { files: [options.file], watermark: true, address: address!.trim(), lat: String(lat), lng: String(lng) };
  pendingCount.value += 1;
  if (pendingCount.value === 1) emit("uploading", true);
  try {
    const result = await api.attachments.uploadImages(input);
    if (disposed) return result;
    const item = result?.list?.[0];
    if (!Array.isArray(result?.list) || result.list.length !== 1 || !item
      || typeof item.file_id !== "string" || !item.file_id.trim()
      || typeof item.url !== "string" || !item.url.trim()) {
      throw new Error("图片上传响应异常，请重试");
    }
    if (currentIds.value.length >= limit || currentIds.value.includes(item.file_id)) {
      throw new Error("图片数量超限或返回了重复图片，请检查后重试");
    }
    uploadedItems.value = [...uploadedItems.value, item];
    currentIds.value = [...currentIds.value, item.file_id];
    files.value = [...currentIds.value];
    return result;
  } catch (error) {
    if (!disposed) ElMessage.error(errorMessage(error, "图片上传失败"));
    throw error;
  } finally {
    pendingCount.value -= 1;
    if (!disposed && pendingCount.value === 0) emit("uploading", false);
  }
}

function remove(id: string): void {
  if (disabled || disposed) return;
  currentIds.value = currentIds.value.filter((item) => item !== id);
  files.value = [...currentIds.value];
}
</script>

<template>
  <div class="space-y-2">
    <div v-if="visibleItems.length" class="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
      <div
        v-for="item in visibleItems"
        :key="item.file_id"
        class="group relative aspect-square overflow-hidden rounded-md border border-slate-200 bg-slate-50"
      >
        <ElImage
          v-if="item.url"
          :src="resolveAssetUrl(item.url)"
          :preview-src-list="visibleItems.filter((entry) => entry.url).map((entry) => resolveAssetUrl(entry.url))"
          fit="cover"
          class="h-full w-full"
          loading="lazy"
        />
        <span v-else class="flex h-full items-center justify-center p-2 text-center text-xs text-slate-500">
          {{ item.file_id }}
        </span>
        <ElButton
          v-if="!disabled"
          class="!absolute top-1 right-1 opacity-90"
          type="danger"
          circle
          size="small"
          :icon="Close"
          @click="remove(item.file_id)"
        >
          <span class="sr-only">删除图片 {{ item.file_id }}</span>
        </ElButton>
      </div>
    </div>

    <ElUpload
      v-if="!disabled && currentIds.length < limit"
      action="#"
      accept="image/*"
      multiple
      :show-file-list="false"
      :disabled="Boolean(locationError)"
      :before-upload="beforeUpload"
      :http-request="upload"
    >
      <ElButton :icon="Plus" :loading="uploading">上传现场照片</ElButton>
    </ElUpload>
    <p v-if="!disabled && locationError" class="m-0 text-xs text-amber-700" role="status">{{ locationError }}</p>
    <p class="m-0 text-xs text-slate-500">已上传 {{ currentIds.length }}/{{ limit }} 张<span v-if="uploading">，{{ pendingCount }} 张上传中</span>，单张不超过 10MB；现场照片由后端叠加时间、地址和坐标水印。</p>
  </div>
</template>
