import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope } from "vue";
import { useInspectionAccess, type InspectionAccessOptions } from "@/composables/report/useInspectionAccess";

let settings = { cameraAuthorized: "authorized", albumAuthorized: "authorized", locationAuthorized: "authorized" };
const scopes: ReturnType<typeof effectScope>[] = [];
function setup(options: InspectionAccessOptions = {}) {
  const scope = effectScope();
  scopes.push(scope);
  return scope.run(() => useInspectionAccess(options))!;
}
beforeEach(() => {
  settings = { cameraAuthorized: "authorized", albumAuthorized: "authorized", locationAuthorized: "authorized" };
  vi.stubGlobal("uni", { authorize: vi.fn().mockResolvedValue({}), getLocation: vi.fn().mockResolvedValue({ latitude: 36, longitude: 116 }),
    getAppAuthorizeSetting: () => settings, openSetting: vi.fn().mockResolvedValue({}), openAppAuthorizeSetting: vi.fn().mockResolvedValue({}) });
});
afterEach(() => { scopes.splice(0).forEach((scope) => scope.stop()); vi.unstubAllGlobals(); });
describe("巡查权限入口", () => {
  it("首次进入按顺序获取定位和相机授权，通过后才可使用", async () => {
    const access = setup(); const pending = access.request();
    expect(access.ready.value).toBe(false); await pending;
    expect(uni.authorize).toHaveBeenNthCalledWith(1, { scope: "scope.userLocation" });
    expect(uni.authorize).toHaveBeenNthCalledWith(2, { scope: "scope.camera" });
    expect(access.ready.value).toBe(true);
  });
  it.each(["location", "camera"])("拒绝 %s 权限阻止使用，重试授权后恢复", async (kind) => {
    if (kind === "location") vi.mocked(uni.authorize).mockRejectedValueOnce({ errMsg: "auth deny" });
    else vi.mocked(uni.authorize).mockResolvedValueOnce({}).mockRejectedValueOnce({ errMsg: "auth deny" });
    const access = setup(); await access.request();
    expect(access.phase.value).toBe("denied"); expect(access.ready.value).toBe(false);
    await access.openSettings(); expect(access.ready.value).toBe(true);
  });
  it("系统相册权限拒绝后打开手机设置，不误用保存相册权限", async () => {
    settings.albumAuthorized = "denied";
    const access = setup(); await access.request(); expect(access.ready.value).toBe(false);
    settings.albumAuthorized = "authorized"; await access.openSettings();
    expect(uni.openAppAuthorizeSetting).toHaveBeenCalled(); expect(access.ready.value).toBe(true);
    expect(uni.authorize).not.toHaveBeenCalledWith({ scope: "scope.writePhotosAlbum" });
  });
  it("打开微信或手机设置期间通知提交页保留当前会话", async () => {
    let closeSetting!: () => void;
    vi.mocked(uni.openSetting).mockImplementationOnce(() => new Promise((resolve) => {
      closeSetting = () => resolve({});
    }) as never);
    const visibility = vi.fn();
    const access = setup({ onNativeOverlayVisibilityChange: visibility });

    const pending = access.openSettings();
    expect(visibility.mock.calls).toEqual([[true]]);
    closeSetting();
    await pending;
    expect(visibility.mock.calls).toEqual([[true], [false]]);
  });
  it("进入、返回巡查页及从设置返回时均不主动检查或申请隐私授权", async () => {
    const requirePrivacyAuthorize = vi.fn(() => { throw new Error("不应主动申请隐私授权"); });
    const getPrivacySetting = vi.fn(() => { throw new Error("不应主动检查隐私授权"); });
    vi.stubGlobal("wx", { requirePrivacyAuthorize, getPrivacySetting });
    const access = setup();

    await access.request();
    expect(access.ready.value).toBe(true);
    await access.request();
    await access.openSettings();

    expect(access.ready.value).toBe(true);
    expect(requirePrivacyAuthorize).not.toHaveBeenCalled();
    expect(getPrivacySetting).not.toHaveBeenCalled();
    expect(uni.authorize).toHaveBeenCalledWith({ scope: "scope.userLocation" });
    expect(uni.authorize).toHaveBeenCalledWith({ scope: "scope.camera" });
    expect(uni.getLocation).toHaveBeenCalled();
  });
  it("重复进入的检查合并，卸载后迟到结果不放行", async () => {
    let finish!: (point: { latitude: number; longitude: number }) => void;
    vi.mocked(uni.getLocation).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }) as never);
    const access = setup(); const first = access.request(); expect(access.request()).toBe(first);
    await vi.waitFor(() => expect(finish).toBeTypeOf("function")); scopes[0]!.stop(); finish({ latitude: 36, longitude: 116 }); await first;
    expect(access.ready.value).toBe(false);
  });
  it("定位接口返回声明错误时仅显示普通失败提示", async () => {
    vi.mocked(uni.getLocation).mockRejectedValueOnce({ errMsg: "getLocation:fail api scope is not declared in the privacy agreement" });
    const access = setup();

    await access.request();

    expect(access.ready.value).toBe(false);
    expect(access.message.value).toBe("继续巡查失败，请重试");
  });
});
