import { computed, onScopeDispose, shallowRef } from "vue";
import { hasValidCoordinates } from "@/utils/issue-display";
import { beginNativeOverlay, type NativeOverlayVisibilityChange } from "@/utils/native-overlay";

type PrivacyResolver = (result: { event: "agree" | "disagree"; buttonId?: string }) => void;
interface PrivacyApi {
  requirePrivacyAuthorize(options: { success(): void; fail(error: { errMsg?: string }): void }): void;
  onNeedPrivacyAuthorization(callback: (resolve: PrivacyResolver) => void): void;
  offNeedPrivacyAuthorization?(callback: (resolve: PrivacyResolver) => void): void;
  openPrivacyContract?(options: { fail?(error: { errMsg?: string }): void }): void;
}
declare const wx: PrivacyApi | undefined;

export interface InspectionAccessOptions {
  onNativeOverlayVisibilityChange?: NativeOverlayVisibilityChange;
}

/** 巡查入口统一检查隐私、定位、相机及微信系统权限；拒绝后保留草稿并等待用户打开设置。 */
export function useInspectionAccess(options: InspectionAccessOptions = {}) {
  const phase = shallowRef<"idle" | "checking" | "privacy" | "denied" | "ready">("idle");
  const message = shallowRef("");
  const position = shallowRef<{ latitude: number; longitude: number } | null>(null);
  const ready = computed(() => phase.value === "ready");
  const privacyApi = typeof wx === "undefined" ? undefined : wx;
  let privacyResolver: PrivacyResolver | null = null;
  let systemDenied = false;
  let disposed = false;
  let pending: Promise<void> | null = null;
  const onPrivacy = (resolve: PrivacyResolver): void => {
    privacyResolver = resolve;
    phase.value = "privacy";
  };
  privacyApi?.onNeedPrivacyAuthorization?.(onPrivacy);

  function acceptPrivacy(): void {
    phase.value = "checking";
    privacyResolver?.({ event: "agree", buttonId: "inspection-privacy-agree" });
    privacyResolver = null;
  }
  function rejectPrivacy(): void {
    privacyResolver?.({ event: "disagree" });
    privacyResolver = null;
    phase.value = "denied";
    message.value = "巡查需要隐私授权，授权后可继续填写。";
  }
  function openPrivacy(): void {
    const closeOverlay = beginNativeOverlay(options.onNativeOverlayVisibilityChange);
    try {
      if (!privacyApi?.openPrivacyContract) {
        closeOverlay();
        return;
      }
      // 成功打开后由页面 onShow 结束保护；fail 代表没有进入原生隐私页。
      privacyApi.openPrivacyContract({ fail: closeOverlay });
    } catch {
      closeOverlay();
    }
  }

  async function check(): Promise<void> {
    if (!ready.value) phase.value = "checking";
    message.value = "";
    systemDenied = false;
    try {
      if (privacyApi?.requirePrivacyAuthorize) await new Promise<void>((resolve, reject) =>
        privacyApi.requirePrivacyAuthorize({ success: resolve, fail: reject }));
      if (disposed) return;
      await uni.authorize({ scope: "scope.userLocation" });
      if (disposed) return;
      const point = position.value ?? await uni.getLocation({ type: "gcj02" });
      if (disposed) return;
      if (!hasValidCoordinates(point.latitude, point.longitude)) throw new Error("未获取到有效定位，请开启手机定位后重试。");
      await uni.authorize({ scope: "scope.camera" });
      if (disposed) return;
      const settings = uni.getAppAuthorizeSetting?.();
      if (settings && (settings.cameraAuthorized === "denied" || settings.albumAuthorized === "denied" || settings.locationAuthorized === "denied")) {
        systemDenied = true;
        throw new Error("微信的定位、相机或相册权限已关闭，请在手机设置中开启后继续巡查。");
      }
      if (!disposed) { position.value = point; phase.value = "ready"; }
    } catch (cause) {
      if (disposed) return;
      const error = cause as { message?: string; errMsg?: string };
      phase.value = "denied";
      message.value = error.message || (/privacy/i.test(error.errMsg || "") ? "请先同意隐私保护指引，再开启巡查权限。" :
        "巡查需要定位和相机权限，请授权并开启手机定位后重试。");
    }
  }
  function request(): Promise<void> {
    if (disposed) return Promise.resolve();
    if (pending) return pending;
    pending = check().finally(() => { pending = null; });
    return pending;
  }
  async function openSettings(): Promise<void> {
    const closeOverlay = beginNativeOverlay(options.onNativeOverlayVisibilityChange);
    try {
      if (systemDenied && uni.openAppAuthorizeSetting) await uni.openAppAuthorizeSetting({});
      else await uni.openSetting({});
    } catch {
      message.value = "设置尚未完成，请开启所需权限后重试。";
      return;
    } finally {
      closeOverlay();
    }
    await request();
  }
  function denyMedia(): void {
    systemDenied = true;
    phase.value = "denied";
    message.value = "未获得相机或相册权限，请在设置中授权后继续巡查。";
  }
  onScopeDispose(() => {
    disposed = true;
    privacyResolver?.({ event: "disagree" });
    privacyApi?.offNeedPrivacyAuthorization?.(onPrivacy);
  });
  return { phase, message, position, ready, request, acceptPrivacy, rejectPrivacy, openPrivacy, openSettings, denyMedia };
}
