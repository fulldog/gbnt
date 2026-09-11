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
  state, offset, handleRevision, trackWidth, errorMessage, busy, stateText, prepare, reset, onNativeChange,
  onTouchStart, onTouchEnd, onTouchCancel, setTrackWidth, checkExpiry, dispose,
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
      <view v-if="state === 'verified'" class="auth-slider__progress" />
      <text class="auth-slider__text">{{ stateText }}</text>
      <movable-area v-if="state !== 'error' && state !== 'preparing'" class="auth-slider__area">
        <movable-view v-for="revision in [handleRevision]" :key="revision" class="auth-slider__handle" direction="horizontal" :x="offset" :animation="false"
          :inertia="false" :out-of-bounds="false" :disabled="disabled || !['ready', 'dragging'].includes(state)"
          role="button" aria-label="拖动滑块完成人机验证"
          @touchstart.stop="onTouchStart" @change="onNativeChange"
          @touchend.stop="onTouchEnd" @touchcancel.stop="onTouchCancel">
          <view class="auth-slider__trail" :style="{ width: `${trackWidth}px` }" />
          <view class="auth-slider__face">
            <image class="auth-slider__handle-icon"
              :src="state === 'verified' ? '/static/icons/check-success.svg' : '/static/icons/chevron-right.svg'"
              mode="aspectFit" aria-hidden="true" />
          </view>
        </movable-view>
      </movable-area>
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
  color: #999;
  box-sizing: border-box;
}

.auth-slider__track::after {
  position: absolute;
  z-index: 1;
  top: 0;
  bottom: 0;
  left: 0;
  width: 3px;
  background: inherit;
  content: "";
  pointer-events: none;
}

.auth-slider__progress {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 100%;
  background: #56d288;
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

.auth-slider__area {
  position: absolute;
  top: 3px;
  left: 3px;
  width: calc(100% - 6px);
  height: 38px;
}
.auth-slider__trail {
  position: absolute;
  right: 48px;
  top: -3px;
  height: 44px;
  background: #56d288;
  pointer-events: none;
}
.auth-slider__face {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  background: #fff;
  border-radius: 6px;
}
.auth-slider__handle {
  display: flex;
  width: 48px;
  height: 38px;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: #fff;
  box-sizing: border-box;
}

.auth-slider__track--verified {
  color: #fff;
}

.auth-slider__track--verified::after {
  background: #56d288;
}

.auth-slider__track--verified .auth-slider__progress {
  background: #56d288;
}

.auth-slider__handle-icon {
  display: block;
  flex: none;
  width: 18px;
  height: 20px;
  pointer-events: none;
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
