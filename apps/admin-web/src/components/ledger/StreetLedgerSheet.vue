<script setup lang="ts">
import type { StreetLedgerReportRow } from "@/api/ledger-report-types";
import { computed } from "vue";
import { ledgerCell, STREET_COLUMN_WIDTHS, streetRowSpans } from "@/utils/ledger-sheet";
import "./ledger-sheet.css";

const { rows, title, notes = [], emptyText = "当前筛选条件下暂无台账数据" } = defineProps<{ rows: StreetLedgerReportRow[]; title: string; notes?: string[]; emptyText?: string }>();
const spans = computed(() => streetRowSpans(rows));
const quantityFields = ["well_handover", "well_existing", "bridge_handover", "bridge_existing", "road_km", "forest_handover", "forest_existing", "transformer_handover", "transformer_existing", "signer", "phone"] as const;
</script>

<template>
  <table class="ledger-sheet ledger-sheet--street" aria-label="街道台账">
    <colgroup><col v-for="(width, index) in STREET_COLUMN_WIDTHS" :key="index" :style="{ width: `${width}px` }"></colgroup>
    <thead>
      <tr class="ledger-title-row"><th colspan="16">{{ title }}</th></tr>
      <tr>
        <th rowspan="3" scope="col">序号</th><th rowspan="3" scope="col">建设年份</th><th rowspan="3" scope="col">街道</th>
        <th rowspan="3" scope="col">新村/社区</th><th rowspan="3" scope="col">自然村</th><th colspan="11" scope="colgroup">村具体建设项目情况</th>
      </tr>
      <tr>
        <th colspan="2" scope="colgroup">机井</th><th colspan="2" scope="colgroup">桥、涵、闸</th><th rowspan="2" scope="col">路/千米</th>
        <th colspan="2" scope="colgroup">林网</th><th colspan="2" scope="colgroup">变压器</th><th rowspan="2" scope="col">负责人签字及村委盖章</th><th rowspan="2" scope="col">电话</th>
      </tr>
      <tr><template v-for="group in ['well', 'bridge', 'forest', 'transformer']" :key="group"><th scope="col">移交数量</th><th scope="col">现有数</th></template></tr>
    </thead>
    <tbody>
      <tr v-for="(row, index) in rows" :key="row.row_key">
        <td>{{ index + 1 }}</td>
        <td v-if="spans[index]!.year" :rowspan="spans[index]!.year">{{ ledgerCell(row.project_year) }}</td>
        <td v-if="spans[index]!.street" :rowspan="spans[index]!.street">{{ ledgerCell(row.street_name) }}</td>
        <td v-if="spans[index]!.village" :rowspan="spans[index]!.village">{{ ledgerCell(row.village_name) }}</td>
        <td :title="row.natural_village == null ? '自然村尚未采集' : undefined">{{ ledgerCell(row.natural_village) }}</td>
        <td v-for="field in quantityFields" :key="field" :class="{ 'ledger-missing': row[field] == null }" :title="row[field] == null ? '暂无可核验数据，待采集' : undefined">{{ ledgerCell(row[field]) }}</td>
      </tr>
      <tr v-if="!rows.length" class="ledger-empty"><td colspan="16">{{ emptyText }}</td></tr>
    </tbody>
    <tfoot>
      <tr class="ledger-foot-row"><td colspan="16">上报表格加盖所属街道办事处公章及主要负责人及分管负责人签字。</td></tr>
      <tr v-for="note in notes" :key="note" class="ledger-foot-row"><td colspan="16">数据口径：{{ note }}</td></tr>
    </tfoot>
  </table>
</template>
