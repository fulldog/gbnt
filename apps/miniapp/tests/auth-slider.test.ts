import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SliderFinishResult, SliderStartResult } from "@gbnt/api-client";
import { useAuthSlider } from "@/components/auth/useAuthSlider";
import { measureSliderTrack, sliderFailureMessage } from "@/components/auth/slider-feedback";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

const instances: ReturnType<typeof useAuthSlider>[] = [];
function setup() {
  const options = {
    configured: vi.fn(() => true), disabled: vi.fn(() => false),
    start: vi.fn(async (): Promise<SliderStartResult> => ({ slider_id: "session-current", expire_seconds: 300 })),
    finish: vi.fn(async (): Promise<SliderFinishResult> => ({ pass_token: "verified-current", expire_seconds: 180 })),
    invalidated: vi.fn(), verified: vi.fn(),
  };
  const slider = useAuthSlider(options);
  instances.push(slider);
  return { slider, options };
}
function gesture(slider: ReturnType<typeof useAuthSlider>, duration = 500) {
  slider.onTouchStart({ touches: [{ clientX: 10 }] });
  vi.advanceTimersByTime(duration);
  return slider.onTouchEnd({ changedTouches: [{ clientX: 1000 }] });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-06T00:00:00Z"));
});
afterEach(() => {
  for (const slider of instances.splice(0)) slider.dispose();
  vi.useRealTimers();
});

