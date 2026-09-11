import { afterEach, describe, expect, it, vi } from "vitest";
import { effectScope, getCurrentInstance, nextTick, reactive, shallowRef, type Ref } from "vue";
import { useLoginInputFocus } from "@/composables/useLoginInputFocus";
import { setupSfc } from "./helpers/setup-sfc";

vi.mock("vue", async (importOriginal) => {
  const actual = await importOriginal<typeof import("vue")>();
  return { ...actual, getCurrentInstance: vi.fn(actual.getCurrentInstance) };
});

const scopes: ReturnType<typeof effectScope>[] = [];
afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop());
  vi.useRealTimers();
  vi.restoreAllMocks();
});
function controls() {
  const enabled = shallowRef(true);
  const scope = effectScope(); scopes.push(scope);
  const control = scope.run(() => useLoginInputFocus(() => enabled.value))!;
  return { ...control, enabled, scope };
}

describe("登录输入框焦点交接", () => {
  it("正常切换在同一次更新中下发新目标，并等待小程序视图层确认", async () => {
    let finishViewUpdate = () => {};
    const page = { $nextTick: vi.fn(() => new Promise<void>((resolve) => { finishViewUpdate = resolve; })) };
    vi.mocked(getCurrentInstance).mockReturnValueOnce({ proxy: page } as unknown as ReturnType<typeof getCurrentInstance>);
    const c = controls(); c.onFieldFocus("username");
    const pending = c.requestFocus("password");
    await nextTick();
    expect(c.focusTarget.value).toBe("password");
    expect(page.$nextTick).toHaveBeenCalledOnce();
    finishViewUpdate(); await pending;
    expect(c.focusTarget.value).toBe("password");
  });

  it("键盘下一项原子切换目标，旧框迟到的失焦不能撤销密码聚焦", async () => {
    vi.useFakeTimers();
    const c = controls();
    c.onFieldFocus("username");
    const transfer = c.requestFocus("password");
    expect(c.focusTarget.value).toBe("password");
    await transfer;
    c.onFieldBlur("username");
    expect(c.focusTarget.value).toBe("password");
    c.onFieldFocus("password");
    await vi.advanceTimersByTimeAsync(80);
    c.onFieldBlur("username");
    expect(c.focusTarget.value).toBe("password");
    c.onFieldBlur("password");
    expect(c.focusTarget.value).toBeNull();
  });

  it.each(["username", "password"] as const)("首次直接触摸 %s 时通过视图层下发聚焦命令", async (field) => {
    const page = { $nextTick: vi.fn(() => Promise.resolve()) };
    vi.mocked(getCurrentInstance).mockReturnValueOnce({ proxy: page } as unknown as ReturnType<typeof getCurrentInstance>);
    const c = controls();
    const transfer = c.onFieldTouch(field);
    expect(c.focusTarget.value).toBe(field);
    await transfer;
    expect(page.$nextTick).toHaveBeenCalledOnce();
    expect(c.focusTarget.value).toBe(field);
    c.onFieldFocus(field);
    expect(c.focusTarget.value).toBe(field);
  });

  it("点击当前已聚焦的输入框不重置光标，也不自动再弹键盘", async () => {
    vi.useFakeTimers();
    const page = { $nextTick: vi.fn(() => Promise.resolve()) };
    vi.mocked(getCurrentInstance).mockReturnValueOnce({ proxy: page } as unknown as ReturnType<typeof getCurrentInstance>);
    const c = controls(); await c.onFieldTouch("password"); c.onFieldFocus("password");
    await vi.advanceTimersByTimeAsync(80);
    await c.onFieldTouch("password");
    expect(c.focusTarget.value).toBe("password");
    expect(page.$nextTick).toHaveBeenCalledOnce();
    c.onFieldBlur("password"); await nextTick();
    expect(c.focusTarget.value).toBeNull();
  });

  it("直接从账号点到密码，迟到的账号 blur 不会清除密码焦点", async () => {
    vi.useFakeTimers();
    const c = controls();
    await c.onFieldTouch("username"); c.onFieldFocus("username");
    await vi.advanceTimersByTimeAsync(80);
    const transfer = c.onFieldTouch("password");
    expect(c.focusTarget.value).toBe("password");
    await transfer;
    c.onFieldBlur("username");
    expect(c.focusTarget.value).toBe("password");
    c.onFieldFocus("password");
    c.onFieldBlur("username");
    expect(c.focusTarget.value).toBe("password");
  });

  it("Android 目标框 focus 后立即 blur 时自动补发一次聚焦", async () => {
    vi.useFakeTimers();
    const c = controls(); c.onFieldFocus("username");
    await c.onFieldTouch("password");
    c.onFieldBlur("username");
    c.onFieldFocus("password");
    c.onFieldBlur("password");
    expect(c.focusTarget.value).toBeNull();
    await nextTick(); await nextTick();
    expect(c.focusTarget.value).toBe("password");
    c.onFieldFocus("password");
    await vi.advanceTimersByTimeAsync(80);
    c.onFieldBlur("password");
    expect(c.focusTarget.value).toBeNull();
  });

  it("等待程序交接时直接触摸其他输入框，以最后一次触摸为准", async () => {
    const c = controls();
    const pending = c.requestFocus("password");
    const replacement = c.onFieldTouch("username");
    await Promise.all([pending, replacement]);
    expect(c.focusTarget.value).toBe("username");
  });

  it("原生 focus 事件只记录当前输入框，不反向创建受控聚焦命令", () => {
    const c = controls();
    c.onFieldFocus("username");
    expect(c.focusTarget.value).toBeNull();
  });

  it("快速改点其他输入框时只采用最后目标", async () => {
    const c = controls();
    const first = c.requestFocus("password");
    const second = c.requestFocus("username");
    await Promise.all([first, second]);
    c.onFieldFocus("password");
    expect(c.focusTarget.value).toBe("username");
  });

  it.each(["outside", "disabled", "unmount"] as const)("%s 后取消待处理聚焦，不在下一次渲染抢回键盘", async (reason) => {
    const c = controls(); const pending = c.requestFocus("password");
    if (reason === "outside") c.releaseFocus();
    else if (reason === "disabled") c.enabled.value = false;
    else c.scope.stop();
    await pending;
    expect(c.focusTarget.value).toBeNull();
  });
});

