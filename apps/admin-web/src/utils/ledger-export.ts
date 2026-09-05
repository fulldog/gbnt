import { downloadBlob } from "./download";

const XML_NAMESPACE = "urn:schemas-microsoft-com:office:spreadsheet";

function escapeXml(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function cellText(cell: HTMLTableCellElement): string {
  // 不导出交互控件或隐藏辅助文案，仅保留当前正式表格的展示值。
  const copy = cell.cloneNode(true) as HTMLTableCellElement;
  copy.querySelectorAll("button,input,select,textarea,[aria-hidden='true'],.sr-only").forEach((node) => node.remove());
  copy.querySelectorAll("br").forEach((node) => node.replaceWith("\n"));
  return (copy.textContent ?? "").trim();
}

/** 将可见报表转换为 Excel 2003 XML，保留行列合并；不将用户输入解释为公式。 */
export function buildLedgerSpreadsheet(table: HTMLTableElement, sheetName: string): string {
  const rows = Array.from(table.rows);
  if (!rows.length) throw new Error("当前没有可导出的报表");
  // 记录前面 rowspan 占用的行，确保下一个单元格的 Excel 列号正确。
  const occupiedUntil: number[] = [];
  let columnCount = 0;
  const rowXml = rows.map((row, rowIndex) => {
    let column = 0;
    const cells = Array.from(row.cells).map((cell) => {
      while ((occupiedUntil[column] ?? 0) > rowIndex) column++;
      const across = Math.max(1, cell.colSpan);
      const group = row.parentElement as HTMLTableSectionElement;
      const groupRemaining = group.rows ? group.rows.length - row.sectionRowIndex : 1;
      const down = cell.rowSpan === 0 ? groupRemaining : Math.max(1, cell.rowSpan);
      const index = column + 1;
      for (let offset = 0; offset < across; offset++) occupiedUntil[column + offset] = rowIndex + down;
      column += across;
      columnCount = Math.max(columnCount, column);
      const style = row.parentElement === table.tHead
        ? (rowIndex === 0 ? "Title" : "Header")
        : row.parentElement === table.tFoot ? "Footnote" : "Default";
      const merge = `${across > 1 ? ` ss:MergeAcross="${across - 1}"` : ""}${down > 1 ? ` ss:MergeDown="${down - 1}"` : ""}`;
      // 始终导出 String：手机号前导零不丢失，=、+、@ 等前缀不能变成公式。
      return `<Cell ss:Index="${index}" ss:StyleID="${style}"${merge}><Data ss:Type="String">${escapeXml(cellText(cell))}</Data></Cell>`;
    }).join("");
    const height = row.parentElement === table.tHead ? (rowIndex === 0 ? 40 : 48) : 30;
    return `<Row ss:AutoFitHeight="1" ss:Height="${height}">${cells}</Row>`;
  }).join("\n");
  const columns = Array.from(table.querySelectorAll("colgroup col"));
  const columnXml = Array.from({ length: columnCount }, (_, index) => {
    const declared = Number.parseFloat((columns[index] as HTMLElement | undefined)?.style.width ?? "");
    const width = Number.isFinite(declared) && declared > 0 ? declared * 0.75 : 80;
    return `<Column ss:Index="${index + 1}" ss:Width="${Math.min(400, Math.max(35, width))}"/>`;
  }).join("");
  const name = sheetName.replace(/[\\/?:*\[\]]/g, " ").replace(/^'+|'+$/g, "").trim().slice(0, 31) || "报表";
  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="${XML_NAMESPACE}" xmlns:ss="${XML_NAMESPACE}" xmlns:x="urn:schemas-microsoft-com:office:excel">
<Styles>
  <Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/><Font ss:FontName="Microsoft YaHei" ss:Size="10"/><Borders>${["Left", "Right", "Top", "Bottom"].map((position) => `<Border ss:Position="${position}" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D1D5DB"/>`).join("")}</Borders></Style>
  <Style ss:ID="Title"><Font ss:FontName="Microsoft YaHei" ss:Size="14" ss:Bold="1"/></Style>
  <Style ss:ID="Header"><Font ss:FontName="Microsoft YaHei" ss:Size="10" ss:Bold="1"/><Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/></Style>
  <Style ss:ID="Footnote"><Alignment ss:Horizontal="Left" ss:Vertical="Center" ss:WrapText="1"/></Style>
</Styles>
<Worksheet ss:Name="${escapeXml(name)}"><Table>${columnXml}${rowXml}</Table>
<WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><PageSetup><Layout x:Orientation="Landscape"/></PageSetup><FitToPage/><Print><FitWidth>1</FitWidth><FitHeight>0</FitHeight></Print></WorksheetOptions>
</Worksheet></Workbook>`;
}

/** 使用真实 .xml 扩展名，Excel/WPS 可打开并另存为 .xlsx；不伪装二进制格式。 */
export function exportLedgerTable(table: HTMLTableElement, filename: string): void {
  const content = buildLedgerSpreadsheet(table, filename);
  const safeName = filename.replace(/[\\/:*?"<>|\u0000-\u001F]/g, "_").replace(/\.(?:xlsx?|xml)$/i, "").trim() || "台账";
  downloadBlob(new Blob([content], { type: "application/xml;charset=utf-8" }), `${safeName}.xml`);
}
