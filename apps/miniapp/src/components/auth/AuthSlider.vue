<script setup lang="ts">
import { computed, onMounted, shallowRef, toRefs } from "vue";
import { apiBaseUrl, miniappApi } from "@/api/runtime";

type SliderState =
  | "preparing"
  | "ready"
  | "dragging"
  | "verifying"
  | "verified"
  | "error";

interface SliderTouchEvent {
  touches?: ArrayLike<{ clientX: number }>;
  changedTouches?: ArrayLike<{ clientX: number }>;
}

const { disabled } = toRefs(
  withDefaults(defineProps<{ disabled?: boolean }>(), {
    disabled: false,
  }),
);
const emit = defineEmits<{
  invalidated: [];
  verified: [passToken: string];
}>();

const HANDLE_WIDTH = 48;
const LOGIN_LAYOUT_HORIZONTAL_SPACE = 90;
const COMPLETE_TOLERANCE = 6;

const state = shallowRef<SliderState>("preparing");
const sliderId = shallowRef("");
const offset = shallowRef(0);
const trackWidth = shallowRef(280);
const startX = shallowRef(0);
const startedAt = shallowRef(0);
const errorMessage = shallowRef("");

const maxTravel = computed(() => Math.max(trackWidth.value - HANDLE_WIDTH, 1));
const progressWidth = computed(() => `${Math.min(offset.value + HANDLE_WIDTH / 2, trackWidth.value)}px`);
const isInteractive = computed(() => state.value === "ready" || state.value === "dragging");
const stateText = computed(() => {
  if (state.value === "preparing") return "正在准备验证…";
  if (state.value === "verifying") return "正在验证…";
  if (state.value === "verified") return "验证通过";
  if (state.value === "error") return errorMessage.value || "验证加载失败";
  return "请按住滑块拖动";
});

function errorText(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "验证服务暂不可用";
}

function firstTouchX(event: SliderTouchEvent, changed = false): number | null {
  const list = changed ? event.changedTouches : event.touches;
  const touch = list?.[0];
  return touch && Number.isFinite(touch.clientX) ? touch.clientX : null;
}

function updateTrackWidth(): void {
  try {
    const system = uni.getSystemInfoSync();
    trackWidth.value = Math.max(Number(system.windowWidth) - LOGIN_LAYOUT_HORIZONTAL_SPACE, 220);
  } catch {
    trackWidth.value = 280;
  }
}

async function prepare(): Promise<void> {
  emit("invalidated");
  offset.value = 0;
  sliderId.value = "";
  errorMessage.value = "";
  state.value = "preparing";

  if (!apiBaseUrl) {
    state.value = "error";
    errorMessage.value = "未配置小程序 API 地址";
    return;
  }

  try {
    const result = await miniappApi.auth.startSlider();
    sliderId.value = result.slider_id;
    state.value = "ready";
  } catch (error) {
    state.value = "error";
    errorMessage.value = errorText(error);
  }
}

function onTouchStart(event: SliderTouchEvent): void {
  if (disabled.value || !isInteractive.value) return;
  const clientX = firstTouchX(event);
  if (clientX === null) return;
  state.value = "dragging";
  startX.value = clientX - offset.value;
  startedAt.value = Date.now();
}

function onTouchMove(event: SliderTouchEvent): void {
  if (disabled.value || state.value !== "dragging") return;
  const clientX = firstTouchX(event);
  if (clientX === null) return;
  offset.value = Math.min(Math.max(clientX - startX.value, 0), maxTravel.value);
}

async function onTouchEnd(event: SliderTouchEvent): Promise<void> {
  if (disabled.value || state.value !== "dragging") return;
  const clientX = firstTouchX(event, true);
  if (clientX !== null) {
    offset.value = Math.min(Math.max(clientX - startX.value, 0), maxTravel.value);
  }

  if (offset.value < maxTravel.value - COMPLETE_TOLERANCE) {
    offset.value = 0;
    state.value = "ready";
    return;
  }

  state.value = "verifying";
  offset.value = maxTravel.value;
  try {
    const result = await miniappApi.auth.finishSlider({
      slider_id: sliderId.value,
      duration_ms: Math.max(Date.now() - startedAt.value, 1),
    });
    state.value = "verified";
    emit("verified", result.pass_token);
  } catch (error) {
    uni.showToast({ title: errorText(error), icon: "none" });
    await prepare();
  }
}

function onTouchCancel(): void {
  if (state.value !== "dragging") return;
  offset.value = 0;
  state.value = "ready";
}

onMounted(() => {
  updateTrackWidth();
  void prepare();
});

defineExpose({ reset: prepare });
</script>

<template>
  <view class="auth-slider">
    <view
      class="auth-slider__track"
      :class="{
        'auth-slider__track--verified': state === 'verified',
        'auth-slider__track--error': state === 'error',
        'auth-slider__track--disabled': disabled,
      }"
    >
      <view class="auth-slider__progress" :style="{ width: progressWidth }" />
      <text class="auth-slider__text">{{ stateText }}</text>
      <view
        v-if="state !== 'error'"
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
        <text aria-hidden="true">{{ state === "verified" ? "✓" : "›" }}</text>
      </view>
      <button
        v-else
        class="auth-slider__retry"
        :disabled="disabled"
        @tap="prepare"
      >
        重试
      </button>
    </view>
  </view>
</template>

<style scoped lang="scss">
.auth-slider {
  width: 100%;
}

.auth-slider__track {
  position: relative;
  width: 100%;
  height: 48px;
  overflow: hidden;
  border: 1px solid var(--gbnt-border, #dce4ee);
  border-radius: 6px;
  background: #f4f7fb;
  color: var(--gbnt-text-secondary, #526277);
  box-sizing: border-box;
}

.auth-slider__progress {
  position: absolute;
  inset: 0 auto 0 0;
  width: 24px;
  background: #dbeafe;
  transition: width 80ms linear;
}

.auth-slider__text {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 54px;
  font-size: 14px;
  text-align: center;
}

.auth-slider__handle {
  position: absolute;
  top: -1px;
  left: -1px;
  display: flex;
  width: 48px;
  height: 48px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--gbnt-primary, #015cbb);
  border-radius: 6px;
  background: #ffffff;
  color: var(--gbnt-primary, #015cbb);
  font-size: 30px;
  line-height: 1;
  box-sizing: border-box;
}

.auth-slider__track--verified {
  border-color: var(--gbnt-success, #197447);
  color: var(--gbnt-success, #197447);
}

.auth-slider__track--verified .auth-slider__progress {
  background: #dcfce7;
}

.auth-slider__handle--verified {
  border-color: var(--gbnt-success, #197447);
  background: var(--gbnt-success, #197447);
  color: #ffffff;
  font-size: 22px;
}

.auth-slider__track--error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-left: 12px;
  border-color: #f3b7b3;
  background: #fff4f3;
  color: var(--gbnt-danger, #b42318);
}

.auth-slider__track--error .auth-slider__text {
  position: static;
  flex: 1;
  justify-content: flex-start;
  padding: 0;
  text-align: left;
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
