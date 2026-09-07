import { mount } from "@vue/test-utils";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import StreetLedgerSheet from "@/components/ledger/StreetLedgerSheet.vue";
import SurveyLedgerSheet from "@/components/ledger/SurveyLedgerSheet.vue";
import { ledgerCell, streetRowSpans, SURVEY_COLUMN_WIDTHS } from "@/utils/ledger-sheet";
import { streetReportRow, surveyReportRow } from "./fixtures/ledger-report";
import { goldenQuery, goldenStreetParts, goldenSurveyParts } from "./fixtures/ledger-report-parts";
import { composeStreetRow, composeSurveyRow, mergeLedgerParts } from "@/utils/ledger-report-merge";
import { buildLedgerSpreadsheet } from "@/utils/ledger-export";
import { ledgerDateNote } from "@/utils/ledger-report-query";

/** 回读真实 XLSX，断言工作簿内容而非导出工具的内部序列化实现。 */
async function readSpreadsheet(table: HTMLTableElement): Promise<ExcelJS.Worksheet> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await buildLedgerSpreadsheet(table, "黄金报表"));
  expect(workbook.worksheets).toHaveLength(1);
  return workbook.worksheets[0]!;
}

/** 展开 HTML 跨行/跨列表头，防止某一行错位或覆盖已有合并格。 */
function verifyGrid(table: HTMLTableElement, columnCount: number): void {
  const occupied: boolean[][] = [];
  Array.from(table.rows).forEach((row, rowIndex) => {
    occupied[rowIndex] ??= [];
    let column = 0;
    for (const cell of Array.from(row.cells)) {
      while (occupied[rowIndex]![column]) column += 1;
      for (let y = 0; y < cell.rowSpan; y += 1) {
        occupied[rowIndex + y] ??= [];
        for (let x = 0; x < cell.colSpan; x += 1) {
          expect(occupied[rowIndex + y]![column + x], `第 ${rowIndex + 1} 行合并单元格重叠`).not.toBe(true);
          occupied[rowIndex + y]![column + x] = true;
        }
      }
      column += cell.colSpan;
    }
    expect(occupied[rowIndex]!.filter(Boolean)).toHaveLength(columnCount);
  });
}

