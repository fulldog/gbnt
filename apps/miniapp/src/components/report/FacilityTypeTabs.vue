<script setup lang="ts">
import { getCurrentInstance, onBeforeUnmount, onMounted, watch } from "vue";
import { onShow } from "@dcloudio/uni-app";
import type { IssueType } from "@gbnt/api-client";
import { ISSUE_TYPE_OPTIONS } from "@/domain/issues/definitions";
import { useTabScrollEdges } from "./useTabScrollEdges";

const props = withDefaults(defineProps<{
  value: IssueType;
  disabled?: boolean;
}>(), { disabled: false });
const emit = defineEmits<{ select: [type: IssueType] }>();
const instance = getCurrentInstance();
const { showLeftFade, showRightFade, onScroll, refresh, dispose } = useTabScrollEdges(() => instance?.proxy);
const refreshEdges = (): void => { void refresh(); };
let resizeListening = false;

onMounted(() => {
  refreshEdges();
  if (typeof uni.onWindowResize === "function" && typeof uni.offWindowResize === "function") {
    uni.onWindowResize(refreshEdges);
    resizeListening = true;
  }
});
onShow(refreshEdges);
watch(() => props.value, refreshEdges, { flush: "post" });
onBeforeUnmount(() => {
  if (resizeListening) uni.offWindowResize(refreshEdges);
  dispose();
});

function select(type: IssueType): void {
  if (!props.disabled && type !== props.value) emit("select", type);
}
</script>

<template>
  <view class="facility-types">
    <scroll-view
      class="facility-types__scroll"
      :scroll-x="true"
      :show-scrollbar="false"
      :scroll-into-view="`facility-type-${props.value}`"
      @scroll="onScroll"
    >
      <view class="facility-types__list" role="tablist" aria-label="巡查设施类型">
        <button
          v-for="option in ISSUE_TYPE_OPTIONS"
          :id="`facility-type-${option.value}`"
          :key="option.value"
          class="facility-types__tab"
          :class="{ 'facility-types__tab--active': props.value === option.value }"
          :disabled="props.disabled"
          role="tab"
          :aria-selected="props.value === option.value"
          :aria-label="`${option.label}${props.value === option.value ? '，已选中' : ''}`"
          hover-class="facility-types__tab--pressed"
          @tap="select(option.value)"
        >
          {{ option.label }}
        </button>
      </view>
    </scroll-view>
    <view v-if="showLeftFade" class="facility-types__fade facility-types__fade--left" aria-hidden="true" />
    <view v-if="showRightFade" class="facility-types__fade facility-types__fade--right" aria-hidden="true" />
  </view>
</template>

<style scoped lang="scss">
.facility-types {
  position: relative;
  padding: 4px 24rpx 0;
  background: var(--color-surface);
}

.facility-types__scroll {
  width: 100%;
  overflow: hidden;
  white-space: nowrap;
  background: transparent;
}

.facility-types__list {
  display: inline-flex;
  min-width: 100%;
  justify-content: space-between;
  vertical-align: top;
}

.facility-types__tab {
  position: relative;
  flex: 0 0 auto;
  min-width: 44px;
  min-height: 48px;
  margin: 0;
  padding: 0 10px;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 16px;
  line-height: 48px;
  white-space: nowrap;
}

.facility-types__tab + .facility-types__tab { margin-left: 8px; }
.facility-types__tab::after { border: 0; }
.facility-types__tab::before {
  position: absolute;
  bottom: 3px;
  left: 50%;
  width: 24px;
  height: 3px;
  border-radius: 2px;
  background: var(--color-primary);
  content: "";
  opacity: 0;
  transform: translateX(-50%);
  transition: opacity 160ms ease;
}
.facility-types__tab--active {
  color: var(--color-primary);
  font-weight: 700;
}
.facility-types__tab--active::before { opacity: 1; }
.facility-types__tab--pressed { opacity: 0.7; }
.facility-types__tab[disabled] { opacity: 0.5; }

.facility-types__fade {
  position: absolute;
  top: 4px;
  bottom: 0;
  z-index: 1;
  width: 14px;
  pointer-events: none;
}
.facility-types__fade--left {
  left: 24rpx;
  background: linear-gradient(to right, var(--color-surface), rgba(255, 255, 255, 0));
}
.facility-types__fade--right {
  right: 24rpx;
  background: linear-gradient(to left, var(--color-surface), rgba(255, 255, 255, 0));
}

@media (prefers-reduced-motion: reduce) {
  .facility-types__tab::before { transition: none; }
}
</style>