describe("安全验证生命周期", () => {
  it("原生拖动不逐帧回写位置，结束时使用最后的原生偏移完成验证", async () => {
    const { slider, options } = setup();
    await slider.prepare();
    slider.onTouchStart({ touches: [{ clientX: 10 }] });
    for (const x of [40, 80, 160, slider.maxTravel.value]) {
      slider.onNativeChange({ detail: { x, source: "touch" } });
      expect(slider.offset.value).toBe(0);
    }
    vi.advanceTimersByTime(600);
    await slider.onTouchEnd({});
    expect(options.finish).toHaveBeenCalledTimes(1);
    expect(slider.state.value).toBe("verified");
  });

  it("原生拖动未到末端时重建滑块回到起点且不请求验证", async () => {
    const { slider, options } = setup();
    await slider.prepare();
    const revision = slider.handleRevision.value;
    slider.onTouchStart({ touches: [{ clientX: 10 }] });
    slider.onNativeChange({ detail: { x: 80, source: "touch" } });
    await slider.onTouchEnd({});
    expect(slider.offset.value).toBe(0);
    expect(slider.handleRevision.value).toBeGreaterThan(revision);
    expect(slider.state.value).toBe("ready");
    expect(options.finish).not.toHaveBeenCalled();
  });

  it("未配置地址时不发请求，短状态与完整恢复原因分开", async () => {
    const { slider, options } = setup();
    options.configured.mockReturnValue(false);
    await slider.prepare();
    expect(options.start).not.toHaveBeenCalled();
    expect(slider.state.value).toBe("error");
    expect(slider.stateText.value).toBe("验证暂不可用");
    expect(slider.errorMessage.value).toContain("配置 VITE_API_BASE_URL 后重新编译");
    expect(slider.busy.value).toBe(false);
  });

  it("准备请求和重试均去重，失败保留原因且不自动循环请求", async () => {
    const { slider, options } = setup();
    const first = deferred<SliderStartResult>();
    options.start.mockReturnValueOnce(first.promise);
    const preparing = slider.prepare();
    await slider.prepare();
    expect(options.start).toHaveBeenCalledTimes(1);
    expect(slider.busy.value).toBe(true);
    first.reject(new Error("request:fail timeout"));
    await preparing;
    expect(slider.errorMessage.value).toContain("请求超时");
    vi.advanceTimersByTime(60_000);
    expect(options.start).toHaveBeenCalledTimes(1);
    const retry = deferred<SliderStartResult>();
    options.start.mockReturnValueOnce(retry.promise);
    const retrying = slider.prepare();
    await slider.prepare();
    expect(options.start).toHaveBeenCalledTimes(2);
    retry.resolve({ slider_id: "session-retry", expire_seconds: 300 });
    await retrying;
    expect(slider.state.value).toBe("ready");
    expect(slider.errorMessage.value).toBe("");
  });

  it("只能由真实 finish 成功签发凭证，重复 touchend 不重复提交", async () => {
    const { slider, options } = setup();
    await slider.prepare();
    const result = deferred<SliderFinishResult>();
    options.finish.mockReturnValueOnce(result.promise);
    const verifying = gesture(slider, 640);
    await slider.onTouchEnd({ changedTouches: [{ clientX: 1000 }] });
    expect(options.finish).toHaveBeenCalledTimes(1);
    expect(options.finish).toHaveBeenLastCalledWith({ slider_id: "session-current", duration_ms: 640 });
    expect(options.verified).not.toHaveBeenCalled();
    expect(slider.state.value).toBe("verifying");
    expect(slider.progressWidth.value).not.toBe("100%");
    result.resolve({ pass_token: "verified-by-server", expire_seconds: 180 });
    await verifying;
    expect(options.verified).toHaveBeenCalledTimes(1);
    expect(options.verified).toHaveBeenLastCalledWith("verified-by-server");
    expect(slider.state.value).toBe("verified");
    expect(slider.progressWidth.value).toBe("100%");
  });

  it("未拖到末端或取消手势都不调用后端完成验证", async () => {
    const { slider, options } = setup();
    await slider.prepare();
    slider.onTouchStart({ touches: [{ clientX: 10 }] });
    slider.onTouchMove({ touches: [{ clientX: 60 }] });
    await slider.onTouchEnd({ changedTouches: [{ clientX: 60 }] });
    expect(slider.state.value).toBe("ready");
    expect(slider.offset.value).toBe(0);
    expect(slider.progressWidth.value).toBe("0px");
    slider.onTouchStart({ touches: [{ clientX: 10 }] });
    slider.onTouchMove({ touches: [{ clientX: 1000 }] });
    slider.onTouchCancel();
    expect(slider.offset.value).toBe(0);
    expect(options.finish).not.toHaveBeenCalled();
  });

  it("后端拒绝滑动时不绕过，也不立即重新准备掩盖失败原因", async () => {
    const { slider, options } = setup();
    options.finish.mockRejectedValueOnce(new Error("滑动验证未通过，请重试"));
    await slider.prepare();
    await gesture(slider);
    expect(options.start).toHaveBeenCalledTimes(1);
    expect(options.verified).not.toHaveBeenCalled();
    expect(slider.state.value).toBe("error");
    expect(slider.errorMessage.value).toContain("平稳拖动");
    await slider.prepare();
    await gesture(slider);
    expect(options.verified).toHaveBeenCalledTimes(1);
  });

  it("禁用时不能准备或提交拖动", async () => {
    const { slider, options } = setup();
    options.disabled.mockReturnValue(true);
    await slider.prepare();
    expect(options.start).not.toHaveBeenCalled();
    options.disabled.mockReturnValue(false);
    await slider.prepare();
    options.disabled.mockReturnValue(true);
    await gesture(slider);
    expect(options.finish).not.toHaveBeenCalled();
  });

  it.each(["resolve", "reject"] as const)("重置后旧 start 的 %s 不能覆盖新会话", async (ending) => {
    const { slider, options } = setup();
    const old = deferred<SliderStartResult>();
    options.start.mockReturnValueOnce(old.promise).mockResolvedValueOnce({ slider_id: "new-session", expire_seconds: 300 });
    const preparing = slider.prepare();
    await slider.reset();
    if (ending === "resolve") old.resolve({ slider_id: "old-session", expire_seconds: 1 });
    else old.reject(new Error("旧请求失败"));
    await preparing;
    expect(slider.state.value).toBe("ready");
    await gesture(slider);
    expect(options.finish).toHaveBeenLastCalledWith({ slider_id: "new-session", duration_ms: 500 });
  });

  it.each(["resolve", "reject"] as const)("重试后旧 finish 的 %s 不回写成功或失败状态", async (ending) => {
    const { slider, options } = setup();
    await slider.prepare();
    const old = deferred<SliderFinishResult>();
    options.finish.mockReturnValueOnce(old.promise);
    const verifying = gesture(slider);
    await slider.reset();
    if (ending === "resolve") old.resolve({ pass_token: "stale-token", expire_seconds: 180 });
    else old.reject(new Error("旧验证失败"));
    await verifying;
    expect(slider.state.value).toBe("ready");
    expect(slider.errorMessage.value).toBe("");
    expect(options.verified).not.toHaveBeenCalled();
  });

  it.each(["start", "finish"] as const)("卸载后 %s 的成功响应和定时器都不回写或发事件", async (phase) => {
    const { slider, options } = setup();
    const late = deferred<SliderStartResult & SliderFinishResult>();
    let pending: Promise<void>;
    if (phase === "start") {
      options.start.mockReturnValueOnce(late.promise);
      pending = slider.prepare();
    } else {
      await slider.prepare();
      options.finish.mockReturnValueOnce(late.promise);
      pending = gesture(slider);
    }
    slider.dispose();
    const state = slider.state.value;
    const invalidations = options.invalidated.mock.calls.length;
    late.resolve({ slider_id: "late-session", pass_token: "late-token", expire_seconds: 1 });
    await pending;
    vi.advanceTimersByTime(600_000);
    expect(slider.state.value).toBe(state);
    expect(options.verified).not.toHaveBeenCalled();
    expect(options.invalidated).toHaveBeenCalledTimes(invalidations);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("会话到期时中止手势并清除登录可用状态", async () => {
    const { slider, options } = setup();
    options.start.mockResolvedValueOnce({ slider_id: "short-session", expire_seconds: 1 });
    await slider.prepare();
    slider.onTouchStart({ touches: [{ clientX: 0 }] });
    vi.advanceTimersByTime(1000);
    await slider.onTouchEnd({ changedTouches: [{ clientX: 1000 }] });
    expect(slider.state.value).toBe("error");
    expect(slider.errorMessage.value).toContain("会话已过期");
    expect(options.finish).not.toHaveBeenCalled();
    expect(options.invalidated).toHaveBeenCalledTimes(2);
  });

  it("已通过凭证按后端有效期失效，恢复前台也按真实时钟复查", async () => {
    const { slider, options } = setup();
    options.finish.mockResolvedValueOnce({ pass_token: "short-token", expire_seconds: 1 });
    await slider.prepare();
    await gesture(slider);
    expect(slider.state.value).toBe("verified");
    vi.setSystemTime(Date.now() + 1001);
    expect(slider.checkExpiry()).toBe(true);
    expect(slider.errorMessage.value).toContain("凭证已过期");
    expect(options.invalidated).toHaveBeenCalledTimes(2);
    expect(slider.checkExpiry()).toBe(false);
  });

  it("通过凭证计时结束自动失效，不再继续接受旧 token", async () => {
    const { slider, options } = setup();
    options.finish.mockResolvedValueOnce({ pass_token: "short-token", expire_seconds: 1 });
    await slider.prepare();
    await gesture(slider);
    vi.advanceTimersByTime(1000);
    expect(slider.state.value).toBe("error");
    expect(slider.errorMessage.value).toContain("凭证已过期");
    expect(options.invalidated).toHaveBeenCalledTimes(2);
  });

  it("finish 返回前原会话已过期，不接受迟到通过凭证", async () => {
    const { slider, options } = setup();
    options.start.mockResolvedValueOnce({ slider_id: "short-session", expire_seconds: 1 });
    const late = deferred<SliderFinishResult>();
    options.finish.mockReturnValueOnce(late.promise);
    await slider.prepare();
    const pending = gesture(slider);
    vi.advanceTimersByTime(500);
    late.resolve({ pass_token: "late-token", expire_seconds: 180 });
    await pending;
    expect(slider.state.value).toBe("error");
    expect(options.verified).not.toHaveBeenCalled();
  });

  it("慢请求不能延长服务端会话有效期", async () => {
    const { slider, options } = setup();
    const late = deferred<SliderStartResult>();
    options.start.mockReturnValueOnce(late.promise);
    const pending = slider.prepare();
    vi.advanceTimersByTime(2000);
    late.resolve({ slider_id: "expired-before-response", expire_seconds: 1 });
    await pending;
    expect(slider.state.value).toBe("error");
    expect(slider.errorMessage.value).toContain("已过期");
  });

  it.each([0, -1, Number.NaN, 1.5])("异常有效期 %s 不允许通过", async (ttl) => {
    const { slider, options } = setup();
    options.start.mockResolvedValueOnce({ slider_id: "bad-ttl", expire_seconds: ttl });
    await slider.prepare();
    expect(slider.state.value).toBe("error");
    expect(options.verified).not.toHaveBeenCalled();
  });

  it("使用实际宽度限制位移，测量失败保留默认，拖动中变宽安全重置手势", async () => {
    const { slider } = setup();
    slider.setTrackWidth(null);
    expect(slider.maxTravel.value).toBe(226);
    slider.setTrackWidth(240);
    expect(slider.maxTravel.value).toBe(186);
    await slider.prepare();
    slider.onTouchStart({ touches: [{ clientX: 0 }] });
    slider.onTouchMove({ touches: [{ clientX: 1000 }] });
    expect(slider.offset.value).toBe(186);
    slider.setTrackWidth(260);
    expect(slider.state.value).toBe("ready");
    expect(slider.offset.value).toBe(0);
    expect(slider.maxTravel.value).toBe(206);
  });
});

describe("安全验证反馈", () => {
  it.each([
    ["未配置 VITE_API_BASE_URL", "重新编译"],
    ["request:fail url not in domain list", "request 合法域名"],
    ["request:fail ssl hand shake error", "证书和 TLS"],
    ["request:fail TLS handshake failed", "证书和 TLS"],
    ["request:fail timeout https://private.invalid?token=secret", "请求超时"],
    ["request:fail net::ERR_CONNECTION_REFUSED", "请检查网络"],
    ["滑动验证无效或已过期", "已过期"],
    ["滑动验证未通过，请重试", "平稳拖动"],
  ])("%s 转换为明确中文原因", (message, expected) => {
    expect(sliderFailureMessage(new Error(message))).toContain(expected);
  });

  it("读取包装错误原因用于分类，但不泄露 URL、token、Trace 或原始错误", () => {
    const cause = { errMsg: "request:fail ssl hand shake error https://user:secret@private.invalid?token=secret" };
    const error = new Error("网络请求失败（Trace ID: private-trace）", { cause });
    const original = Object.getOwnPropertyDescriptors(error);
    const message = sliderFailureMessage(error);
    expect(message).toContain("证书和 TLS");
    expect(message).not.toMatch(/secret|private|Trace|user:/);
    expect(Object.getOwnPropertyDescriptors(error)).toEqual(original);
  });

  it.each([null, undefined, {}, new Error("SQLSTATE secret-password"), "private-token"])("未知错误只显示安全通用原因", (error) => {
    expect(sliderFailureMessage(error)).toBe("安全验证服务暂不可用，请点击重试；若持续失败，请联系维护人员检查服务。");
  });
});

describe("组件内轨道测量", () => {
  function queryFixture(result: unknown, respond = true) {
    let callback: (value: unknown) => void = () => undefined;
    const query = {
      in: vi.fn(), select: vi.fn(), boundingClientRect: vi.fn(),
      exec: vi.fn(() => { if (respond) callback(result); }),
    };
    query.in.mockReturnValue(query);
    query.select.mockReturnValue(query);
    query.boundingClientRect.mockImplementation((receive: (value: unknown) => void) => { callback = receive; return query; });
    return { query, create: () => query as unknown as UniNamespace.SelectorQuery, respond: () => callback(result) };
  }

  it("查询限定当前组件，返回真实宽度而不是屏幕估算", async () => {
    const component = {};
    const fixture = queryFixture({ width: 233.5 });
    expect(await measureSliderTrack(component, fixture.create)).toBe(233.5);
    expect(fixture.query.in).toHaveBeenCalledWith(component);
    expect(fixture.query.select).toHaveBeenCalledWith(".auth-slider__track");
    expect(fixture.query.exec).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([null, {}, [], { width: 0 }, { width: 48 }, { width: Number.NaN }])("无有效测量 %s 安全回退", async (rect) => {
    expect(await measureSliderTrack({}, queryFixture(rect).create)).toBeNull();
  });

  it("查询抛错或没有组件时安全回退", async () => {
    expect(await measureSliderTrack({}, () => { throw new Error("unavailable"); })).toBeNull();
    const factory = vi.fn();
    expect(await measureSliderTrack(null, factory)).toBeNull();
    expect(factory).not.toHaveBeenCalled();
  });

  it("无回调时超时回退，迟到的回调不能改变结果", async () => {
    const fixture = queryFixture({ width: 500 }, false);
    const measuring = measureSliderTrack({}, fixture.create);
    vi.advanceTimersByTime(500);
    expect(await measuring).toBeNull();
    fixture.respond();
    expect(await measuring).toBeNull();
  });
});