describe("Excel 式台账结构", () => {
  it("G1 黄金报表在页面与 XLSX 保留 17/22 列人工预期，不展示或导出统计口径", async () => {
    const street = goldenStreetParts();
    const survey = goldenSurveyParts();
    const streetReport = mergeLedgerParts(goldenQuery, street.base, street.statistics, composeStreetRow);
    const surveyReport = mergeLedgerParts(goldenQuery, survey.base, survey.statistics, composeSurveyRow);
    const streetWrapper = mount(StreetLedgerSheet, { props: { rows: streetReport.rows, title: "测试街道台账" } });
    const surveyWrapper = mount(SurveyLedgerSheet, { props: { rows: surveyReport.rows, title: "测试街道排查" } });
    expect(streetWrapper.findAll("tbody tr")).toHaveLength(2);
    expect(surveyWrapper.findAll("tbody tr")).toHaveLength(1);
    const streetCells = streetWrapper.findAll("tbody tr").map((row) => row.findAll("td").map((cell) => cell.text()));
    expect(streetCells[0]).toContain("1.75"); expect(streetCells[0]).toContain("100"); expect(streetCells[0]).toContain("0");
    expect(streetCells[1]).toContain("2024"); expect(streetCells[1]).toContain("2");
    const surveyCells = surveyWrapper.findAll("tbody td").map((cell) => cell.text());
    expect(surveyCells[6]).toBe("2"); expect(surveyCells[12]).toBe("1");
    expect(surveyCells[4]).toBe("—");
    for (const [wrapper, columns, title, notes] of [
      [streetWrapper, 17, "测试街道台账", streetReport.notes],
      [surveyWrapper, 22, "测试街道排查", surveyReport.notes],
    ] as const) {
      verifyGrid(wrapper.get("table").element, columns);
      expect(wrapper.findAll("tfoot tr")).toHaveLength(1);
      expect(wrapper.find('[title*="口径"]').exists()).toBe(false);
      const sheet = await readSpreadsheet(wrapper.get("table").element);
      expect(sheet.columnCount).toBe(columns);
      expect(sheet.columns).toHaveLength(columns);
      expect(sheet.rowCount).toBe(7);
      const exportedText: string[] = [];
      sheet.eachRow((row) => row.eachCell((cell) => exportedText.push(cell.text)));
      for (const text of [wrapper.text(), exportedText.join("\n")]) {
        expect(text).toContain(title);
        expect(text).toContain("上报表格加盖所属街道办事处公章及主要负责人及分管负责人签字。");
        if (columns === 22) expect(text).toContain("注：排查范围是2010年以来高标范围内所有机井、桥涵、道路。");
        for (const note of ["统计口径", "数据口径", "上报日期", ledgerDateNote(goldenQuery), ...notes]) {
          expect(text).not.toContain(note);
        }
      }
      const lastColumn = columns === 17 ? "Q" : "V";
      expect(sheet.model.merges).toEqual(expect.arrayContaining([`A1:${lastColumn}1`, `A${sheet.rowCount}:${lastColumn}${sheet.rowCount}`]));
      expect(sheet.getCell("A1").value).toBe(title);
      const bodyValues = (row: number) => Array.from({ length: columns }, (_, column) => sheet.getCell(row, column + 1).value);
      if (columns === 17) {
        expect(bodyValues(5)).toEqual(["1", "2023", "测试街道", "测试新村", "—", "—", "3", "—", "0", "1.75", "30", "100", "0", "—", "0", "—", "—"]);
        expect(bodyValues(6)).toEqual(["2", "2024", "测试街道", "测试新村", "—", "—", "0", "—", "0", "2", "0", "—", "—", "—", "0", "—", "—"]);
        expect(sheet.getCell("G4").value).toBe("已上报数量\n（条）");
        expect(sheet.getCell("K4").value).toBe("附属树木存活数\n（棵）");
        expect(sheet.getCell("L3").value).toBe("独立林网");
      } else {
        expect(bodyValues(6)).toEqual(["测试街道", "测试新村", "—", "—", "—", "—", "2", "—", "0", "—", "0", "2", "1", "0", "0", "0", "0", "—", "—", "—", "—", "—"]);
        expect(sheet.model.merges).toContain("S6:U6");
        expect(sheet.getCell("V6").value).toBe("—");
      }
      wrapper.unmount();
    }
  });

  it("街道台账在页面与 XLSX 保留 17 列、三层表头、整行标题和分组跨行合并", async () => {
    const rows = [
      streetReportRow(),
      streetReportRow({ row_key: "2023:4", org_id: 4 }),
      streetReportRow({ row_key: "2024:3", project_year: 2024 }),
    ];
    const wrapper = mount(StreetLedgerSheet, { props: { rows, title: "建设项目北城街道台账" } });
    expect(wrapper.findAll("col")).toHaveLength(17);
    expect(wrapper.findAll("thead tr")).toHaveLength(4);
    expect(wrapper.get("thead tr:first-child th").attributes("colspan")).toBe("17");
    expect(wrapper.get("tbody tr:first-child td:nth-child(2)").attributes("rowspan")).toBe("2");
    expect(wrapper.get("tbody tr:first-child td:nth-child(3)").attributes("rowspan")).toBe("2");
    expect(wrapper.get("tbody tr:first-child td:nth-child(4)").attributes("rowspan")).toBe("2");
    expect(wrapper.findAll("tfoot tr")).toHaveLength(1);
    expect(wrapper.get("tfoot").text()).toBe("上报表格加盖所属街道办事处公章及主要负责人及分管负责人签字。");
    expect(wrapper.text()).not.toContain("数据口径");
    expect(wrapper.text()).toContain("1.25");
    expect(wrapper.find("input").exists()).toBe(false);
    verifyGrid(wrapper.get("table").element, 17);
    const sheet = await readSpreadsheet(wrapper.get("table").element);
    expect(sheet.columnCount).toBe(17);
    expect(sheet.model.merges).toEqual(expect.arrayContaining(["A1:Q1", "A2:A4", "F2:Q2", "F3:G3", "J3:K3", "B5:B6", "C5:C6", "D5:D6", "A8:Q8"]));
    expect(sheet.getCell("B6").master.address).toBe("B5");
    expect(sheet.getCell("E6").value).toBe("—");
    expect(sheet.getCell("J6").value).toBe("1.25");
    expect(sheet.getCell("Q6").value).toBe("—");
    expect(sheet.getCell("B7").value).toBe("2024");
    wrapper.unmount();
  });

  it("排查汇总在页面与 XLSX 保留 22 列、四层表头、左四列固定以及联系人合并格", async () => {
    const wrapper = mount(SurveyLedgerSheet, { props: { rows: [surveyReportRow()], title: "排查汇总台账" } });
    expect(wrapper.findAll("col")).toHaveLength(22);
    expect(wrapper.findAll("thead tr")).toHaveLength(5);
    const sticky = wrapper.findAll("tbody .ledger-sticky-col");
    expect(sticky).toHaveLength(4);
    expect(sticky.map((cell) => (cell.element as HTMLElement).style.left)).toEqual(["0px", "140px", "280px", "380px"]);
    expect(SURVEY_COLUMN_WIDTHS.reduce((sum, width) => sum + width, 0)).toBe(2000);
    expect(wrapper.get("tbody td[colspan='3']").text()).toBe("—");
    expect(wrapper.get("tfoot").text()).toContain("2010年以来");
    verifyGrid(wrapper.get("table").element, 22);
    const sheet = await readSpreadsheet(wrapper.get("table").element);
    expect(sheet.columnCount).toBe(22);
    expect(sheet.model.merges).toEqual(expect.arrayContaining(["A1:V1", "A2:A5", "E3:E5", "L3:M4", "R3:U4", "R5:U5", "V2:V5", "S6:U6", "A7:V7"]));
    expect(sheet.getCell("V2").value).toBe("负责人签字：\n（盖章）");
    expect(sheet.getCell("L6").value).toBe("7");
    expect(sheet.getCell("M6").value).toBe("5");
    expect(sheet.getCell("T6").master.address).toBe("S6");
    expect(sheet.getCell("U6").master.address).toBe("S6");
    expect(sheet.getCell("V6").value).toBe("—");
    wrapper.unmount();
  });

  it("未知数据不伪造为零，零值正常展示，后端文本按文本转义", () => {
    const wrapper = mount(SurveyLedgerSheet, { props: {
      rows: [surveyReportRow({ street_name: "<script>alert(1)</script>", well_problem_count: 0, well_rectified_count: null })], title: "汇总",
    } });
    expect(wrapper.find("script").exists()).toBe(false);
    expect(wrapper.get("tbody tr").text()).toContain("<script>alert(1)</script>");
    const cells = wrapper.findAll("tbody td");
    expect(cells[3]!.text()).toBe("—");
    expect(cells[4]!.text()).toBe("—");
    expect(cells[6]!.text()).toBe("0");
    expect(cells[12]!.text()).toBe("—");
    expect(ledgerCell(false)).toBe("否");
    expect(ledgerCell(0)).toBe("0");
  });

  it("未知街道/新村按所属组织隔离，年份切换不跨组合并", () => {
    const rows = [
      streetReportRow({ street_org_id: null, village_org_id: null }),
      streetReportRow({ row_key: "2023:4", org_id: 4, street_org_id: null, village_org_id: null }),
      streetReportRow({ row_key: "2024:3", project_year: 2024 }),
    ];
    expect(streetRowSpans(rows)).toEqual([
      { year: 2, street: 1, village: 1 }, { year: 0, street: 1, village: 1 }, { year: 1, street: 1, village: 1 },
    ]);
  });

  it.each([["街道", StreetLedgerSheet, 17], ["汇总", SurveyLedgerSheet, 22]] as const)("%s 空报表仍保留完整表头与脚注", (_, component, columns) => {
    const wrapper = mount(component, { props: { rows: [], title: "空报表", emptyText: "加载失败，请重试" } });
    expect(wrapper.get("tbody td").attributes("colspan")).toBe(String(columns));
    expect(wrapper.get("tbody").text()).toBe("加载失败，请重试");
    verifyGrid(wrapper.get("table").element, columns);
  });
});
