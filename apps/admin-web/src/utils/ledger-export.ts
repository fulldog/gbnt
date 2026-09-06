import { downloadBlob } from "./download";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function cleanText(value: string): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "");
}

function cellText(cell: HTMLTableCellElement): string {
  // 不导出交互控件或隐藏辅助文案，仅保留当前正式表格的展示值。
  const copy = cell.cloneNode(true) as HTMLTableCellElement;
  copy.querySelectorAll("button,input,select,textarea,[hidden],[aria-hidden='true'],.sr-only").forEach((node) => node.remove());
  copy.querySelectorAll("br").forEach((node) => node.replaceWith("\n"));
  return cleanText(copy.textContent ?? "").trim();
}

function worksheetName(value: string): string {
  const name = cleanText(value).replace(/[\\/?:*\[\]]/g, " ").trim().replace(/^'+|'+$/g, "").slice(0, 31).replace(/'+$/g, "").trim();
  return !name || name.toLowerCase() === "history" ? "报表" : name;
}

/** 生成真正的 XLSX 工作簿，保留多级表头、合并格、列宽、标题和备注。 */
export async function buildLedgerSpreadsheet(table: HTMLTableElement, sheetName: string): Promise<ArrayBuffer> {
  // 懒加载之前锁定本次展示快照；导出过程中切换筛选不影响文件内容。
  const snapshot = table.cloneNode(true) as HTMLTableElement;
  const rows = Array.from(snapshot.rows);
  if (!rows.some((row) => row.cells.length)) throw new Error("当前没有可导出的报表");
  if (rows.length > 1_048_576) throw new Error("报表超过 Excel 行数限制，请缩小筛选范围");

  // 仅在点击导出时加载浏览器版工作簿引擎，不加入管理后台首屏依赖。
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(worksheetName(sheetName), {
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    views: snapshot.tHead
      ? [{ state: "frozen", ySplit: snapshot.tHead.rows.length, showGridLines: false }]
      : [{ state: "normal", showGridLines: false }],
  });

  // 记录 rowspan 的占位，按 HTML 表格坐标定位后续单元格，不能直接逐行追加值。
  const occupiedUntil: number[] = [];
  let columnCount = 0;
  rows.forEach((row, rowIndex) => {
    const isHeader = row.parentElement === snapshot.tHead;
    const isTitle = isHeader && rowIndex === 0;
    const isFootnote = row.parentElement === snapshot.tFoot;
    sheet.getRow(rowIndex + 1).height = isHeader ? (isTitle ? 40 : 48) : 30;
    let column = 0;
    for (const cell of Array.from(row.cells)) {
      while ((occupiedUntil[column] ?? 0) > rowIndex) column++;
      const across = Math.max(1, cell.colSpan);
      const group = row.parentElement as HTMLTableSectionElement;
      const groupRemaining = group.rows ? group.rows.length - row.sectionRowIndex : 1;
      // rowspan=0 表示跨当前分节剩余行，不能越过 tbody 合并到下一分节或备注。
      const down = cell.rowSpan === 0 ? groupRemaining : Math.min(groupRemaining, Math.max(1, cell.rowSpan));
      if (column + across > 16_384) throw new Error("报表超过 Excel 列数限制");
      for (let offset = 0; offset < across; offset++) {
        if ((occupiedUntil[column + offset] ?? 0) > rowIndex) throw new Error("报表存在重叠合并单元格，无法导出");
        occupiedUntil[column + offset] = rowIndex + down;
      }

      const target = sheet.getCell(rowIndex + 1, column + 1);
      // 明确写入字符串，不推断数字或公式，保留电话前导零和原样展示的未知值“—”。
      target.value = cellText(cell);
      target.numFmt = "@";
      target.font = { name: "Microsoft YaHei", size: isTitle ? 14 : 10, bold: isHeader };
      target.alignment = { horizontal: isFootnote ? "left" : "center", vertical: "middle", wrapText: true };
      target.border = {
        left: { style: "thin", color: { argb: "FFD1D5DB" } },
        right: { style: "thin", color: { argb: "FFD1D5DB" } },
        top: { style: "thin", color: { argb: "FFD1D5DB" } },
        bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
      };
      if (isHeader && !isTitle) target.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
      if (across > 1 || down > 1) sheet.mergeCells(rowIndex + 1, column + 1, rowIndex + down, column + across);
      column += across;
      columnCount = Math.max(columnCount, column);
    }
  });

  const columns = Array.from(snapshot.querySelectorAll<HTMLTableColElement>("colgroup col"));
  for (let index = 0; index < columnCount; index++) {
    const declared = Number.parseFloat(columns[index]?.style.width ?? "");
    const pixels = Number.isFinite(declared) && declared > 0 ? declared : 110;
    // Excel 列宽以字符宽度计量，转换当前报表声明的像素宽度并限定合理范围。
    sheet.getColumn(index + 1).width = Math.min(57, Math.max(5, (pixels - 5) / 7));
  }
  if (snapshot.tHead?.rows.length) sheet.pageSetup.printTitlesRow = `1:${snapshot.tHead.rows.length}`;
  sheet.pageSetup.printArea = `A1:${sheet.getCell(rows.length, columnCount).address}`;

  const buffer = await workbook.xlsx.writeBuffer();
  // 复制为应用自有 ArrayBuffer，兼容浏览器和测试环境不同的 Buffer 实现。
  return new Uint8Array(buffer).buffer;
}

/** 以标准 Excel MIME 与 .xlsx 扩展名下载工作簿，不再输出 Excel 2003 XML。 */
export async function exportLedgerTable(table: HTMLTableElement, filename: string): Promise<void> {
  const safeName = filename.trim().replace(/[\\/:*?"<>|\u0000-\u001F]/g, "_").replace(/\.(?:xlsx?|xml)$/i, "").trim() || "台账";
  const content = await buildLedgerSpreadsheet(table, safeName);
  downloadBlob(new Blob([content], { type: XLSX_MIME }), `${safeName}.xlsx`);
}
