<script setup lang="ts">
import type { StreetLedgerReportRow } from "@/api/ledger-report-types";
import { computed } from "vue";
import { ledgerCell, STREET_COLUMN_WIDTHS, streetRowSpans } from "@/utils/ledger-sheet";
import "./ledger-sheet.css";

const { rows, title, emptyText = "当前筛选条件下暂无台账数据" } = defineProps<{ rows: StreetLedgerReportRow[]; title: string; emptyText?: string }>();
const spans = computed(() => streetRowSpans(rows));
const columnCount = STREET_COLUMN_WIDTHS.length;
const quantityFields = ["well_handover", "well_report_count", "bridge_handover", "bridge_report_count", "road_km", "road_tree_survive", "forest_handover", "forest_existing", "transformer_handover", "transformer_report_count", "signer", "phone"] as const;
</script>

<template>
  <table class="ledger-sheet ledger-sheet--street" aria-label="街道台账">
    <colgroup><col v-for="(width, index) in STREET_COLUMN_WIDTHS" :key="index" :style="{ width: `${width}px` }"></colgroup>
    <thead>
      <tr class="ledger-title-row"><th :colspan="columnCount">{{ title }}</th></tr>
      <tr>
        <th rowspan="3" scope="col">序号</th><th rowspan="3" scope="col">建设年份</th><th rowspan="3" scope="col">街道</th>
        <th rowspan="3" scope="col">新村/社区</th><th rowspan="3" scope="col">自然村</th><th :colspan="quantityFields.length" scope="colgroup" class="ledger-right-edge">村建设项目上报情况</th>
      </tr>
      <tr>
        <th colspan="2" scope="colgroup">机井</th><th colspan="2" scope="colgroup">桥、涵、闸</th><th colspan="2" scope="colgroup">道路</th>
        <th colspan="2" scope="colgroup">独立林网</th><th colspan="2" scope="colgroup">变压器</th><th rowspan="2" scope="col">负责人签字及村委盖章</th><th rowspan="2" scope="col" class="ledger-right-edge">电话</th>
      </tr>
      <tr>
        <template v-for="group in ['well', 'bridge']" :key="group"><th scope="col">移交数量</th><th scope="col">已上报数量<br>（条）</th></template>
        <th scope="col">已上报长度<br>（千米）</th><th scope="col">附属树木存活数<br>（棵）</th>
        <th scope="col">移交株数<br>（株）</th><th scope="col">现有株数<br>（株）</th>
        <th scope="col">移交数量</th><th scope="col">已上报数量<br>（条）</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="(row, index) in rows" :key="row.row_key">
        <td>{{ index + 1 }}</td>
        <td v-if="spans[index]!.year" :rowspan="spans[index]!.year">{{ ledgerCell(row.project_year) }}</td>
        <td v-if="spans[index]!.street" :rowspan="spans[index]!.street">{{ ledgerCell(row.street_name) }}</td>
        <td v-if="spans[index]!.village" :rowspan="spans[index]!.village">{{ ledgerCell(row.village_name) }}</td>
        <td :title="row.natural_village == null ? '自然村尚未采集' : undefined">{{ ledgerCell(row.natural_village) }}</td>
        <td v-for="field in quantityFields" :key="field" :class="{ 'ledger-missing': row[field] == null }" :title="row[field] == null ? '未采集、无对应记录或数据不完整' : undefined">{{ ledgerCell(row[field]) }}</td>
      </tr>
      <tr v-if="!rows.length" class="ledger-empty"><td :colspan="columnCount">{{ emptyText }}</td></tr>
    </tbody>
    <tfoot>
      <tr class="ledger-foot-row"><td :colspan="columnCount">上报表格加盖所属街道办事处公章及主要负责人及分管负责人签字。</td></tr>
    </tfoot>
  </table>
</template>
