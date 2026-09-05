<script setup lang="ts">
import type { SurveyLedgerReportRow } from "@/api/ledger-report-types";
import { ledgerCell, SURVEY_COLUMN_WIDTHS } from "@/utils/ledger-sheet";
import "./ledger-sheet.css";

const { rows, title, notes = [], emptyText = "当前筛选条件下暂无排查汇总数据" } = defineProps<{ rows: SurveyLedgerReportRow[]; title: string; notes?: string[]; emptyText?: string }>();
const stickyFields = ["street_name", "village_name", "natural_village", "survey_done"] as const;
const stickyOffsets = [0, 140, 280, 380];
const quantityFields = ["well_inspected", "well_normal", "well_problem_count", "bridge_inspected", "bridge_problem_count", "road_inspected", "road_problem_count", "well_problem_count", "well_rectified_count", "bridge_problem_count", "bridge_rectified_count", "road_problem_count", "road_rectified_count"] as const;
</script>

<template>
  <table class="ledger-sheet ledger-sheet--survey" aria-label="街道排查汇总">
    <colgroup><col v-for="(width, index) in SURVEY_COLUMN_WIDTHS" :key="index" :style="{ width: `${width}px` }"></colgroup>
    <thead>
      <tr class="ledger-title-row"><th colspan="22">{{ title }}</th></tr>
      <tr>
        <th rowspan="4" class="ledger-sticky-col" style="left: 0" scope="col">街道</th>
        <th rowspan="4" class="ledger-sticky-col" style="left: 140px" scope="col">新村/社区</th>
        <th rowspan="4" class="ledger-sticky-col" style="left: 280px" scope="col">自然村</th>
        <th rowspan="4" class="ledger-sticky-col ledger-sticky-last" style="left: 380px" scope="col">是否全面完成排查（是/否）</th>
        <th colspan="7" scope="colgroup">机井、桥涵、道路</th><th colspan="6" scope="colgroup">排查整改情况（个）</th><th colspan="4" scope="colgroup">运行管护排查联系人</th><th rowspan="4" scope="col">负责人签字：<br>（盖章）</th>
      </tr>
      <tr>
        <th rowspan="3" scope="col">已排查机井（泵站）总数（眼）</th><th rowspan="3" scope="col">其中运行正常机井（泵站）</th><th rowspan="3" scope="col">发现问题总数（个）</th>
        <th rowspan="3" scope="col">已排查桥、涵、闸（数）</th><th rowspan="3" scope="col">发现桥、涵、闸问题（数）</th><th rowspan="3" scope="col">已排查道路（数）</th><th rowspan="3" scope="col">发现道路问题（数）</th>
        <th colspan="2" rowspan="2" scope="colgroup">机井</th><th colspan="2" rowspan="2" scope="colgroup">桥涵</th><th colspan="2" rowspan="2" scope="colgroup">道路</th><th colspan="4" rowspan="2" scope="colgroup">排查人：社区、村</th>
      </tr>
      <tr class="ledger-survey-header-spacer"></tr>
      <tr><template v-for="group in ['well', 'bridge', 'road']" :key="group"><th scope="col">问题数量</th><th scope="col">整改数量</th></template><th colspan="4" scope="colgroup">联系电话：</th></tr>
    </thead>
    <tbody>
      <tr v-for="row in rows" :key="row.row_key">
        <td v-for="(field, index) in stickyFields" :key="field" class="ledger-sticky-col" :class="{ 'ledger-sticky-last': index === 3, 'ledger-missing': row[field] == null }" :style="{ left: `${stickyOffsets[index]}px` }" :title="row[field] == null ? '暂无可核验数据，待采集' : undefined">{{ ledgerCell(row[field]) }}</td>
        <td v-for="(field, index) in quantityFields" :key="`${field}-${index}`" :class="{ 'ledger-missing': row[field] == null }" :title="row[field] == null ? '暂无可核验数据，待采集' : undefined">{{ ledgerCell(row[field]) }}</td>
        <td class="ledger-missing" title="报表排查联系人尚未采集">{{ ledgerCell(row.contact_name) }}</td><td colspan="3" class="ledger-missing" title="报表联系电话尚未采集">{{ ledgerCell(row.contact_phone) }}</td><td class="ledger-missing" title="签字盖章尚未采集">{{ ledgerCell(row.leader_sign) }}</td>
      </tr>
      <tr v-if="!rows.length" class="ledger-empty"><td colspan="22">{{ emptyText }}</td></tr>
    </tbody>
    <tfoot>
      <tr class="ledger-foot-row"><td colspan="22">注：排查范围是2010年以来高标范围内所有机井、桥涵、道路。上报表格加盖所属街道办事处公章及主要负责人及分管负责人签字。</td></tr>
      <tr v-for="note in notes" :key="note" class="ledger-foot-row"><td colspan="22">数据口径：{{ note }}</td></tr>
    </tfoot>
  </table>
</template>
