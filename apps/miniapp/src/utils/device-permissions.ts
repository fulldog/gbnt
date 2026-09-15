import { beginNativeOverlay, type NativeOverlayVisibilityChange } from "@/utils/native-overlay";

/** 声明错误发生后记录实际运行版本，区分手机上的开发版、体验版和正式版。 */
function logDeviceRuntime(): void {
  const runtime: Record<string, string | null> = {
    appId: null,
    envVersion: null,
    miniProgramVersion: null,
    wechatVersion: null,
    SDKVersion: null,
  };
  try {
    const account = uni.getAccountInfoSync().miniProgram;
    runtime.appId = account.appId ?? null;
    runtime.envVersion = account.envVersion ?? null;
    runtime.miniProgramVersion = account.version || null;
  } catch {
    // 诊断接口不可用时不影响原有失败提示。
  }
  try {
    const app = uni.getAppBaseInfo();
    runtime.wechatVersion = app.hostVersion || app.version || null;
    runtime.SDKVersion = app.SDKVersion ?? null;
  } catch {
    // 低版本客户端可能不支持读取基础库信息。
  }
  console.warn("[miniapp:device-runtime]", JSON.stringify(runtime));
}

/** 将设备接口失败转为可操作的中文说明；用户取消不视为错误。 */
export function deviceFailureMessage(error: { errMsg?: string }, action: string): string {
  const message = error.errMsg || "";
  if (/cancel/i.test(message)) return "";
  if (/api scope is not declared in the privacy agreement|requiredPrivateInfos/i.test(message)) {
    return `${action}失败，请重试`;
  }
  if (/privacy/i.test(message)) return `请先同意小程序隐私保护指引，再${action}`;
  if (/auth|permission|deny|denied/i.test(message)) return `未获得所需权限，请在小程序设置中授权后重新${action}`;
  return `${action}失败，请检查设备或网络后重试`;
}

/** 只有用户明确点击确认后才打开设置，不自动授予定位或相机权限。 */
export function showDeviceFailure(
  error: { errMsg?: string; errno?: number; errCode?: number },
  action: string,
  onNativeOverlayVisibilityChange?: NativeOverlayVisibilityChange,
): void {
  const message = deviceFailureMessage(error, action);
  if (!message) return;
  // 保留接口原始错误供真机排查，仅记录错误字段，不输出坐标、照片或请求参数。
  console.warn("[miniapp:device]", JSON.stringify({
    action,
    errMsg: error.errMsg,
    errno: error.errno,
    errCode: error.errCode,
  }));
  if (error.errno === 112 || /api scope is not declared in the privacy agreement/i.test(error.errMsg || "")) {
    logDeviceRuntime();
  }
  if (/privacy|requiredPrivateInfos/i.test(error.errMsg || "")) {
    uni.showToast({ title: message, icon: "none", duration: 3000 });
  } else if (/auth|permission|deny|denied/i.test(error.errMsg || "")) {
    uni.showModal({
      title: "需要设备权限", content: message, confirmText: "打开设置",
      success: (result) => {
        if (!result.confirm) return;
        const closeOverlay = beginNativeOverlay(onNativeOverlayVisibilityChange);
        try {
          uni.openSetting({ complete: closeOverlay });
        } catch {
          closeOverlay();
        }
      },
    });
  } else {
    uni.showToast({ title: message, icon: "none", duration: 3000 });
  }
}
