import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import StreetLedgerSheet from "@/components/ledger/StreetLedgerSheet.vue";
import SurveyLedgerSheet from "@/components/ledger/SurveyLedgerSheet.vue";
import { ledgerCell, streetRowSpans, SURVEY_COLUMN_WIDTHS } from "@/utils/ledger-sheet";
import { streetReportRow, surveyReportRow } from "./fixtures/ledger-report";
import { goldenQuery, goldenStreetParts, goldenSurveyParts } from "./fixtures/ledger-report-parts";
import { composeStreetRow, composeSurveyRow, mergeLedgerParts } from "@/utils/ledger-report-merge";
import { buildLedgerSpreadsheet } from "@/utils/ledger-export";
import { ledgerDateNote } from "@/utils/ledger-report-query";

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
  it("G1 黄金报表在两页与实际导出 XML 中保留人工预期和日期口径", () => {
    const street = goldenStreetParts();
    const survey = goldenSurveyParts();
    const streetReport = mergeLedgerParts(goldenQuery, street.base, street.statistics, composeStreetRow);
    const surveyReport = mergeLedgerParts(goldenQuery, survey.base, survey.statistics, composeSurveyRow);
    const streetWrapper = mount(StreetLedgerSheet, { props: { rows: streetReport.rows, title: "测试街道台账", notes: [ledgerDateNote(goldenQuery), ...streetReport.notes] } });
    const surveyWrapper = mount(SurveyLedgerSheet, { props: { rows: surveyReport.rows, title: "测试街道排查", notes: [ledgerDateNote(goldenQuery), ...surveyReport.notes] } });
    expect(streetWrapper.findAll("tbody tr")).toHaveLength(2);
    expect(surveyWrapper.findAll("tbody tr")).toHaveLength(1);
    const streetCells = streetWrapper.findAll("tbody tr").map((row) => row.findAll("td").map((cell) => cell.text()));
    expect(streetCells[0]).toContain("1.75"); expect(streetCells[0]).toContain("100"); expect(streetCells[0]).toContain("0");
    expect(streetCells[1]).toContain("2024"); expect(streetCells[1]).toContain("2");
    const surveyCells = surveyWrapper.findAll("tbody td").map((cell) => cell.text());
    expect(surveyCells[6]).toBe("2"); expect(surveyCells[12]).toBe("1");
    expect(surveyCells[4]).toBe("—");
    for (const [wrapper, columns] of [[streetWrapper, 16], [surveyWrapper, 22]] as const) {
      verifyGrid(wrapper.get("table").element, columns);
      const xml = new DOMParser().parseFromString(buildLedgerSpreadsheet(wrapper.get("table").element, "黄金报表"), "application/xml");
      expect(xml.querySelector("parsererror")).toBeNull();
      const ns = "urn:schemas-microsoft-com:office:spreadsheet";
      expect(xml.getElementsByTagNameNS(ns, "Column")).toHaveLength(columns);
      expect(xml.documentElement.textContent).toContain("2026-09-01 至 2026-09-05");
      const rows = Array.from(xml.getElementsByTagNameNS(ns, "Row"));
      const firstBody = rows[columns === 16 ? 4 : 5]!;
      const values = Array.from(firstBody.getElementsByTagNameNS(ns, "Data")).map((cell) => cell.textContent);
      if (columns === 16) {
        expect(values).toContain("1.75"); expect(values).toContain("100"); expect(values).toContain("0");
      } else {
        expect(values[6]).toBe("2"); expect(values[12]).toBe("1"); expect(values[4]).toBe("—");
      }
      wrapper.unmount();
    }
  });

  it("街道台账保留 16 列、三层表头、整行标题和分组跨行合并", () => {
    const rows = [
      streetReportRow(),
      streetReportRow({ row_key: "2023:4", org_id: 4 }),
      streetReportRow({ row_key: "2024:3", project_year: 2024 }),
    ];
    const wrapper = mount(StreetLedgerSheet, { props: { rows, title: "建设项目北城街道台账", notes: ["移交字段尚未采集，不代表零。"] } });
    expect(wrapper.findAll("col")).toHaveLength(16);
    expect(wrapper.findAll("thead tr")).toHaveLength(4);
    expect(wrapper.get("thead tr:first-child th").attributes("colspan")).toBe("16");
    expect(wrapper.get("tbody tr:first-child td:nth-child(2)").attributes("rowspan")).toBe("2");
    expect(wrapper.get("tbody tr:first-child td:nth-child(3)").attributes("rowspan")).toBe("2");
    expect(wrapper.get("tbody tr:first-child td:nth-child(4)").attributes("rowspan")).toBe("2");
    expect(wrapper.get("tfoot").text()).toContain("公章");
    expect(wrapper.get("tfoot").text()).toContain("移交字段尚未采集，不代表零");
    expect(wrapper.text()).toContain("1.25");
    expect(wrapper.find("input").exists()).toBe(false);
    verifyGrid(wrapper.get("table").element, 16);
  });

  it("排查汇总保留 22 列、四层表头、左四列固定以及联系人合并格", () => {
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

  it.each([["街道", StreetLedgerSheet, 16], ["汇总", SurveyLedgerSheet, 22]] as const)("%s 空报表仍保留完整表头与脚注", (_, component, columns) => {
    const wrapper = mount(component, { props: { rows: [], title: "空报表", emptyText: "加载失败，请重试" } });
    expect(wrapper.get("tbody td").attributes("colspan")).toBe(String(columns));
    expect(wrapper.get("tbody").text()).toBe("加载失败，请重试");
    verifyGrid(wrapper.get("table").element, columns);
  });
});
