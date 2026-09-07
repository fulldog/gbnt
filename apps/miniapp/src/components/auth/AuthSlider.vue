<script setup lang="ts">
import { getCurrentInstance, nextTick, onBeforeUnmount, onMounted, toRefs } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { apiBaseUrl, miniappApi } from "@/api/runtime";
import { useAuthSlider } from "./useAuthSlider";
import { measureSliderTrack } from "./slider-feedback";

const props = withDefaults(defineProps<{ disabled?: boolean }>(), { disabled: false });
const { disabled } = toRefs(props);
const emit = defineEmits<{
  invalidated: [];
  verified: [passToken: string];
}>();

const instance = getCurrentInstance();
const {
  state, offset, errorMessage, busy, progressWidth, stateText, prepare, reset,
  onTouchStart, onTouchMove, onTouchEnd, onTouchCancel, setTrackWidth, checkExpiry, dispose,
} = useAuthSlider({
  configured: () => Boolean(apiBaseUrl),
  disabled: () => disabled.value,
  start: () => miniappApi.auth.startSlider(),
  finish: (input) => miniappApi.auth.finishSlider(input),
  invalidated: () => emit("invalidated"),
  verified: (token) => emit("verified", token),
});
let disposed = false;
let measurement = 0;

async function updateTrackWidth(): Promise<void> {
  const current = ++measurement;
  await nextTick();
  if (disposed) return;
  const width = await measureSliderTrack(instance?.proxy);
  if (!disposed && measurement === current) setTrackWidth(width);
}

async function retry(): Promise<void> {
  if (disabled.value || busy.value) return;
  void updateTrackWidth();
  await prepare();
}

onMounted(async () => {
  await updateTrackWidth();
  if (!disposed) void prepare();
});
onShow(() => { checkExpiry(); });
onBeforeUnmount(() => {
  disposed = true;
  measurement += 1;
  dispose();
});

defineExpose({ reset });
</script>

<template>
  <view class="auth-slider">
    <view
      class="auth-slider__track"
      :class="{
        'auth-slider__track--verified': state === 'verified',
        'auth-slider__track--error': state === 'error',
        'auth-slider__track--preparing': state === 'preparing',
        'auth-slider__track--disabled': disabled,
      }"
    >
      <view v-if="state !== 'error' && state !== 'preparing'" class="auth-slider__progress" :style="{ width: progressWidth }" />
      <text class="auth-slider__text">{{ stateText }}</text>
      <view
        v-if="state !== 'error' && state !== 'preparing'"
        class="auth-slider__handle"
        :class="{ 'auth-slider__handle--verified': state === 'verified' }"
        :style="{ transform: `translateX(${offset}px)` }"
        role="button"
        aria-label="拖动滑块完成人机验证"
        @touchstart.stop="onTouchStart"
        @touchmove.stop.prevent="onTouchMove"
        @touchend.stop="onTouchEnd"
        @touchcancel.stop="onTouchCancel"
      >
        <text class="auth-slider__handle-icon" aria-hidden="true">{{ state === "verified" ? "✓" : "›" }}</text>
      </view>
      <button
        v-else
        class="auth-slider__retry"
        :disabled="disabled || busy"
        :loading="busy"
        @tap="retry"
      >
        重试
      </button>
    </view>
    <text v-if="errorMessage" class="auth-slider__error" role="alert">{{ errorMessage }}</text>
  </view>
</template>

<style scoped lang="scss">
.auth-slider {
  width: 100%;
}

.auth-slider__track {
  position: relative;
  width: 100%;
  height: 44px;
  overflow: hidden;
  border: 0;
  border-radius: 6px;
  background: #f0f4f8;
  color: var(--gbnt-text-secondary, #526277);
  box-sizing: border-box;
}

.auth-slider__progress {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 24px;
  background: #dbeafe;
  transition: width 80ms linear;
}

.auth-slider__text {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 54px;
  font-size: 14px;
  text-align: center;
}

.auth-slider__handle {
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  width: 48px;
  height: 44px;
  align-items: center;
  justify-content: center;
  padding: 3px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--gbnt-primary, #015cbb);
  font-size: 30px;
  line-height: 1;
  box-sizing: border-box;
}

.auth-slider__track--verified {
  box-shadow: inset 0 0 0 1px var(--gbnt-success, #197447);
  color: var(--gbnt-success, #197447);
}

.auth-slider__track--verified .auth-slider__progress {
  background: #dcfce7;
}

.auth-slider__handle-icon {
  display: flex;
  width: 100%;
  height: 100%;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  background: #fff;
}

.auth-slider__handle--verified .auth-slider__handle-icon {
  background: var(--gbnt-success, #197447);
  color: #ffffff;
  font-size: 22px;
}

.auth-slider__track--error,
.auth-slider__track--preparing {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-left: 12px;
}

.auth-slider__track--error {
  box-shadow: inset 0 0 0 1px #f3b7b3;
  background: #fff4f3;
  color: var(--gbnt-danger, #b42318);
}

.auth-slider__track--error .auth-slider__text,
.auth-slider__track--preparing .auth-slider__text {
  position: static;
  flex: 1;
  min-width: 0;
  justify-content: flex-start;
  padding: 0;
  text-align: left;
}

.auth-slider__error {
  display: block;
  margin-top: 8px;
  color: var(--gbnt-danger, #b42318);
  font-size: 12px;
  line-height: 1.6;
  white-space: normal;
  word-break: break-word;
}

.auth-slider__retry {
  width: 64px;
  min-width: 64px;
  height: 44px;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--gbnt-primary, #015cbb);
  font-size: 14px;
  line-height: 44px;
}

.auth-slider__retry::after {
  border: 0;
}

.auth-slider__track--disabled {
  opacity: 0.65;
}
</style>
