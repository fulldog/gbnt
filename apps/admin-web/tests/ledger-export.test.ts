import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildLedgerSpreadsheet, exportLedgerTable } from "@/utils/ledger-export";
import { downloadBlob } from "@/utils/download";

vi.mock("@/utils/download", () => ({ downloadBlob: vi.fn() }));
function table(markup: string): HTMLTableElement {
  const element = document.createElement("table");
  element.innerHTML = markup;
  return element;
}
async function readSpreadsheet(content: ArrayBuffer): Promise<ExcelJS.Worksheet> {
  expect(content).toBeInstanceOf(ArrayBuffer);
  expect(Array.from(new Uint8Array(content).slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(content);
  expect(workbook.worksheets).toHaveLength(1);
  return workbook.worksheets[0]!;
}

function readBlob(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(reader.result);
      else reject(new Error("下载内容不是二进制工作簿"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("下载内容读取失败"));
    reader.readAsArrayBuffer(blob);
  });
}

describe("台账真实 XLSX 导出", () => {
  beforeEach(() => vi.mocked(downloadBlob).mockClear());

  it("回读真实工作簿，保留多层头、跨行跨列合并、标题和脚注，避免后续列错位", async () => {
    const element = table(`<thead><tr><th colspan="4">街道台账</th></tr>
      <tr><th rowspan="2">街道</th><th colspan="3">建设情况</th></tr>
      <tr><th>机井</th><th>林网</th><th>道路</th></tr></thead>
      <tbody><tr><td rowspan="2">蒋官屯</td><td>0</td><td>2</td><td>3.25</td></tr>
      <tr><td>1</td><td>—</td><td>1.2</td></tr></tbody>
      <tfoot><tr><td colspan="4">注：待采集并非 0</td></tr></tfoot>`);
    const sheet = await readSpreadsheet(await buildLedgerSpreadsheet(element, "街道台账"));
    expect(sheet.name).toBe("街道台账");
    expect(sheet.rowCount).toBe(6);
    expect(sheet.columnCount).toBe(4);
    expect(sheet.model.merges).toEqual(expect.arrayContaining(["A1:D1", "A2:A3", "B2:D2", "A4:A5", "A6:D6"]));
    expect(sheet.model.merges).toHaveLength(5);
    expect(sheet.getCell("A1").value).toBe("街道台账");
    expect(["B3", "C3", "D3"].map((address) => sheet.getCell(address).value)).toEqual(["机井", "林网", "道路"]);
    expect(["B4", "C4", "D4"].map((address) => sheet.getCell(address).value)).toEqual(["0", "2", "3.25"]);
    expect(sheet.getCell("A5").master.address).toBe("A4");
    expect(["B5", "C5", "D5"].map((address) => sheet.getCell(address).value)).toEqual(["1", "—", "1.2"]);
    expect(sheet.getCell("A6").value).toBe("注：待采集并非 0");
  });

  it("回读标题、表头与备注样式，保留不同列宽、横向单页宽、重复打印表头及换行", async () => {
    const element = table(`<colgroup><col style="width: 210px"><col style="width: 70px"><col style="width: 140px"></colgroup>
      <thead><tr><th colspan="3">报表标题</th></tr><tr><th>街道</th><th>机井</th><th>说明</th></tr></thead>
      <tbody><tr><td>街道甲</td><td>0</td><td>第一行<br>第二行</td></tr></tbody>
      <tfoot><tr><td colspan="3">注：保留备注</td></tr></tfoot>`);
    const sheet = await readSpreadsheet(await buildLedgerSpreadsheet(element, "版式"));
    expect(sheet.getCell("A1").font).toMatchObject({ name: "Microsoft YaHei", size: 14, bold: true });
    expect(sheet.getCell("A2").font).toMatchObject({ name: "Microsoft YaHei", size: 10, bold: true });
    expect(sheet.getCell("A2").fill).toMatchObject({ type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } });
    expect(sheet.getCell("A2").alignment).toMatchObject({ horizontal: "center", vertical: "middle", wrapText: true });
    expect(sheet.getCell("C3").value).toBe("第一行\n第二行");
    expect(sheet.getCell("C3").alignment.wrapText).toBe(true);
    expect(sheet.getCell("A4").value).toBe("注：保留备注");
    expect(sheet.getCell("A4").alignment).toMatchObject({ horizontal: "left", vertical: "middle", wrapText: true });
    [210, 70, 140].forEach((pixels, index) => expect(sheet.getColumn(index + 1).width).toBeCloseTo((pixels - 5) / 7, 4));
    expect(sheet.getRow(1).height).toBe(40);
    expect(sheet.getRow(2).height).toBe(48);
    expect(sheet.pageSetup).toMatchObject({ orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "1:2", printArea: "A1:C4" });
  });

  it("所有用户文本保持 String，前导零与公式前缀不生成公式或超链接", async () => {
    const values = [
      '=HYPERLINK("https://example.invalid", "<账&目>")', "0013800000000", "+SUM(1,2)", "-1+2", "@SUM(1,2)",
      "<script>alert('test')</script>", "https://example.invalid/账目", "000", "9007199254740993",
    ];
    const element = table("<tbody><tr></tr></tbody>");
    for (const value of values) element.rows[0]!.insertCell().textContent = value;
    const sheet = await readSpreadsheet(await buildLedgerSpreadsheet(element, "文本安全"));
    values.forEach((value, index) => {
      const cell = sheet.getCell(1, index + 1);
      expect(cell.type).toBe(ExcelJS.ValueType.String);
      expect(cell.value).toBe(value);
      expect(cell.formula).toBeUndefined();
      expect(cell.hyperlink).toBeUndefined();
    });
  });

  it("移除非法控制字符，保留中文、制表符、换行及普通 XML 特殊字符", async () => {
    const element = table("<tbody><tr><td></td></tr></tbody>");
    element.rows[0]!.cells[0]!.textContent = "甲\u0000\u0001\u0008\u000b\u000c\u000e\u001f\ufffe\uffff乙\t丙\n丁 <&> \"测试\"";
    const sheet = await readSpreadsheet(await buildLedgerSpreadsheet(element, "安全文本"));
    expect(sheet.getCell("A1").value).toBe('甲乙\t丙\n丁 <&> "测试"');
    expect(sheet.getCell("A1").type).toBe(ExcelJS.ValueType.String);
  });

  it.each(["街道/[测试]:?*\\台账", "'".repeat(4), "超长工作表名".repeat(8), "\u0000\u0001台账\ufffe\uffff", "History", "history"])(
    "回读合法工作表名：%j", async (name) => {
      const sheet = await readSpreadsheet(await buildLedgerSpreadsheet(table("<tr><td>数据</td></tr>"), name));
      expect(sheet.name.length).toBeGreaterThan(0);
      expect(sheet.name.length).toBeLessThanOrEqual(31);
      expect(sheet.name).not.toMatch(/[\\/?:*\[\]\u0000-\u001f\ufffe\uffff]/);
      expect(sheet.name).not.toMatch(/^'|'$/);
      if (name === "'".repeat(4) || name.toLowerCase() === "history") expect(sheet.name).toBe("报表");
    },
  );

  it("rowSpan=0 只延伸至当前分组末尾，不挤占下一组或脚注的首列", async () => {
    const element = table(`<tbody><tr><td rowspan="0">街道甲</td><td>第一行</td></tr><tr><td>第二行</td></tr></tbody>
      <tbody><tr><td>街道乙</td><td>第三行</td></tr></tbody><tfoot><tr><td colspan="2">备注</td></tr></tfoot>`);
    const sheet = await readSpreadsheet(await buildLedgerSpreadsheet(element, "跨行"));
    expect(sheet.model.merges).toEqual(expect.arrayContaining(["A1:A2", "A4:B4"]));
    expect(sheet.getCell("A2").master.address).toBe("A1");
    expect(sheet.getCell("B2").value).toBe("第二行");
    expect(sheet.getCell("A3").value).toBe("街道乙");
    expect(sheet.getCell("A3").isMerged).toBe(false);
    expect(sheet.getCell("B3").value).toBe("第三行");
    expect(sheet.getCell("A4").value).toBe("备注");
  });

  it("保留展示换行并剔除控件/辅助文案，不修改原始表格", async () => {
    const element = table(`<tbody><tr><td>负责人<br>（盖章）<button>编辑</button><input value="私有值"><select><option>选项</option></select>
      <textarea>草稿</textarea><span hidden>隐藏字段</span><span aria-hidden="true">图标说明</span><span class="sr-only">辅助提示</span><span>\n联系电话</span></td></tr></tbody>`);
    const original = element.innerHTML;
    const sheet = await readSpreadsheet(await buildLedgerSpreadsheet(element, "展示内容"));
    const value = sheet.getCell("A1").value;
    expect(value).toEqual(expect.stringContaining("负责人\n（盖章）"));
    expect(value).toEqual(expect.stringContaining("\n联系电话"));
    for (const text of ["编辑", "私有值", "选项", "草稿", "隐藏字段", "图标说明", "辅助提示"]) expect(value).not.toContain(text);
    expect(sheet.getCell("A1").alignment.wrapText).toBe(true);
    expect(element.innerHTML).toBe(original);
  });

  it("异步生成使用调用时快照，不混入立即切换后的数据与行列结构", async () => {
    const element = table("<thead><tr><th colspan=\"2\">导出时标题</th></tr></thead><tbody><tr><td>导出时数据</td><td>原值</td></tr></tbody>");
    const pending = buildLedgerSpreadsheet(element, "数据快照");
    element.innerHTML = "<tbody><tr><td>切换后数据</td><td>新增列</td><td>第三列</td></tr><tr><td colspan=\"3\">新结果第二行</td></tr></tbody><tfoot><tr><td colspan=\"3\">新增备注</td></tr></tfoot>";
    const sheet = await readSpreadsheet(await pending);
    expect(sheet.rowCount).toBe(2);
    expect(sheet.columnCount).toBe(2);
    expect(sheet.model.merges).toEqual(["A1:B1"]);
    expect(sheet.getCell("A1").value).toBe("导出时标题");
    expect(sheet.getCell("A2").value).toBe("导出时数据");
    expect(sheet.getCell("B2").value).toBe("原值");
    expect(element.rows[0]!.cells[0]!.textContent).toBe("切换后数据");
    expect(element.rows).toHaveLength(3);
  });

  it.each([
    ["街道台账.xlsx", "街道台账.xlsx"], ["街道台账.xml", "街道台账.xlsx"], ["街道台账.XLS", "街道台账.xlsx"],
    ["街道/台账:测试.xlsx", "街道_台账_测试.xlsx"], ["", "台账.xlsx"],
  ])("下载 %s 为真实 XLSX，并提供正确文件名与 MIME", async (requested, expected) => {
    await exportLedgerTable(table("<tbody><tr><td>正式数值</td></tr></tbody>"), requested);
    expect(downloadBlob).toHaveBeenCalledExactlyOnceWith(expect.any(Blob), expected);
    const [blob] = vi.mocked(downloadBlob).mock.calls[0]!;
    expect(blob.type).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    const sheet = await readSpreadsheet(await readBlob(blob));
    expect(sheet.getCell("A1").value).toBe("正式数值");
  });

  it.each(["", "<tbody><tr></tr></tbody>"])("无可导出单元格时异步拒绝且不触发下载：%j", async (markup) => {
    await expect(buildLedgerSpreadsheet(table(markup), "台账")).rejects.toThrow("当前没有可导出的报表");
    await expect(exportLedgerTable(table(markup), "台账.xlsx")).rejects.toThrow("当前没有可导出的报表");
    expect(downloadBlob).not.toHaveBeenCalled();
  });
});
