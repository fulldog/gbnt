<script setup lang="ts">
withDefaults(defineProps<{ title?: string }>(), { title: "" });

// 按设备状态栏与微信胶囊留白；标题位于胶囊左侧的透明导航区。
const windowInfo = uni.getWindowInfo();
const statusHeight = windowInfo.statusBarHeight || 0;
let height = statusHeight + 44;
let titleRight = 104;
// #ifdef MP-WEIXIN
const capsule = uni.getMenuButtonBoundingClientRect();
if (capsule.height > 0 && capsule.top >= statusHeight) {
  height = capsule.bottom + (capsule.top - statusHeight);
  titleRight = Math.max(16, windowInfo.windowWidth - capsule.left + 8);
}
// #endif
</script>

<template>
  <view class="page-top-inset" :style="{ height: `${height}px` }">
    <view
      v-if="title"
      class="page-top-inset__navigation"
      :style="{ top: `${statusHeight}px`, height: `${height - statusHeight}px`, right: `${titleRight}px` }"
    >
      <text class="page-top-inset__title">{{ title }}</text>
    </view>
  </view>
</template>

<style scoped>
.page-top-inset { flex: none; width: 100%; pointer-events: none; }
.page-top-inset__navigation {
  position: fixed;
  left: 16px;
  z-index: 20;
  display: flex;
  align-items: center;
}
.page-top-inset__title {
  overflow: hidden;
  color: #111;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.4;
  white-space: nowrap;
  text-overflow: ellipsis;
}
</style>
