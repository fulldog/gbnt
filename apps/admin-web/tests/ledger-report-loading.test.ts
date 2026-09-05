import { effectScope, type EffectScope } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import type { LedgerAppliedQuery, LedgerPart, LedgerSplitQuery } from "@/api/ledger-report-types";
import { useLedgerReport } from "@/composables/useLedgerReport";
import { allLedgerQuery } from "./fixtures/ledger-report-parts";

type Base = { row_key: string; name: string };
type Statistics = { row_key: string; count: number | null };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}
const scopes: EffectScope[] = [];
afterEach(() => { scopes.splice(0).forEach((scope) => scope.stop()); });
function setup() {
  let draft: LedgerSplitQuery = {};
  const loadRows = vi.fn<(query: LedgerAppliedQuery) => Promise<LedgerPart<Base>>>();
  const loadStatistics = vi.fn<(query: LedgerAppliedQuery) => Promise<LedgerPart<Statistics>>>();
  const scope = effectScope();
  scopes.push(scope);
  const state = scope.run(() => useLedgerReport({
    readQuery: () => draft, loadRows, loadStatistics,
    compose: (base, statistics) => ({ row_key: base.row_key, name: base.name, count: statistics.count }),
    errorMessage: "报表加载失败",
  }))!;
  return { state, loadRows, loadStatistics, scope, setDraft: (value: LedgerSplitQuery) => { draft = value; } };
}
function result(query = allLedgerQuery, name = "基础行") {
  return {
    base: { query: { ...query }, rows: [{ row_key: "2023:4", name }], notes: ["基础口径"] },
    statistics: { query: { ...query }, rows: [{ row_key: "2023:4", count: 0 }], notes: ["统计口径"] },
  };
}

