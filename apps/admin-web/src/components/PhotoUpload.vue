<script setup lang="ts">
import type { FileItem } from "@gbnt/api-client";
import { Close, Plus } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import type { UploadRequestOptions, UploadRawFile } from "element-plus";
import { computed, shallowRef } from "vue";
import { useAdminApi } from "@/api/runtime";
import { errorMessage } from "@/utils/error";
import { resolveAssetUrl } from "@/utils/asset";

const {
  photos = [],
  disabled = false,
  limit = 6,
} = defineProps<{
  photos?: readonly FileItem[];
  disabled?: boolean;
  limit?: number;
}>();

const files = defineModel<string[]>({ required: true });
const api = useAdminApi();
const uploading = shallowRef(false);
const uploadedItems = shallowRef<FileItem[]>([]);

const visibleItems = computed(() => {
  const byId = new Map<string, FileItem>();
  [...photos, ...uploadedItems.value].forEach((item) => byId.set(item.file_id, item));
  return files.value.map((id) => byId.get(id) ?? { file_id: id, url: "" });
});

function beforeUpload(file: UploadRawFile): boolean {
  if (!file.type.startsWith("image/")) {
    ElMessage.error("只能上传图片文件");
    return false;
  }
  if (file.size > 10 * 1024 * 1024) {
    ElMessage.error("单张图片不能超过 10MB");
    return false;
  }
  if (files.value.length >= limit) {
    ElMessage.warning(`最多上传 ${limit} 张图片`);
    return false;
  }
  return true;
}

async function upload(options: UploadRequestOptions): Promise<unknown> {
  uploading.value = true;
  try {
    const result = await api.attachments.uploadImages({ files: [options.file] });
    uploadedItems.value = [...uploadedItems.value, ...result.list];
    files.value = [...files.value, ...result.list.map((item) => item.file_id)];
    return result;
  } catch (error) {
    ElMessage.error(errorMessage(error, "图片上传失败"));
    throw error;
  } finally {
    uploading.value = false;
  }
}

function remove(id: string): void {
  files.value = files.value.filter((item) => item !== id);
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
      v-if="!disabled && files.length < limit"
      action="#"
      accept="image/*"
      multiple
      :show-file-list="false"
      :before-upload="beforeUpload"
      :http-request="upload"
    >
      <ElButton :icon="Plus" :loading="uploading">上传现场照片</ElButton>
    </ElUpload>
    <p class="m-0 text-xs text-slate-500">已上传 {{ files.length }}/{{ limit }} 张，单张不超过 10MB。</p>
  </div>
</template>
