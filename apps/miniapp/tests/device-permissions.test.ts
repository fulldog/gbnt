import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { showDeviceFailure } from "@/utils/device-permissions";

const declarationError = {
  errMsg: "chooseLocation:fail api scope is not declared in the privacy agreement",
  errno: 112,
};

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal("uni", {
    getAccountInfoSync: vi.fn().mockReturnValue({
      miniProgram: { appId: "wx-test", envVersion: "release", version: "1.2.3" },
      plugin: { appId: "plugin-must-not-be-logged" },
    }),
    getAppBaseInfo: vi.fn().mockReturnValue({
      hostVersion: "8.0.77", version: "8.0.77", SDKVersion: "3.17.3",
      language: "zh_CN", host: { appId: "host-must-not-be-logged" },
    }),
    authorize: vi.fn(),
    getPrivacySetting: vi.fn(),
    requirePrivacyAuthorize: vi.fn(),
    showToast: vi.fn(),
    showModal: vi.fn(),
    openSetting: vi.fn(),
  });
});

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("设备声明错误的运行版本诊断", () => {
  it("保留原始错误，只额外记录应用和基础库版本，不发起授权或隐私检查", () => {
    showDeviceFailure(declarationError, "选择现场位置");

    expect(console.warn).toHaveBeenCalledWith("[miniapp:device]", JSON.stringify({
      action: "选择现场位置", ...declarationError,
    }));
    expect(console.warn).toHaveBeenCalledWith("[miniapp:device-runtime]", JSON.stringify({
      appId: "wx-test", envVersion: "release", miniProgramVersion: "1.2.3",
      wechatVersion: "8.0.77", SDKVersion: "3.17.3",
    }));
    expect(console.warn).toHaveBeenCalledTimes(2);
    expect(uni.showToast).toHaveBeenCalledWith({ title: "选择现场位置失败，请重试", icon: "none", duration: 3000 });
    expect(uni.authorize).not.toHaveBeenCalled();
    expect((uni as unknown as { getPrivacySetting: unknown }).getPrivacySetting).not.toHaveBeenCalled();
    expect((uni as unknown as { requirePrivacyAuthorize: unknown }).requirePrivacyAuthorize).not.toHaveBeenCalled();
    expect(uni.showModal).not.toHaveBeenCalled();
    expect(uni.openSetting).not.toHaveBeenCalled();
  });

  it("开发版或体验版没有线上版本号时明确记录为空", () => {
    vi.mocked(uni.getAccountInfoSync).mockReturnValue({
      miniProgram: { appId: "wx-test", envVersion: "develop", version: "" },
      plugin: { appId: "", version: "" },
    });

    showDeviceFailure(declarationError, "选择现场位置");

    const runtime = JSON.parse(vi.mocked(console.warn).mock.calls[1]![1] as string);
    expect(runtime.envVersion).toBe("develop");
    expect(runtime.miniProgramVersion).toBeNull();
  });

  it.each(["getAccountInfoSync", "getAppBaseInfo"] as const)("%s 读取失败不阻断提示，也不丢弃另一项诊断信息", (method) => {
    vi.mocked(uni[method]).mockImplementation(() => { throw new Error("unsupported"); });

    expect(() => showDeviceFailure(declarationError, "选择现场位置")).not.toThrow();

    const runtime = JSON.parse(vi.mocked(console.warn).mock.calls[1]![1] as string);
    expect(runtime.appId).toBe(method === "getAccountInfoSync" ? null : "wx-test");
    expect(runtime.SDKVersion).toBe(method === "getAppBaseInfo" ? null : "3.17.3");
    expect(uni.showToast).toHaveBeenCalledOnce();
  });

  it("取消和普通网络失败不读取运行信息", () => {
    showDeviceFailure({ errMsg: "chooseLocation:fail cancel" }, "选择现场位置");
    expect(console.warn).not.toHaveBeenCalled();
    expect(uni.showToast).not.toHaveBeenCalled();

    showDeviceFailure({ errMsg: "chooseLocation:fail network error" }, "选择现场位置");
    expect(console.warn).toHaveBeenCalledOnce();
    expect(uni.getAccountInfoSync).not.toHaveBeenCalled();
    expect(uni.getAppBaseInfo).not.toHaveBeenCalled();
    expect(uni.showToast).toHaveBeenCalledOnce();
  });
});
