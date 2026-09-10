import { afterEach, describe, expect, it, vi } from "vitest";
import { effectScope, getCurrentInstance, nextTick, reactive, shallowRef, type Ref } from "vue";
import { useLoginInputFocus } from "@/composables/useLoginInputFocus";
import { setupSfc } from "./helpers/setup-sfc";

vi.mock("vue", async (importOriginal) => {
  const actual = await importOriginal<typeof import("vue")>();
  return { ...actual, getCurrentInstance: vi.fn(actual.getCurrentInstance) };
});

const scopes: ReturnType<typeof effectScope>[] = [];
afterEach(() => { scopes.splice(0).forEach((scope) => scope.stop()); vi.restoreAllMocks(); });
function controls() {
  const enabled = shallowRef(true);
  const scope = effectScope(); scopes.push(scope);
  const control = scope.run(() => useLoginInputFocus(() => enabled.value))!;
  return { ...control, enabled, scope };
}

describe("登录输入框焦点交接", () => {
  it("等待小程序视图层确认旧框释放，不能仅等 Vue 逻辑层刷新就聚焦新框", async () => {
    let finishViewUpdate = () => {};
    const page = { $nextTick: vi.fn(() => new Promise<void>((resolve) => { finishViewUpdate = resolve; })) };
    vi.mocked(getCurrentInstance).mockReturnValueOnce({ proxy: page } as unknown as ReturnType<typeof getCurrentInstance>);
    const c = controls(); c.onFieldFocus("username");
    const pending = c.requestFocus("password");
    await nextTick();
    expect(c.focusTarget.value).toBeNull();
    expect(page.$nextTick).toHaveBeenCalledOnce();
    finishViewUpdate(); await pending;
    expect(c.focusTarget.value).toBe("password");
  });

  it("账号切密码时先释放旧框，旧框迟到的失焦不能撤销密码聚焦", async () => {
    const c = controls();
    c.onFieldFocus("username");
    c.onFieldTouch("password");
    const transfer = c.onFieldTap("password");
    expect(c.focusTarget.value).toBeNull();
    await transfer;
    c.onFieldBlur("username");
    expect(c.focusTarget.value).toBe("password");
    c.onFieldFocus("password");
    c.onFieldBlur("username");
    expect(c.focusTarget.value).toBe("password");
    c.onFieldBlur("password");
    expect(c.focusTarget.value).toBeNull();
  });

  it("默认聚焦先于 tap 到达时仍完成交接，主动释放产生的 blur 不会取消新目标", async () => {
    const c = controls(); c.onFieldFocus("username"); c.onFieldTouch("password");
    c.onFieldFocus("password");
    const transfer = c.onFieldTap("password");
    await transfer;
    c.onFieldBlur("password");
    expect(c.focusTarget.value).toBe("password");
    c.onFieldFocus("password");
    c.onFieldBlur("password");
    expect(c.focusTarget.value).toBeNull();
  });

  it("点击当前已聚焦的输入框不重置光标，也不自动再弹键盘", async () => {
    const c = controls(); c.onFieldFocus("password"); c.onFieldTouch("password");
    const pending = c.onFieldTap("password");
    expect(c.focusTarget.value).toBe("password");
    await pending;
    c.onFieldBlur("password"); await nextTick();
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
