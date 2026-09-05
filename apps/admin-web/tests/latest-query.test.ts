import { effectScope } from "vue";
import { describe, expect, it, vi } from "vitest";
import { useLatestQuery } from "@/composables/useLatestQuery";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function setup(load: () => Promise<string[]>) {
  const scope = effectScope();
  const state = scope.run(() => useLatestQuery({ initial: () => [] as string[], load, errorMessage: "读取失败" }))!;
  return { state, scope };
}

describe("最新请求驱动页面状态", () => {
  it("开始新查询立即清空旧结果，失败后不显示旧表或成功零统计", async () => {
    const load = vi.fn<() => Promise<string[]>>().mockResolvedValueOnce(["旧街道"]).mockRejectedValueOnce(new Error("新查询失败"));
    const { state, scope } = setup(load);
    expect(await state.run()).toBe(true);
    expect(state.hasLoaded.value).toBe(true);
    const latest = state.run();
    expect(state.data.value).toEqual([]);
    expect(state.hasLoaded.value).toBe(false);
    expect(await latest).toBe(false);
    expect(state.loadError.value).toBe("新查询失败");
    expect(state.loading.value).toBe(false);
    scope.stop();
  });

  it.each(["success", "failure"])("B先返回后，A迟到%s不改变结果和错误", async (outcome) => {
    const a = deferred<string[]>();
    const b = deferred<string[]>();
    const load = vi.fn<() => Promise<string[]>>().mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    const { state, scope } = setup(load);
    const first = state.run();
    const second = state.run();
    b.resolve(["北城"]);
    expect(await second).toBe(true);
    if (outcome === "success") a.resolve(["东城"]);
    else a.reject(new Error("过期错误"));
    expect(await first).toBe(false);
    expect(state.data.value).toEqual(["北城"]);
    expect(state.loadError.value).toBe("");
    expect(state.loading.value).toBe(false);
    scope.stop();
  });

  it("旧请求finally不能提前结束仍在等待的新请求loading", async () => {
    const a = deferred<string[]>();
    const b = deferred<string[]>();
    const { state, scope } = setup(vi.fn<() => Promise<string[]>>().mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise));
    const first = state.run();
    const second = state.run();
    a.reject(new Error("过期错误"));
    await first;
    expect(state.loading.value).toBe(true);
    expect(state.loadError.value).toBe("");
    b.resolve([]);
    expect(await second).toBe(true);
    expect(state.hasLoaded.value).toBe(true);
    scope.stop();
  });

  it("失效后可重新加载，卸载后迟到响应不可回填且不再发请求", async () => {
    const a = deferred<string[]>();
    const b = deferred<string[]>();
    const load = vi.fn<() => Promise<string[]>>().mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    const { state, scope } = setup(load);
    const first = state.run();
    state.invalidate();
    a.resolve(["已关闭弹窗"]);
    expect(await first).toBe(false);
    const second = state.run();
    scope.stop();
    b.resolve(["已卸载页面"]);
    expect(await second).toBe(false);
    expect(state.data.value).toEqual([]);
    expect(await state.run()).toBe(false);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
