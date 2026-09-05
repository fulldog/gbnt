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
  <view v-if="visibleUrls.length" class="photo-grid" :class="{ 'photo-grid--compact': compact }">
    <view
      v-for="(url, index) in visibleUrls"
      :key="`${url}-${index}`"
      class="photo-grid__item"
    >
      <RecoverableImage :src="url" :alt="`第 ${index + 1} 张照片`" @preview="emit('preview', index)" />
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
  gap: 12rpx;
  margin-top: 20rpx;
}

.photo-grid--compact {
  grid-template-columns: repeat(3, 144rpx);
}

.photo-grid__item {
  position: relative;
  width: 100%;
  height: 188rpx;
  min-width: 44px;
  min-height: 44px;
  padding: 0;
  overflow: hidden;
  border: 0;
  border-radius: var(--gb-radius-sm, 12rpx);
  background: #eef2f6;
  line-height: 1;
}

.photo-grid--compact .photo-grid__item {
  height: 144rpx;
}

.photo-grid__more {
  position: absolute;
  right: 0;
  bottom: 0;
  padding: 4px 8px;
  border-top-left-radius: var(--gb-radius-sm);
  background: rgba(0, 0, 0, 0.52);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  pointer-events: none;
}
</style>
