<script setup lang="ts">
import { computed } from "vue";
import { resolveAssetUrl } from "@/utils/asset";
const { photos } = defineProps<{ photos: readonly { file_id: string; url: string }[] }>();
const urls = computed(() => photos.map((photo) => resolveAssetUrl(photo.url)));
</script>

<template>
  <div class="photo-gallery">
    <ElImage v-for="(photo, index) in photos" :key="photo.file_id" :src="urls[index]" :preview-src-list="urls" :initial-index="index" preview-teleported fit="cover" loading="lazy"  v-bind="{ 'alt': `现场照片 ${index + 1}` }" />
  </div>
</template>

<style scoped>
.photo-gallery { display: flex; flex-wrap: wrap; gap: 8px; }
.photo-gallery :deep(.el-image) { width: 84px; height: 84px; border: 1px solid #e2e8f0; border-radius: 6px; }
</style>
