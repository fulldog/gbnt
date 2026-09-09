<script setup lang="ts">
import { computed } from "vue";
import RecoverableImage from "@/components/common/RecoverableImage.vue";

const props = withDefaults(
  defineProps<{
    urls: readonly string[];
    max?: number;
    compact?: boolean;
  }>(),
  {
    max: 9,
    compact: false,
  },
);

const emit = defineEmits<{
  preview: [index: number];
}>();

const visibleUrls = computed(() => props.urls.slice(0, props.max));
</script>

<template>
  <view v-if="visibleUrls.length" class="photo-grid" :class="{ 'photo-grid--compact': compact, 'photo-grid--one': visibleUrls.length === 1, 'photo-grid--two': visibleUrls.length === 2 }">
    <view
      v-for="(url, index) in visibleUrls"
      :key="`${url}-${index}`"
      class="photo-grid__item"
    >
      <view class="photo-grid__image"><RecoverableImage :src="url" :alt="`第 ${index + 1} 张照片`" @preview="emit('preview', index)" /></view>
      <text v-if="index === visibleUrls.length - 1 && urls.length > max" class="photo-grid__more">
        +{{ urls.length - max }}
      </text>
    </view>
  </view>
</template>

<style scoped lang="scss">
.photo-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
  margin-top: 8px;
  overflow: hidden;
  border-radius: 6px;
}
.photo-grid--one {
  grid-template-columns: 1fr;
}
.photo-grid--two {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.photo-grid__item {
  position: relative;
  width: 100%;
  height: 0;
  padding-bottom: 100%;
  min-width: 0;
  overflow: hidden;
  background: #f0f4f8;
}
.photo-grid--one .photo-grid__item {
  padding-bottom: 62.5%;
}
.photo-grid__image {
  position: absolute;
  inset: 0;
}
.photo-grid--compact {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}
.photo-grid--compact .photo-grid__item {
  flex: none;
  width: 72px;
  height: 72px;
  padding: 0;
  border-radius: 6px;
}
.photo-grid__more {
  position: absolute;
  right: 0;
  bottom: 0;
  z-index: 1;
  padding: 4px 8px;
  border-top-left-radius: 6px;
  background: rgba(0, 0, 0, .52);
  color: #fff;
  font-size: 12px;
  pointer-events: none;
}
</style>
