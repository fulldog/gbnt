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
  padding: 8px 16px 4px;
  background: #fff;
}
.facility-types__scroll {
  width: 100%;
  overflow: hidden;
  white-space: nowrap;
  border-radius: 8px;
  background: #f2f3f5;
}
.facility-types__list {
  display: flex;
  min-width: 100%;
  padding: 2px;
}
.facility-types__tab {
  flex: 1;
  min-width: 0;
  height: 30px;
  margin: 0;
  padding: 0 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #666;
  font-size: 14px;
  line-height: 30px;
  white-space: nowrap;
}
.facility-types__tab--active {
  background: #fff;
  color: var(--color-primary);
  font-weight: 600;
}
.facility-types__tab--pressed {
  opacity: .7;
}
.facility-types__tab[disabled] {
  opacity: .5;
}
.facility-types__fade {
  position: absolute;
  top: 8px;
  bottom: 4px;
  z-index: 1;
  width: 14px;
  pointer-events: none;
}
.facility-types__fade--left {
  left: 16px;
  background: linear-gradient(to right, #f2f3f5, transparent);
}
.facility-types__fade--right {
  right: 16px;
  background: linear-gradient(to left, #f2f3f5, transparent);
}
@media (max-width: 340px) { .facility-types__tab { padding: 0 4px; } }
</style>
