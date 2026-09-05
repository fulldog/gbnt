import { describe, expect, it, vi } from "vitest";
import { buildLedgerSpreadsheet, exportLedgerTable } from "@/utils/ledger-export";
import { downloadBlob } from "@/utils/download";

vi.mock("@/utils/download", () => ({ downloadBlob: vi.fn() }));
const ns = "urn:schemas-microsoft-com:office:spreadsheet";
function table(markup: string): HTMLTableElement {
  const element = document.createElement("table");
  element.innerHTML = markup;
  return element;
}
function parse(markup: string) {
  const result = new DOMParser().parseFromString(markup, "application/xml");
  expect(result.querySelector("parsererror")).toBeNull();
  return result;
}

describe("台账 Excel XML 导出", () => {
  it("保留多层头、跨行跨列合并、标题和脚注，避免后续列错位", () => {
    const element = table(`<thead><tr><th colspan="4">街道台账</th></tr>
      <tr><th rowspan="2">街道</th><th colspan="3">建设情况</th></tr>
      <tr><th>机井</th><th>林网</th><th>道路</th></tr></thead>
      <tbody><tr><td rowspan="2">蒋官屯</td><td>0</td><td>2</td><td>3.25</td></tr>
      <tr><td>1</td><td>—</td><td>1.2</td></tr></tbody>
      <tfoot><tr><td colspan="4">注：待采集并非 0</td></tr></tfoot>`);
    const xml = parse(buildLedgerSpreadsheet(element, "街道台账"));
    const rows = Array.from(xml.getElementsByTagNameNS(ns, "Row"));
    const cells = (index: number) => Array.from(rows[index]!.getElementsByTagNameNS(ns, "Cell"));
    expect(cells(0)[0]!.getAttributeNS(ns, "MergeAcross")).toBe("3");
    expect(cells(1)[0]!.getAttributeNS(ns, "MergeDown")).toBe("1");
    expect(cells(2).map((cell) => cell.getAttributeNS(ns, "Index"))).toEqual(["2", "3", "4"]);
    expect(cells(4).map((cell) => cell.getAttributeNS(ns, "Index"))).toEqual(["2", "3", "4"]);
    expect(cells(5)[0]!.getAttributeNS(ns, "MergeAcross")).toBe("3");
    expect(xml.documentElement.textContent).toContain("待采集并非 0");
  });

  it("转义恶意文本，不生成公式、外链或脚本；保留电话前导零", () => {
    const element = table("<tbody><tr><td></td><td>0013800000000</td></tr></tbody>");
    element.rows[0]!.cells[0]!.textContent = '=HYPERLINK("https://example.invalid", "<账&目>")\u0001';
    const xml = parse(buildLedgerSpreadsheet(element, "街道/[测试]"));
    const values = Array.from(xml.getElementsByTagNameNS(ns, "Data"));
    expect(values.every((cell) => cell.getAttributeNS(ns, "Type") === "String")).toBe(true);
    expect(values[0]!.textContent).toBe('=HYPERLINK("https://example.invalid", "<账&目>")');
    expect(values[1]!.textContent).toBe("0013800000000");
    expect(xml.querySelector("script")).toBeNull();
    expect(xml.getElementsByTagNameNS(ns, "Cell")[0]!.hasAttributeNS(ns, "Formula")).toBe(false);
  });

  it("不伪装 xlsx 扩展名，且无表结构时阻止导出", () => {
    exportLedgerTable(table("<tbody><tr><td>正式数值</td></tr></tbody>"), "街道台账.xlsx");
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), "街道台账.xml");
    expect(() => buildLedgerSpreadsheet(table(""), "台账")).toThrow("当前没有可导出的报表");
  });
});
