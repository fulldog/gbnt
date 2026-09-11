import { computed, shallowRef } from "vue";
import { hasValidCoordinates } from "@/utils/issue-display";
import { showDeviceFailure } from "@/utils/device-permissions";
import { beginNativeOverlay, type NativeOverlayVisibilityChange } from "@/utils/native-overlay";

export interface SelectedLocation {
  address: string;
  latitude: number;
  longitude: number;
}

interface ChooseLocationResult {
  name?: string;
  address?: string;
  latitude: number;
  longitude: number;
}

export interface LocationCenter {
  latitude: number;
  longitude: number;
}

export interface LocationOptions {
  onNativeOverlayVisibilityChange?: NativeOverlayVisibilityChange;
}

type LocationAction = "map" | "refresh" | null;

function openLocationPicker(
  center?: LocationCenter,
  onNativeOverlayVisibilityChange?: NativeOverlayVisibilityChange,
): Promise<SelectedLocation | null> {
  return new Promise((resolve, reject) => {
    const closeOverlay = beginNativeOverlay(onNativeOverlayVisibilityChange);
    try {
      uni.chooseLocation({
        ...(center ? { latitude: center.latitude, longitude: center.longitude } : {}),
        success: (result: ChooseLocationResult) => {
          closeOverlay();
          const latitude = Number(result.latitude);
          const longitude = Number(result.longitude);
          if (!hasValidCoordinates(latitude, longitude)) {
            reject(new Error("选中的坐标无效，请重新选择现场位置"));
            return;
          }
          const address = [result.address, result.name]
            .map((item) => item?.trim())
            .filter(Boolean)
            .join(" ");
          resolve({ address, latitude, longitude });
        },
        fail: (error) => {
          closeOverlay();
          if (error.errMsg?.includes("cancel")) {
            resolve(null);
            return;
          }
          showDeviceFailure(error, "选择现场位置", onNativeOverlayVisibilityChange);
          resolve(null);
        },
      });
    } catch (error) {
      closeOverlay();
      reject(error);
    }
  });
}

export function useLocation(options: LocationOptions = {}) {
  const action = shallowRef<LocationAction>(null);
  const choosing = computed(() => action.value === "map");
  const refreshing = computed(() => action.value === "refresh");
  const busy = computed(() => action.value !== null);

  async function choose(center?: LocationCenter): Promise<SelectedLocation | null> {
    if (busy.value) return null;
    action.value = "map";
    try {
      return await openLocationPicker(center, options.onNativeOverlayVisibilityChange);
    } finally {
      action.value = null;
    }
  }

  /** 获取最新 GPS 后以该位置打开地图；地图确认结果同时提供中文地址和坐标。 */
  async function refresh(): Promise<SelectedLocation | null> {
    if (busy.value) return null;
    action.value = "refresh";
    try {
      const point = await uni.getLocation({
        type: "gcj02",
        isHighAccuracy: true,
        highAccuracyExpireTime: 5000,
      });
      const center = { latitude: Number(point.latitude), longitude: Number(point.longitude) };
      if (!hasValidCoordinates(center.latitude, center.longitude)) {
        throw new Error("未获取到有效定位，请开启手机定位后重试");
      }
      return await openLocationPicker(center, options.onNativeOverlayVisibilityChange);
    } catch (cause) {
      const error = cause as { message?: string; errMsg?: string };
      if (error.message && !error.errMsg) {
        uni.showToast({ title: error.message, icon: "none", duration: 3000 });
      } else {
        showDeviceFailure(error, "重新定位", options.onNativeOverlayVisibilityChange);
      }
      return null;
    } finally {
      action.value = null;
    }
  }

  return { choosing, refreshing, busy, choose, refresh };
}
