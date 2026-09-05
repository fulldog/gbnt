<script setup lang="ts">
import type { OrgOption } from "@/api/types";
import { ElMessage } from "element-plus";
import { computed, onMounted, shallowRef } from "vue";
import { useAdminApi } from "@/api/runtime";
import AsyncError from "@/components/AsyncError.vue";
import LedgerFilters from "@/components/ledger/LedgerFilters.vue";
import LedgerReportFrame from "@/components/ledger/LedgerReportFrame.vue";
import SurveyLedgerSheet from "@/components/ledger/SurveyLedgerSheet.vue";
import { useLatestQuery } from "@/composables/useLatestQuery";
import { useLedgerReport } from "@/composables/useLedgerReport";
import { exportLedgerTable } from "@/utils/ledger-export";
import { composeSurveyRow } from "@/utils/ledger-report-merge";
import { ledgerDateNote, ledgerExportName } from "@/utils/ledger-report-query";
import { errorMessage } from "@/utils/error";

const api = useAdminApi();
const streetOrgId = shallowRef<number>();
const dateRange = shallowRef<[string, string]>();
const { data: streets, loading: optionsLoading, loadError: optionsError, run: loadOrgs } = useLatestQuery<OrgOption[]>({
  initial: () => [],
  load: () => api.ledger.listSurveyOrgOptions(),
  errorMessage: "街道选项加载失败，请重试后选择街道",
});
const { data: report, loading, loadError, hasLoaded, run: load } = useLedgerReport({
  readQuery: () => ({ street_org_id: streetOrgId.value, date_from: dateRange.value?.[0], date_to: dateRange.value?.[1] }),
  loadRows: api.ledger.getSurveyRows,
  loadStatistics: api.ledger.getSurveyStatistics,
  compose: composeSurveyRow,
  errorMessage: "排查汇总加载失败",
});
const rows = computed(() => report.value?.rows ?? []);
const notes = computed(() => report.value ? [ledgerDateNote(report.value.query), ...report.value.notes] : undefined);
const canExport = computed(() => hasLoaded.value && !loading.value && !loadError.value && rows.value.length > 0);
const title = computed(() => {
  const selectedId = report.value?.query.street_org_id;
  const selectedName = selectedId
    ? rows.value.find((row) => row.street_org_id === selectedId)?.street_name
      || streets.value.find((org) => org.id === selectedId)?.name
    : "";
  return `聊城经济技术开发区高标准农田建设项目${selectedName || "街道"}机井（泵站）、桥涵、道路排查汇总台账`;
});
const emptyText = computed(() => loading.value || (!hasLoaded.value && !loadError.value) ? "正在加载排查汇总…" : loadError.value ? "排查汇总加载失败，请重新加载" : "当前筛选条件下暂无排查汇总数据");

function reset(): void {
  streetOrgId.value = undefined;
  dateRange.value = undefined;
  void load();
}
function exportReport(table: HTMLTableElement): void {
  if (!canExport.value || !report.value) return;
  try { exportLedgerTable(table, ledgerExportName("街道排查汇总", report.value.query)); }
  catch (error) { ElMessage.error(errorMessage(error, "汇总导出失败，请重试")); }
}
onMounted(() => { void Promise.all([loadOrgs(), load()]); });
</script>

<template>
  <LedgerReportFrame title="街道排查汇总" :loading="loading" :export-disabled="!canExport" @refresh="load" @export="exportReport">
    <template #filters><LedgerFilters v-model:street-org-id="streetOrgId" v-model:date-range="dateRange" :streets="streets" :loading="optionsLoading" :unavailable="Boolean(optionsError)" @search="load" @reset="reset" /></template>
    <template #errors>
      <AsyncError v-if="optionsError" :message="optionsError" @retry="loadOrgs" />
      <AsyncError v-if="loadError" :message="loadError" @retry="load" />
    </template>
    <template #notice>
      <p class="ledger-report-notice">按上报日期筛选。问题、整改数量来自有效上报记录，不是设施总量；— 表示尚未采集或无法核验，不代表 0。</p>
    </template>
    <SurveyLedgerSheet :rows="rows" :title="title" :notes="notes" :empty-text="emptyText" />
  </LedgerReportFrame>
</template>