function loginPage(height = 800) {
  const lifecycle = { load: async () => {}, hide: () => {}, show: () => {} };
  const auth = reactive({ loading: false, isAuthenticated: false, restore: vi.fn().mockResolvedValue(undefined), signIn: vi.fn() });
  const uni = { getWindowInfo: vi.fn(() => ({ windowHeight: height })), showToast: vi.fn(), navigateTo: vi.fn(), switchTab: vi.fn() };
  vi.stubGlobal("uni", uni);
  const state = setupSfc("pages/login/index.vue", {}, {
    "@dcloudio/uni-app": { onLoad: (fn: typeof lifecycle.load) => { lifecycle.load = fn; }, onHide: (fn: typeof lifecycle.hide) => { lifecycle.hide = fn; }, onShow: (fn: typeof lifecycle.show) => { lifecycle.show = fn; } },
    "@/stores/auth": { useAuthStore: () => auth }, "@/components/auth/AuthSlider.vue": {},
    "@/composables/useLoginInputFocus": { useLoginInputFocus },
  }) as unknown as { username: Ref<string>; password: Ref<string>; showPassword: Ref<boolean>; compactLayout: Ref<boolean>; focusTarget: Ref<string | null>; agreed: Ref<boolean>; passToken: Ref<string>; togglePassword: () => void; requestFocus: (field: "username" | "password") => Promise<void>; onFieldFocus: (field: "username" | "password") => void; submit: () => Promise<void> };
  return { state, auth, uni, lifecycle };
}

describe("登录页兼容处理", () => {
  it("账号下一项转入密码框，显隐切换保留账号密码且不重新创建表单", async () => {
    const { state, lifecycle } = loginPage(); await lifecycle.load();
    state.username.value = "test-user"; state.password.value = "Fixture123";
    await state.requestFocus("password"); state.onFieldFocus("password");
    state.togglePassword(); await nextTick();
    expect(state.focusTarget.value).toBe("password");
    expect(state.showPassword.value).toBe(true);
    expect(state.username.value).toBe("test-user"); expect(state.password.value).toBe("Fixture123");
  });

  it("离开页面后迟到的 focus 无效，返回页面不自动抢焦点", async () => {
    const { state, lifecycle } = loginPage(); await lifecycle.load();
    const pending = state.requestFocus("password"); lifecycle.hide(); await pending;
    state.onFieldFocus("password"); expect(state.focusTarget.value).toBeNull();
    lifecycle.show(); await nextTick(); expect(state.focusTarget.value).toBeNull();
  });

  it.each([500, 800])("初始窗口 %d 仅计算一次小屏布局，键盘改变高度不重排表单", async (height) => {
    const { state, uni, lifecycle } = loginPage(height); await lifecycle.load();
    expect(state.compactLayout.value).toBe(height <= 600);
    uni.getWindowInfo.mockReturnValue({ windowHeight: 400 });
    state.onFieldFocus("username"); await state.requestFocus("password");
    expect(state.compactLayout.value).toBe(height <= 600);
    expect(uni.getWindowInfo).toHaveBeenCalledOnce();
  });

  it("焦点切换不会绕过勾选协议的登录限制", async () => {
    const { state, auth, lifecycle } = loginPage(); await lifecycle.load();
    state.username.value = "test-user"; state.password.value = "Fixture123"; state.passToken.value = "test-slider-token";
    await state.requestFocus("password"); await state.submit();
    expect(auth.signIn).not.toHaveBeenCalled();
  });
});
