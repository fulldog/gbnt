import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope } from "vue";
import { useInspectionAccess } from "@/composables/report/useInspectionAccess";

let settings = { cameraAuthorized: "authorized", albumAuthorized: "authorized", locationAuthorized: "authorized" };
const scopes: ReturnType<typeof effectScope>[] = [];
function setup() { const scope = effectScope(); scopes.push(scope); return scope.run(useInspectionAccess)!; }
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
  it("隐私同意前不调用设备权限，拒绝后保留不可用状态", async () => {
    let onPrivacy!: (resolve: (value: { event: string }) => void) => void;
    vi.stubGlobal("wx", { onNeedPrivacyAuthorization: (callback: typeof onPrivacy) => { onPrivacy = callback; },
      offNeedPrivacyAuthorization: vi.fn(), requirePrivacyAuthorize: ({ success, fail }: { success(): void; fail(error: object): void }) =>
        onPrivacy((result) => result.event === "agree" ? success() : fail({ errMsg: "privacy deny" })) });
    const access = setup(); const pending = access.request();
    expect(access.phase.value).toBe("privacy"); expect(uni.authorize).not.toHaveBeenCalled();
    access.rejectPrivacy(); await pending; expect(access.ready.value).toBe(false);
    const retry = access.request(); access.acceptPrivacy(); await retry; expect(access.ready.value).toBe(true);
  });
  it("重复进入的检查合并，卸载后迟到结果不放行", async () => {
    let finish!: (point: { latitude: number; longitude: number }) => void;
    vi.mocked(uni.getLocation).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }) as never);
    const access = setup(); const first = access.request(); expect(access.request()).toBe(first);
    await vi.waitFor(() => expect(finish).toBeTypeOf("function")); scopes[0]!.stop(); finish({ latitude: 36, longitude: 116 }); await first;
    expect(access.ready.value).toBe(false);
  });
});
