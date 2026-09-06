import { computed, shallowRef } from "vue";
import type { SliderFinishInput, SliderFinishResult, SliderStartResult } from "@gbnt/api-client";
import { sliderFailureMessage } from "./slider-feedback";

type SliderState = "preparing" | "ready" | "dragging" | "verifying" | "verified" | "error";

export interface SliderTouchEvent {
  touches?: ArrayLike<{ clientX: number }>;
  changedTouches?: ArrayLike<{ clientX: number }>;
}

interface SliderOptions {
  configured: () => boolean;
  disabled: () => boolean;
  start: () => Promise<SliderStartResult>;
  finish: (input: SliderFinishInput) => Promise<SliderFinishResult>;
  invalidated: () => void;
  verified: (token: string) => void;
}

const HANDLE_WIDTH = 48;
const COMPLETE_TOLERANCE = 6;

/** 只管理本次滑动验证；过期、重置及卸载后，旧请求不得签发页面可用的凭证。 */
export function useAuthSlider(options: SliderOptions) {
  const state = shallowRef<SliderState>("preparing");
  const offset = shallowRef(0);
  const trackWidth = shallowRef(280);
  const errorMessage = shallowRef("");
  const busy = computed(() => state.value === "preparing" || state.value === "verifying");
  const maxTravel = computed(() => Math.max(trackWidth.value - HANDLE_WIDTH, 1));
  const progressWidth = computed(() => `${Math.min(offset.value + HANDLE_WIDTH / 2, trackWidth.value)}px`);
  const stateText = computed(() => {
    if (state.value === "preparing") return "正在准备验证…";
    if (state.value === "verifying") return "正在验证…";
    if (state.value === "verified") return "验证通过";
    if (state.value === "error") return "验证暂不可用";
    return "请按住滑块拖动";
  });
  let sliderId = "";
  let startX = 0;
  let startedAt = 0;
  let expiresAt = 0;
  let generation = 0;
  let operation: "start" | "finish" | null = null;
  let disposed = false;
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;

  function clearExpiry(): void {
    if (expiryTimer !== undefined) clearTimeout(expiryTimer);
    expiryTimer = undefined;
    expiresAt = 0;
  }

  function fail(message: string): void {
    generation += 1;
    operation = null;
    clearExpiry();
    sliderId = "";
    offset.value = 0;
    errorMessage.value = message;
    state.value = "error";
    options.invalidated();
  }

  function checkExpiry(): boolean {
    if (disposed || !expiresAt || Date.now() < expiresAt) return false;
    fail(state.value === "verified" ? "验证凭证已过期，请点击重试后重新验证。" : "滑动会话已过期，请点击重试后重新拖动。");
    return true;
  }

  function armExpiry(deadline: number): void {
    clearExpiry();
    expiresAt = deadline;
    const schedule = (): void => {
      expiryTimer = setTimeout(() => {
        if (!disposed && !checkExpiry()) schedule();
      }, Math.min(Math.max(expiresAt - Date.now(), 0), 2_147_483_647));
    };
    schedule();
  }

  function validUntil(requestedAt: number, ttl: number): number {
    const deadline = requestedAt + ttl * 1000;
    if (!Number.isSafeInteger(ttl) || ttl <= 0 || !Number.isSafeInteger(deadline)) throw new Error("验证服务响应异常");
    if (Date.now() >= deadline) throw new Error("验证已过期");
    return deadline;
  }

  async function begin(): Promise<void> {
    const ticket = ++generation;
    operation = "start";
    clearExpiry();
    sliderId = "";
    offset.value = 0;
    errorMessage.value = "";
    state.value = "preparing";
    options.invalidated();
    if (!options.configured()) {
      fail(sliderFailureMessage(new Error("未配置 API 地址")));
      return;
    }
    const requestedAt = Date.now();
    try {
      const result = await options.start();
      if (disposed || generation !== ticket) return;
      if (!result.slider_id?.trim()) throw new Error("验证服务响应异常");
      const deadline = validUntil(requestedAt, result.expire_seconds);
      sliderId = result.slider_id;
      operation = null;
      state.value = "ready";
      armExpiry(deadline);
    } catch (error) {
      if (!disposed && generation === ticket) fail(sliderFailureMessage(error));
    }
  }

  /** 用户重试去重；父页面主动重置则使用 reset 淘汰正在进行的请求。 */
  async function prepare(): Promise<void> {
    if (disposed || operation || options.disabled()) return;
    await begin();
  }

  async function reset(): Promise<void> {
    if (disposed) return;
    await begin();
  }

  function touchX(event: SliderTouchEvent, changed = false): number | null {
    const touch = (changed ? event.changedTouches : event.touches)?.[0];
    return touch && Number.isFinite(touch.clientX) ? touch.clientX : null;
  }

  function onTouchStart(event: SliderTouchEvent): void {
    if (disposed || options.disabled() || checkExpiry() || state.value !== "ready") return;
    const x = touchX(event);
    if (x === null) return;
    state.value = "dragging";
    startX = x - offset.value;
    startedAt = Date.now();
  }

  function onTouchMove(event: SliderTouchEvent): void {
    if (disposed || options.disabled() || checkExpiry() || state.value !== "dragging") return;
    const x = touchX(event);
    if (x !== null) offset.value = Math.min(Math.max(x - startX, 0), maxTravel.value);
  }

  async function onTouchEnd(event: SliderTouchEvent): Promise<void> {
    if (disposed || options.disabled() || checkExpiry() || state.value !== "dragging") return;
    const x = touchX(event, true);
    if (x !== null) offset.value = Math.min(Math.max(x - startX, 0), maxTravel.value);
    if (offset.value < maxTravel.value - COMPLETE_TOLERANCE) {
      offset.value = 0;
      state.value = "ready";
      return;
    }
    const ticket = generation;
    const requestedAt = Date.now();
    operation = "finish";
    state.value = "verifying";
    offset.value = maxTravel.value;
    try {
      const result = await options.finish({ slider_id: sliderId, duration_ms: Math.max(requestedAt - startedAt, 1) });
      if (disposed || generation !== ticket || checkExpiry()) return;
      if (!result.pass_token?.trim()) throw new Error("验证服务响应异常");
      const deadline = validUntil(requestedAt, result.expire_seconds);
      operation = null;
      state.value = "verified";
      armExpiry(deadline);
      options.verified(result.pass_token);
    } catch (error) {
      if (!disposed && generation === ticket) fail(sliderFailureMessage(error));
    }
  }

  function onTouchCancel(): void {
    if (disposed || checkExpiry() || state.value !== "dragging") return;
    offset.value = 0;
    state.value = "ready";
  }

  function setTrackWidth(width: number | null): void {
    if (disposed || width === null || !Number.isFinite(width) || width <= HANDLE_WIDTH) return;
    if (state.value === "dragging") onTouchCancel();
    trackWidth.value = width;
    offset.value = state.value === "verified" || state.value === "verifying" ? maxTravel.value : 0;
  }

  function dispose(): void {
    disposed = true;
    generation += 1;
    operation = null;
    clearExpiry();
  }

  return { state, offset, errorMessage, busy, maxTravel, progressWidth, stateText, prepare, reset,
    onTouchStart, onTouchMove, onTouchEnd, onTouchCancel, setTrackWidth, checkExpiry, dispose };
}
