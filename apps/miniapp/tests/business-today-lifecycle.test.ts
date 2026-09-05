import { afterEach, describe, expect, it, vi } from "vitest";
import { effectScope } from "vue";
import { useBusinessToday } from "@/composables/useBusinessToday";

const hooks = vi.hoisted(() => ({ show: () => {}, hide: () => {}, unload: () => {} }));
vi.mock("@dcloudio/uni-app", () => ({
  onShow: (callback: () => void) => { hooks.show = callback; },
  onHide: (callback: () => void) => { hooks.hide = callback; },
  onUnload: (callback: () => void) => { hooks.unload = callback; },
}));

afterEach(() => { vi.useRealTimers(); });

describe("business day page lifecycle", () => {
  it("refreshes the date at Shanghai midnight and cancels its timer on disposal", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-05T15:59:59Z"));
    const scope = effectScope();
    const today = scope.run(useBusinessToday)!;
    hooks.show();
    expect(today.value).toBe("2026-09-05");
    await vi.advanceTimersByTimeAsync(1100);
    expect(today.value).toBe("2026-09-06");
    scope.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops hidden page timers and refreshes immediately when the page returns", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-05T15:00:00Z"));
    const scope = effectScope();
    const today = scope.run(useBusinessToday)!;
    hooks.show();
    hooks.hide();
    expect(vi.getTimerCount()).toBe(0);
    vi.setSystemTime(new Date("2026-09-06T17:00:00Z"));
    hooks.show();
    expect(today.value).toBe("2026-09-07");
    hooks.unload();
    expect(vi.getTimerCount()).toBe(0);
    scope.stop();
  });
});
