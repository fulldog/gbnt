import { shallowRef } from "vue";
import { hasValidCoordinates } from "@/utils/issue-display";
import { showDeviceFailure } from "@/utils/device-permissions";

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

export function useLocation() {
  const choosing = shallowRef(false);

  function choose(): Promise<SelectedLocation | null> {
    if (choosing.value) {
      return Promise.resolve(null);
    }
    choosing.value = true;
    return new Promise((resolve, reject) => {
      uni.chooseLocation({
        success: (result: ChooseLocationResult) => {
          if (!hasValidCoordinates(Number(result.latitude), Number(result.longitude))) {
            reject(new Error("选中的坐标无效，请重新选择现场位置"));
            return;
          }
          const address = [result.address, result.name]
            .map((item) => item?.trim())
            .filter(Boolean)
            .join(" ");
          resolve({
            address,
            latitude: Number(result.latitude),
            longitude: Number(result.longitude),
          });
        },
        fail: (error) => {
          if (error.errMsg?.includes("cancel")) {
            resolve(null);
            return;
          }
          showDeviceFailure(error, "选择现场位置");
          resolve(null);
        },
        complete: () => {
          choosing.value = false;
        },
      });
    });
  }

  return { choosing, choose };
}
