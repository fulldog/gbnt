import type { StreetLedgerReportRow } from "@/api/ledger-report-types";

export const STREET_COLUMN_WIDTHS = [40, 70, 85, 100, 85, 70, 70, 90, 80, 80, 70, 70, 70, 70, 155, 145];
export const SURVEY_COLUMN_WIDTHS = [140, 140, 100, 100, 120, 100, 100, 120, 100, 100, 80, 80, 80, 80, 80, 80, 60, 60, 60, 60, 60, 100];

export function ledgerCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "是" : "否";
  return String(value);
}

/** 仅合并连续且属于同一上级分组的行，未知行政区不得跨组织合并。 */
export function streetRowSpans(rows: readonly StreetLedgerReportRow[]) {
  const spans = rows.map(() => ({ year: 0, street: 0, village: 0 }));
  const keys = rows.map((row) => {
    const year = String(row.project_year ?? "unknown");
    const street = `${year}:${row.street_org_id ?? `unknown-${row.org_id}`}`;
    const village = `${street}:${row.village_org_id ?? `unknown-${row.org_id}`}`;
    return { year, street, village };
  });
  for (const field of ["year", "street", "village"] as const) {
    let start = 0;
    while (start < rows.length) {
      let end = start + 1;
      while (end < rows.length && keys[end]![field] === keys[start]![field]) end += 1;
      spans[start]![field] = end - start;
      start = end;
    }
  }
  return spans;
}
