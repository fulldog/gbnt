import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, reactive } from "vue";
import { setupSfc } from "./helpers/setup-sfc";

const lifecycle = vi.hoisted(() => ({ unmount: () => {} }));
vi.mock("vue", async (original) => ({
  ...await original<typeof import("vue")>(),
  onMounted: (callback: () => void) => callback(),
  onBeforeUnmount: (callback: () => void) => { lifecycle.unmount = callback; },
}));

function setup() {
  const draws: Array<(() => void) | undefined> = [];
  const context = Object.fromEntries(["setFillStyle", "fillRect", "setStrokeStyle", "setLineWidth", "setLineDash", "beginPath", "moveTo", "lineTo", "stroke", "setLineCap", "setLineJoin", "arc", "fill"].map((method) => [method, vi.fn()]));
  context.draw = vi.fn((_reserve: boolean, callback?: () => void) => { draws.push(callback); });
  const exportFile = vi.fn();
  vi.stubGlobal("uni", {
    createCanvasContext: () => context,
    createSelectorQuery: () => {
      const query = { in: () => query, select: () => query, boundingClientRect: () => query, exec: vi.fn() };
      return query;
    },
    getSystemInfoSync: () => ({ pixelRatio: 2 }),
    canvasToTempFilePath: exportFile,
  });
  const props = reactive({ disabled: false, active: true, strokes: [[{ x: .2, y: .2 }, { x: .4, y: .3 }]] });
  let hide = () => {};
  const state = setupSfc("components/media/SignaturePad.vue", props, {
    "@dcloudio/uni-app": { onHide: (callback: () => void) => { hide = callback; } },
  }) as unknown as {
    exportPng(): Promise<{ filePath: string; revision: number }>;
    redraw(): void;
    getRevision(): number;
  };
  return { state, props, draws, exportFile, context, hide: () => hide() };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("签名导出不会永久占用提交按钮", () => {
  it("提交重新绘制完整笔迹，只等最后一帧，不等待历史绘制回调", async () => {
    const { state, draws, exportFile, context } = setup();
    state.redraw();
    state.redraw();
    const pending = state.exportPng();
    expect(exportFile).not.toHaveBeenCalled();
    expect(draws.slice(0, -1)).toEqual([undefined, undefined]);
    draws[draws.length - 1]!();
    expect(exportFile).toHaveBeenCalledOnce();
    expect(context.lineTo).toHaveBeenCalledWith(128, 144);
    exportFile.mock.calls[0]![0].success({ tempFilePath: "wxfile://signature.png" });
    await expect(pending).resolves.toEqual({ filePath: "wxfile://signature.png", revision: 0 });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("绘制回调丢失时超时退出，可重新导出，旧回调不能触发上传", async () => {
    const { state, draws, exportFile } = setup();
    const pending = state.exportPng();
    const rejected = expect(pending).rejects.toThrow("签名导出超时");
    await vi.advanceTimersByTimeAsync(10_000);
    await rejected;
    const retry = state.exportPng();
    draws[0]!();
    expect(exportFile).not.toHaveBeenCalled();
    draws[1]!();
    exportFile.mock.calls[0]![0].success({ tempFilePath: "wxfile://retry.png" });
    await expect(retry).resolves.toMatchObject({ filePath: "wxfile://retry.png" });
  });

  it("文件导出回调丢失也会超时，迟到结果不能完成新一次导出", async () => {
    const { state, draws, exportFile } = setup();
    const first = state.exportPng();
    draws[0]!();
    const rejected = expect(first).rejects.toThrow("签名导出超时");
    await vi.advanceTimersByTimeAsync(10_000);
    await rejected;
    const retry = state.exportPng();
    draws[1]!();
    exportFile.mock.calls[0]![0].success({ tempFilePath: "wxfile://old.png" });
    exportFile.mock.calls[1]![0].success({ tempFilePath: "wxfile://new.png" });
    await expect(retry).resolves.toMatchObject({ filePath: "wxfile://new.png" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["hide", "inactive", "unmount"])("%s 中断等待并保留笔迹", async (action) => {
    const { state, props, draws, exportFile, hide } = setup();
    const pending = state.exportPng();
    const rejected = expect(pending).rejects.toThrow("签名导出已取消");
    if (action === "hide") hide();
    else if (action === "inactive") { props.active = false; await nextTick(); }
    else lifecycle.unmount();
    await rejected;
    draws[0]!();
    expect(exportFile).not.toHaveBeenCalled();
    expect(props.strokes[0]).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(0);
  });
});
