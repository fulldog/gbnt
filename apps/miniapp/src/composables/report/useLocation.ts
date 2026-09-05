import { shallowRef } from "vue";

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
          reject(new Error(error.errMsg || "无法获取位置信息"));
        },
        complete: () => {
          choosing.value = false;
        },
      });
    });
  }

  return { choosing, choose };
}
