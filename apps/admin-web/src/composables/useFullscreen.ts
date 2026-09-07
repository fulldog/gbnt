import { ElMessage } from "element-plus";
import { onBeforeUnmount, onMounted, shallowRef } from "vue";

export function useFullscreen(target: () => HTMLElement | null | undefined) {
  const fullscreen = shallowRef(false);
  function sync(): void { fullscreen.value = Boolean(target() && document.fullscreenElement === target()); }
  async function toggle(): Promise<void> {
    const element = target();
    if (!element) return;
    try {
      if (document.fullscreenElement === element) await document.exitFullscreen();
      else if (element.requestFullscreen) await element.requestFullscreen();
      else ElMessage.warning("当前浏览器不支持全屏，请使用浏览器全屏功能");
    } catch { ElMessage.warning("无法切换全屏，请重试"); }
  }
  onMounted(() => document.addEventListener("fullscreenchange", sync));
  onBeforeUnmount(() => {
    document.removeEventListener("fullscreenchange", sync);
    if (fullscreen.value) void document.exitFullscreen().catch(() => undefined);
  });
  return { fullscreen, toggle };
}