describe("报表双请求状态", () => {
  it("并行请求参数副本，只有两份成功才一次提交且冻结已查询筛选", async () => {
    const { state, loadRows, loadStatistics, setDraft } = setup();
    const base = deferred<LedgerPart<Base>>();
    const statistics = deferred<LedgerPart<Statistics>>();
    const query = { street_org_id: 3, date_from: "2026-09-01", date_to: "" };
    setDraft(query);
    loadRows.mockReturnValue(base.promise); loadStatistics.mockReturnValue(statistics.promise);
    const running = state.run();
    expect(loadRows).toHaveBeenCalledOnce(); expect(loadStatistics).toHaveBeenCalledOnce();
    expect(loadRows.mock.calls[0]![0]).toEqual(query);
    expect(loadRows.mock.calls[0]![0]).not.toBe(loadStatistics.mock.calls[0]![0]);
    expect(loadRows.mock.calls[0]![0]).not.toBe(query);
    const parts = result(query);
    setDraft({ street_org_id: 99 });
    base.resolve(parts.base);
    await flushPromises();
    expect(state.data.value).toBeNull(); expect(state.hasLoaded.value).toBe(false); expect(state.loading.value).toBe(true);
    statistics.resolve(parts.statistics);
    expect(await running).toBe(true);
    expect(state.data.value).toEqual({ query, rows: [{ row_key: "2023:4", name: "基础行", count: 0 }], notes: ["基础口径", "统计口径"] });
    expect(state.loading.value).toBe(false); expect(state.hasLoaded.value).toBe(true);
  });

  it.each(["成功", "失败"])("A 先发后回的旧%s不能覆盖 B 最新结果", async (outcome) => {
    const { state, loadRows, loadStatistics, setDraft } = setup();
    const oldBase = deferred<LedgerPart<Base>>();
    const oldStatistics = deferred<LedgerPart<Statistics>>();
    loadRows.mockReturnValueOnce(oldBase.promise); loadStatistics.mockReturnValueOnce(oldStatistics.promise);
    const oldRun = state.run();
    const query = { ...allLedgerQuery, street_org_id: 3 };
    setDraft(query);
    const latest = result(query, "最新行");
    loadRows.mockResolvedValueOnce(latest.base); loadStatistics.mockResolvedValueOnce(latest.statistics);
    expect(await state.run()).toBe(true);
    if (outcome === "失败") oldBase.reject(new Error("过时失败")); else oldBase.resolve(result().base);
    oldStatistics.resolve(result().statistics);
    expect(await oldRun).toBe(false);
    expect(state.data.value?.rows[0]?.name).toBe("最新行");
    expect(state.data.value?.query).toEqual(query);
    expect(state.loadError.value).toBe(""); expect(state.loading.value).toBe(false);
  });

  it.each(["base", "statistics"] as const)("任一部分 %s 失败即清旧结果，不自动重试或稍后提交半份", async (failedPart) => {
    const { state, loadRows, loadStatistics } = setup();
    const parts = result();
    loadRows.mockResolvedValueOnce(parts.base); loadStatistics.mockResolvedValueOnce(parts.statistics);
    await state.run();
    expect(state.data.value?.rows).toHaveLength(1);
    const base = deferred<LedgerPart<Base>>(); const statistics = deferred<LedgerPart<Statistics>>();
    loadRows.mockReturnValueOnce(base.promise); loadStatistics.mockReturnValueOnce(statistics.promise);
    const running = state.run();
    expect(state.data.value).toBeNull(); expect(state.hasLoaded.value).toBe(false);
    if (failedPart === "base") base.reject(new Error("部分失败")); else statistics.reject(new Error("部分失败"));
    expect(await running).toBe(false);
    if (failedPart === "base") statistics.resolve(parts.statistics); else base.resolve(parts.base);
    await flushPromises();
    expect(state.data.value).toBeNull(); expect(state.loadError.value).toBe("部分失败");
    expect(state.hasLoaded.value).toBe(false); expect(state.loading.value).toBe(false);
    expect(loadRows).toHaveBeenCalledTimes(2); expect(loadStatistics).toHaveBeenCalledTimes(2);
  });

  it("当前失败不能被旧成功覆盖", async () => {
    const { state, loadRows, loadStatistics } = setup();
    const oldBase = deferred<LedgerPart<Base>>(); const parts = result();
    loadRows.mockReturnValueOnce(oldBase.promise).mockRejectedValueOnce(new Error("最新失败"));
    loadStatistics.mockResolvedValue(parts.statistics);
    const previous = state.run();
    expect(await state.run()).toBe(false);
    oldBase.resolve(parts.base); await previous;
    expect(state.data.value).toBeNull(); expect(state.loadError.value).toBe("最新失败");
  });

  it("行键不匹配进入失败态；两空是合法已加载空报表", async () => {
    const { state, loadRows, loadStatistics } = setup();
    const parts = result();
    loadRows.mockResolvedValue(parts.base); loadStatistics.mockResolvedValue({ ...parts.statistics, rows: [] });
    expect(await state.run()).toBe(false); expect(state.loadError.value).toContain("不匹配");
    loadRows.mockResolvedValue({ ...parts.base, rows: [] });
    expect(await state.run()).toBe(true); expect(state.data.value?.rows).toEqual([]); expect(state.hasLoaded.value).toBe(true);
  });

  it("销毁后完成不提交，也不能重新开始请求", async () => {
    const { state, loadRows, loadStatistics, scope } = setup();
    const base = deferred<LedgerPart<Base>>(); const parts = result();
    loadRows.mockReturnValue(base.promise); loadStatistics.mockResolvedValue(parts.statistics);
    const running = state.run(); scope.stop(); base.resolve(parts.base);
    expect(await running).toBe(false); expect(state.data.value).toBeNull(); expect(state.loading.value).toBe(false);
    expect(await state.run()).toBe(false); expect(loadRows).toHaveBeenCalledOnce();
  });

  it("无效草稿显示错误，不向后端发全量请求", async () => {
    const { state, loadRows, loadStatistics, setDraft } = setup();
    setDraft({ street_org_id: -1 });
    expect(await state.run()).toBe(false);
    expect(state.loadError.value).toContain("安全非负整数");
    expect(loadRows).not.toHaveBeenCalled(); expect(loadStatistics).not.toHaveBeenCalled();
  });
});
