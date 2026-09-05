<script setup lang="ts">
import { computed } from "vue";

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
    <button
      v-for="(url, index) in visibleUrls"
      :key="`${url}-${index}`"
      class="photo-grid__item"
      :aria-label="`查看第 ${index + 1} 张照片`"
      @tap.stop="emit('preview', index)"
    >
      <image class="photo-grid__image" :src="url" mode="aspectFill" lazy-load />
      <text v-if="index === visibleUrls.length - 1 && urls.length > max" class="photo-grid__more">
        +{{ urls.length - max }}
      </text>
    </button>
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
  min-height: 0;
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

.photo-grid__item::after {
  border: 0;
}

.photo-grid__image {
  display: block;
  width: 100%;
  height: 100%;
}

.photo-grid__more {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.52);
  color: #fff;
  font-size: 32rpx;
  font-weight: 600;
}
</style>
