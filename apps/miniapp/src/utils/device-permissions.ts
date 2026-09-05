/** 将设备接口失败转为可操作的中文说明；用户取消不视为错误。 */
export function deviceFailureMessage(error: { errMsg?: string }, action: string): string {
  const message = error.errMsg || "";
  if (/cancel/i.test(message)) return "";
  if (/privacy/i.test(message)) return `请先完成小程序隐私授权，再${action}`;
  if (/auth|permission|deny|denied/i.test(message)) return `未获得所需权限，请在小程序设置中授权后重新${action}`;
  return `${action}失败，请检查设备或网络后重试`;
}

/** 只有用户明确点击确认后才打开设置，不自动授予定位或相机权限。 */
export function showDeviceFailure(error: { errMsg?: string }, action: string): void {
  const message = deviceFailureMessage(error, action);
  if (!message) return;
  if (/auth|permission|deny|denied/i.test(error.errMsg || "")) {
    uni.showModal({
      title: "需要设备权限", content: message, confirmText: "打开设置",
      success: (result) => {
        if (result.confirm) uni.openSetting({});
      },
    });
  } else {
    uni.showToast({ title: message, icon: "none", duration: 3000 });
  }
}
