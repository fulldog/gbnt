import { isReadonly, isRef, nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTabScrollEdges } from "@/components/report/useTabScrollEdges";

type ScrollEdges = ReturnType<typeof useTabScrollEdges>;

function queryFixture() {
  let callback: (value: unknown) => void = () => undefined;
  const query = { in: vi.fn(), select: vi.fn(), boundingClientRect: vi.fn(), exec: vi.fn() };
  query.in.mockReturnValue(query);
  query.select.mockReturnValue(query);
  query.boundingClientRect.mockReturnValue(query);
  query.exec.mockImplementation((receive: (value: unknown) => void) => { callback = receive; return query; });
  return { query, respond: (value: unknown) => callback(value) };
}

const queries: ReturnType<typeof queryFixture>[] = [];
const createSelectorQuery = vi.fn(() => {
  const fixture = queryFixture();
  queries.push(fixture);
  return fixture.query;
});

beforeEach(() => {
  vi.useFakeTimers();
  queries.length = 0;
  createSelectorQuery.mockClear();
  vi.stubGlobal("uni", { createSelectorQuery });
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function rectangles(viewportWidth = 300, contentWidth = 500, scrollLeft = 0) {
  return [{ width: viewportWidth, left: 24 }, { width: contentWidth, left: 24 - scrollLeft }];
}

function expectFades(edges: ScrollEdges, left: boolean, right: boolean) {
  expect(edges.showLeftFade.value).toBe(left);
  expect(edges.showRightFade.value).toBe(right);
}

async function measure(edges: ScrollEdges, rects: unknown = rectangles()) {
  const pending = edges.refresh();
  await nextTick();
  queries[queries.length - 1]!.respond(rects);
  await pending;
}

describe("facility tab scroll edges", () => {
  it("returns readonly computed flags and does not guess edges before measurement", () => {
    const edges = useTabScrollEdges(() => ({}));
    expectFades(edges, false, false);
    expect(isRef(edges.showLeftFade)).toBe(true);
    expect(isReadonly(edges.showLeftFade)).toBe(true);
    expect(isReadonly(edges.showRightFade)).toBe(true);
    edges.onScroll({ detail: { scrollLeft: 60, scrollWidth: 500 } });
    expectFades(edges, false, false);
    expect(createSelectorQuery).not.toHaveBeenCalled();
  });

  it("waits for nextTick and scopes both rectangle queries to the current component", async () => {
    const component = {};
    const edges = useTabScrollEdges(() => component);
    const pending = edges.refresh();
    expect(createSelectorQuery).not.toHaveBeenCalled();
    await nextTick();
    const fixture = queries[0]!;
    expect(fixture.query.in).toHaveBeenCalledWith(component);
    expect(fixture.query.select.mock.calls).toEqual([[".facility-types__scroll"], [".facility-types__list"]]);
    expect(fixture.query.boundingClientRect).toHaveBeenCalledTimes(2);
    expect(fixture.query.exec).toHaveBeenCalledTimes(1);
    fixture.respond(rectangles());
    await pending;
    expectFades(edges, false, true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([200, 300, 300.9, 301])("does not fade content that fits within tolerance: %s", async (contentWidth) => {
    const edges = useTabScrollEdges(() => ({}));
    await measure(edges, rectangles(300, contentWidth));
    expectFades(edges, false, false);
  });

  it.each([
    [0, false, true],
    [80, true, true],
    [200, true, false],
    [-30, false, true],
    [230, true, false],
    [1, false, true],
    [1.1, true, true],
    [199, true, false],
    [198.9, true, true],
  ])("derives correct measured edges at offset %s", async (offset, left, right) => {
    const edges = useTabScrollEdges(() => ({}));
    await measure(edges, rectangles(300, 500, offset as number));
    expectFades(edges, left as boolean, right as boolean);
  });

  it("updates from scroll events including content width changes and clamps overscroll", async () => {
    const edges = useTabScrollEdges(() => ({}));
    await measure(edges);
    edges.onScroll({ detail: { scrollLeft: 100, scrollWidth: 600 } });
    expectFades(edges, true, true);
    edges.onScroll({ detail: { scrollLeft: 300, scrollWidth: 600 } });
    expectFades(edges, true, false);
    edges.onScroll({ detail: { scrollLeft: -5, scrollWidth: 600 } });
    expectFades(edges, false, true);
    edges.onScroll({ detail: { scrollLeft: 999, scrollWidth: 600 } });
    expectFades(edges, true, false);
    edges.onScroll({ detail: { scrollLeft: 40, scrollWidth: 200 } });
    expectFades(edges, false, false);
  });

  it.each([
    undefined, null, [], {}, [null, null], [{ width: 300, left: 0 }],
    [{ width: 0, left: 0 }, { width: 500, left: 0 }],
    [{ width: 300, left: 0 }, { width: -10, left: 0 }],
    [{ width: "300", left: 0 }, { width: 500, left: 0 }],
    [{ width: 300, left: 0 }, { width: Number.NaN, left: 0 }],
    [{ width: 300, left: 0 }, { width: 500, left: Number.POSITIVE_INFINITY }],
    [{ width: 300 }, { width: 500, left: 0 }],
  ].map((result) => ({ result })))("clears obsolete fades for invalid measurements: $result", async ({ result }) => {
    const edges = useTabScrollEdges(() => ({}));
    await measure(edges);
    expectFades(edges, false, true);
    const pending = edges.refresh();
    await nextTick();
    queries[queries.length - 1]!.respond(result);
    await pending;
    expectFades(edges, false, false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    null, undefined, {}, { detail: null }, { detail: { scrollLeft: 50 } },
    { detail: { scrollLeft: "50", scrollWidth: 500 } },
    { detail: { scrollLeft: Number.NaN, scrollWidth: 500 } },
    { detail: { scrollLeft: 50, scrollWidth: Number.POSITIVE_INFINITY } },
    { detail: { scrollLeft: 50, scrollWidth: -10 } },
  ])("does not keep fades after malformed scroll events: %j", async (event) => {
    const edges = useTabScrollEdges(() => ({}));
    await measure(edges);
    edges.onScroll(event);
    expectFades(edges, false, false);
  });

  it("falls back safely when a component or selector API is unavailable", async () => {
    const missingComponent = useTabScrollEdges(() => null);
    await missingComponent.refresh();
    expectFades(missingComponent, false, false);
    expect(createSelectorQuery).not.toHaveBeenCalled();
    const unavailable = useTabScrollEdges(() => { throw new Error("component unavailable"); });
    await unavailable.refresh();
    expectFades(unavailable, false, false);
    vi.stubGlobal("uni", {});
    const missingApi = useTabScrollEdges(() => ({}));
    await missingApi.refresh();
    expectFades(missingApi, false, false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("resolves missing callbacks within 500ms and ignores a late response", async () => {
    const edges = useTabScrollEdges(() => ({}));
    await measure(edges);
    let resolved = false;
    const pending = edges.refresh().then(() => { resolved = true; });
    await nextTick();
    const late = queries[1]!;
    await vi.advanceTimersByTimeAsync(499);
    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(resolved).toBe(true);
    expectFades(edges, false, false);
    late.respond(rectangles());
    expectFades(edges, false, false);
    expect(vi.getTimerCount()).toBe(0);
    await measure(edges);
    expectFades(edges, false, true);
  });

  it("does not let an old measurement override newer scrolling", async () => {
    const edges = useTabScrollEdges(() => ({}));
    await measure(edges);
    const pending = edges.refresh();
    await nextTick();
    const stale = queries[1]!;
    edges.onScroll({ detail: { scrollLeft: 200, scrollWidth: 500 } });
    expectFades(edges, true, false);
    stale.respond(rectangles(300, 500, 0));
    await pending;
    expectFades(edges, true, false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("accepts the first viewport measurement when automatic scrolling happens before its callback", async () => {
    const edges = useTabScrollEdges(() => ({}));
    const pending = edges.refresh();
    await nextTick();
    edges.onScroll({ detail: { scrollLeft: 200, scrollWidth: 500 } });
    expectFades(edges, false, false);
    queries[0]!.respond(rectangles(300, 500, 0));
    await pending;
    expectFades(edges, true, false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("still starts the first measurement if scrolling occurs while waiting for nextTick", async () => {
    const edges = useTabScrollEdges(() => ({}));
    const pending = edges.refresh();
    edges.onScroll({ detail: { scrollLeft: 80, scrollWidth: 500 } });
    await nextTick();
    expect(createSelectorQuery).toHaveBeenCalledTimes(1);
    queries[0]!.respond(rectangles(300, 500, 0));
    await pending;
    expectFades(edges, true, true);
  });

  it("uses the resized viewport while retaining the latest scroll position", async () => {
    const edges = useTabScrollEdges(() => ({}));
    await measure(edges);
    const pending = edges.refresh();
    await nextTick();
    edges.onScroll({ detail: { scrollLeft: 120, scrollWidth: 500 } });
    edges.onScroll({ detail: { scrollLeft: 150, scrollWidth: 500 } });
    expectFades(edges, true, true);
    queries[1]!.respond(rectangles(350, 500, 0));
    await pending;
    expectFades(edges, true, false);
  });

  it("keeps a newer scrollWidth while applying the measured viewport width", async () => {
    const edges = useTabScrollEdges(() => ({}));
    await measure(edges);
    const pending = edges.refresh();
    await nextTick();
    edges.onScroll({ detail: { scrollLeft: 250, scrollWidth: 800 } });
    queries[1]!.respond(rectangles(350, 500, 0));
    await pending;
    expectFades(edges, true, true);
    edges.onScroll({ detail: { scrollLeft: 450, scrollWidth: 800 } });
    expectFades(edges, true, false);
  });

  it("settles superseded measurements and only accepts the newest rectangles", async () => {
    const edges = useTabScrollEdges(() => ({}));
    const first = edges.refresh();
    await nextTick();
    const older = queries[0]!;
    const second = edges.refresh();
    await nextTick();
    await first;
    const newer = queries[1]!;
    newer.respond(rectangles(400, 400));
    await second;
    older.respond(rectangles(100, 800, 50));
    expectFades(edges, false, false);
    expect(vi.getTimerCount()).toBe(0);
    await measure(edges, rectangles(200, 500, 60));
    expectFades(edges, true, true);
  });

  it("only starts one native query for refreshes superseded before nextTick", async () => {
    const edges = useTabScrollEdges(() => ({}));
    const first = edges.refresh();
    const second = edges.refresh();
    await nextTick();
    expect(createSelectorQuery).toHaveBeenCalledTimes(1);
    queries[0]!.respond(rectangles());
    await Promise.all([first, second]);
    expectFades(edges, false, true);
  });

  it("dispose settles pending work, removes timers, and ignores all later activity", async () => {
    const edges = useTabScrollEdges(() => ({}));
    await measure(edges);
    const pending = edges.refresh();
    await nextTick();
    const late = queries[1]!;
    edges.dispose();
    await pending;
    expect(vi.getTimerCount()).toBe(0);
    late.respond(rectangles(300, 600, 100));
    edges.onScroll({ detail: { scrollLeft: 100, scrollWidth: 600 } });
    await edges.refresh();
    expectFades(edges, false, false);
    expect(createSelectorQuery).toHaveBeenCalledTimes(2);
  });

  it("does not measure if disposed before the first nextTick", async () => {
    const edges = useTabScrollEdges(() => ({}));
    const pending = edges.refresh();
    edges.dispose();
    await pending;
    expect(createSelectorQuery).not.toHaveBeenCalled();
    expectFades(edges, false, false);
  });
});
