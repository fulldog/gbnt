import { describe, expect, it } from "vitest";
import type { LedgerSplitQuery } from "@/api/ledger-report-types";
import { ledgerDateNote, ledgerExportName, normalizeLedgerQuery } from "@/utils/ledger-report-query";

describe("拆分报表查询", () => {
  it("未传值统一为 0 和空字符串；不修改调用方参数", () => {
    const draft = { street_org_id: undefined, date_from: undefined };
    expect(normalizeLedgerQuery(draft)).toEqual({ street_org_id: 0, date_from: "", date_to: "" });
    expect(draft).toEqual({ street_org_id: undefined, date_from: undefined });
    expect(normalizeLedgerQuery({ street_org_id: Number.MAX_SAFE_INTEGER, date_from: "2024-02-29" }))
      .toEqual({ street_org_id: Number.MAX_SAFE_INTEGER, date_from: "2024-02-29", date_to: "" });
  });

  it.each([-1, 1.2, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, null, "003", "null", "3e0"])("拒绝 TS 调用方非法 ID %s", (street_org_id) => {
    expect(() => normalizeLedgerQuery({ street_org_id } as LedgerSplitQuery)).toThrow("安全非负整数");
  });

  it.each(["2023-02-29", "2026-04-31", "2026-13-01", "2026-1-01", " 2026-01-01", "2026-01-01 ", "null", null, 20260901])("拒绝非法日历日期 %s", (value) => {
    for (const key of ["date_from", "date_to"]) {
      expect(() => normalizeLedgerQuery({ [key]: value } as LedgerSplitQuery)).toThrow("有效日期");
    }
  });

  it("拒绝反向范围，允许同一天及仅传一端", () => {
    expect(() => normalizeLedgerQuery({ date_from: "2026-09-02", date_to: "2026-09-01" })).toThrow("开始日期");
    expect(normalizeLedgerQuery({ date_from: "2026-09-01", date_to: "2026-09-01" }).date_to).toBe("2026-09-01");
    expect(normalizeLedgerQuery({ date_to: "2026-09-01" }).date_from).toBe("");
  });

  it.each([
    [{}, "全部日期", "全部街道_全部日期"],
    [{ date_from: "2026-09-01" }, "2026-09-01 起（含当日）", "2026-09-01至不限止日"],
    [{ date_to: "2026-09-05" }, "截至 2026-09-05（含当日）", "不限起日至2026-09-05"],
    [{ street_org_id: 3, date_from: "2026-09-01", date_to: "2026-09-05" }, "2026-09-01 至 2026-09-05", "街道3_2026-09-01至2026-09-05"],
  ] as const)("四种日期说明与文件名使用同一规范筛选 %j", (draft, note, filename) => {
    const query = normalizeLedgerQuery(draft);
    expect(ledgerDateNote(query)).toContain(note);
    expect(ledgerExportName("街道台账", query)).toContain(filename);
  });
});
