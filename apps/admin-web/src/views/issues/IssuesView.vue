<script setup lang="ts">
import { ISSUE_STATUSES, ISSUE_TYPES, PROJECT_YEARS } from "@gbnt/api-client";
import type { Issue, IssueListQuery } from "@gbnt/api-client";
import { Plus } from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox, vLoading } from "element-plus";
import { computed, onMounted, onScopeDispose, reactive, shallowRef, useTemplateRef, watch } from "vue";
import { useAdminApi } from "@/api/runtime";
import type { AdminIssue, AdminIssueListResult, OrgOption } from "@/api/types";
import AsyncError from "@/components/AsyncError.vue";
import IssueStatusTag from "@/components/IssueStatusTag.vue";
import OrgTreeSelect from "@/components/OrgTreeSelect.vue";
import QueryPanel from "@/components/QueryPanel.vue";
import TableToolbar from "@/components/TableToolbar.vue";
import { ISSUE_STATUS_META, ISSUE_TYPE_LABELS } from "@/constants/issue";
import { useLatestQuery } from "@/composables/useLatestQuery";
import { useBusinessToday } from "@/composables/useBusinessToday";
import { usePermissionStore } from "@/stores/permission";
import { errorMessage } from "@/utils/error";
import { formatDateTime } from "@/utils/format";
import { displayOrg, displayUser } from "@/utils/display";
import { issueCountdownDisplay, issuePlanDateDisplay } from "@/utils/issue-date";
import ImportIssuesDialog from "./ImportIssuesDialog.vue";
import IssueDetailDrawer from "./IssueDetailDrawer.vue";
import IssueFormDialog from "./IssueFormDialog.vue";

interface IssueFilters {
  type: IssueListQuery["type"];
  status: IssueListQuery["status"];
  org_id?: number;
  project_year?: IssueListQuery["project_year"];
  keyword: string;
}

const tablePage = useTemplateRef<HTMLElement>("tablePage");
const filtersVisible = shallowRef(true);
const columns = [
  { key: "type", label: "类型" }, { key: "year", label: "年度" }, { key: "code", label: "设施编号" },
  { key: "org", label: "行政区划" }, { key: "address", label: "定位地址" }, { key: "reporter", label: "上报人" },
  { key: "assignee", label: "整改责任人" }, { key: "assigneePhone", label: "联系电话" },
  { key: "created", label: "排查日期" }, { key: "plan", label: "计划完成" },
  { key: "countdown", label: "倒计时" }, { key: "status", label: "状态" },
];
const visibleColumns = shallowRef(columns.map((column) => column.key));
const api = useAdminApi();
const permission = usePermissionStore();
const page = shallowRef(1);
const size = shallowRef(20);
const detailId = shallowRef<number>();
const formVisible = shallowRef(false);
const detailVisible = shallowRef(false);
const importVisible = shallowRef(false);
const editingIssue = shallowRef<AdminIssue | null>(null);
const filters = reactive<IssueFilters>({ type: "all", status: "all", keyword: "" });
let refreshSequence = 0;
onScopeDispose(() => { refreshSequence += 1; });
const today = useBusinessToday();
const { data: result, loading, loadError, hasLoaded, run: runList } = useLatestQuery<AdminIssueListResult>({
  initial: () => ({ list: [], total: 0, page: 1, size: 20 }),
  load: () => api.issues.list({
    type: filters.type,
    status: filters.status,
    org_id: filters.org_id,
    project_year: filters.project_year,
    keyword: filters.keyword.trim() || undefined,
    page: page.value,
    size: size.value,
  }),
  errorMessage: "专项整改列表加载失败",
});
const list = computed(() => result.value.list);
const total = computed(() => result.value.total);
const { data: orgs, loadError: orgError, hasLoaded: orgsReady, run: loadOrgs } = useLatestQuery<OrgOption[]>({
  initial: () => [],
  load: () => api.issues.listOrgOptions(),
  errorMessage: "组织候选加载失败",
});
const { data: detail, loading: detailLoading, loadError: detailError, run: loadDetail, invalidate: invalidateDetail } = useLatestQuery<AdminIssue | null>({
  initial: () => null,
  load: () => detailId.value ? api.issues.get(detailId.value) : Promise.resolve(null),
  errorMessage: "详情加载失败",
});

function isCancelled(error: unknown): boolean {
  return error === "cancel" || error === "close";
}

function rowClassName({ row }: { row: Issue }): string {
  return issueCountdownDisplay(row, today.value).overdue ? "is-overdue" : "";
}

function asIssue(row: unknown): AdminIssue {
  return row as AdminIssue;
}
async function load(): Promise<void> {
  if (await runList()) {
    const lastPage = Math.max(1, Math.ceil(total.value / size.value));
    if (page.value > lastPage) {
      page.value = lastPage;
      await runList();
    }
  }
}

function search(): void {
  page.value = 1;
  void load();
}

function reset(): void {
  filters.type = "all";
  filters.status = "all";
  filters.org_id = undefined;
  filters.project_year = undefined;
  filters.keyword = "";
  page.value = 1;
  void load();
}

function createIssue(): void {
  closeIssuePanels();
  editingIssue.value = null;
  formVisible.value = true;
}

function editIssue(issue: AdminIssue): void {
  closeIssuePanels();
  editingIssue.value = issue;
  formVisible.value = true;
}

function closeIssuePanels(): void {
  refreshSequence += 1;
  invalidateDetail();
  detailVisible.value = false;
  formVisible.value = false;
}

async function openDetail(issue: AdminIssue): Promise<void> {
  closeIssuePanels();
  detailId.value = issue.id;
  detailVisible.value = true;
  await loadDetail();
}

watch(detailVisible, (open) => {
  if (!open) invalidateDetail();
}, { flush: "sync" });

async function removeIssue(issue: Issue): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定删除 ${issue.issue_key} 吗？该操作会软删除记录。`, "删除确认", {
      confirmButtonText: "删除",
      cancelButtonText: "取消",
      type: "warning",
    });
    await api.issues.remove(issue.id);
    ElMessage.success("记录已删除");
    await load();
  } catch (error) {
    if (!isCancelled(error)) ElMessage.error(errorMessage(error, "删除失败"));
  }
}

async function handleSaved(issueId?: number): Promise<void> {
  const current = ++refreshSequence;
  // 写入响应仍为基础 Issue，展示字段以管理端 GET 的最新结果为准。
  await Promise.all([
    load(),
    issueId ? api.issues.get(issueId).then((fresh) => {
      if (current === refreshSequence && detailVisible.value && detailId.value === fresh.id) detail.value = fresh;
    }).catch((error: unknown) => {
      if (current === refreshSequence) ElMessage.warning(errorMessage(error, "操作成功，但最新详情加载失败，请重试"));
    }) : Promise.resolve(),
  ]);
}

onMounted(() => {
  void Promise.all([load(), loadOrgs()]);
});
</script>

<template>
  <div ref="tablePage" class="data-page">
    <QueryPanel v-show="filtersVisible" :loading="loading" @search="search" @reset="reset">
      <ElFormItem label="问题类型">
        <ElSelect v-model="filters.type"><ElOption label="全部类型" value="all" /><ElOption v-for="type in ISSUE_TYPES" :key="type" :label="ISSUE_TYPE_LABELS[type]" :value="type" /></ElSelect>
      </ElFormItem>
      <ElFormItem label="整改状态">
        <ElSelect v-model="filters.status"><ElOption label="全部状态" value="all" /><ElOption v-for="status in ISSUE_STATUSES" :key="status" :label="ISSUE_STATUS_META[status].label" :value="status" /></ElSelect>
      </ElFormItem>
      <template #advanced>
        <ElFormItem label="项目年度"><ElSelect v-model="filters.project_year" clearable placeholder="全部年度"><ElOption v-for="year in PROJECT_YEARS" :key="year" :label="`${year} 年`" :value="year" /></ElSelect></ElFormItem>
        <ElFormItem label="行政区划"><OrgTreeSelect v-model="filters.org_id" :orgs="orgs" :disabled="!orgsReady" placeholder="全部行政区划" /></ElFormItem>
        <ElFormItem label="关键字"><ElInput v-model="filters.keyword" clearable placeholder="问题编号、设施编号或地址" /></ElFormItem>
      </template>
    </QueryPanel>

    <AsyncError v-if="orgError" :message="orgError" @retry="loadOrgs" />
    <AsyncError v-if="loadError" :message="loadError" @retry="load" />

    <section class="data-card">
      <TableToolbar v-model:filters-visible="filtersVisible" v-model:visible-columns="visibleColumns" title="巡查清单" :columns="columns" :loading="loading" :target="() => tablePage" @refresh="load">
        <ElButton v-if="permission.can('web.rectify', 'create')" type="primary" :icon="Plus" @click="createIssue">新增排查</ElButton>
      </TableToolbar>
      <div class="data-table">
      <ElTable
        v-loading="loading"
        :data="list"
        row-key="id"
        :row-class-name="rowClassName"
        :empty-text="loadError ? '加载失败，请重试' : loading ? '正在加载…' : '暂无排查整改记录'"
        height="100%"
      >
        <ElTableColumn type="index" label="序号" width="60" align="center" :index="(index: number) => (page - 1) * size + index + 1" />
        <ElTableColumn prop="issue_key" label="问题编号" min-width="150" show-overflow-tooltip  align="center"/>
        <ElTableColumn v-if="visibleColumns.includes('type')" label="类型" width="100" align="center">
          <template #default="scope">{{ ISSUE_TYPE_LABELS[scope.row.type as Issue['type']] }}</template>
        </ElTableColumn>
        <ElTableColumn v-if="visibleColumns.includes('year')" prop="project_year" label="年度" width="80" align="center" />
        <ElTableColumn v-if="visibleColumns.includes('code')" prop="code" label="设施编号" min-width="120" show-overflow-tooltip  align="center"/>
        <ElTableColumn v-if="visibleColumns.includes('org')" label="行政区划" min-width="200" show-overflow-tooltip align="center">
          <template #default="scope">{{ displayOrg(scope.row.org_id, scope.row.org_path || scope.row.org_name) }}</template>
        </ElTableColumn>
        <ElTableColumn v-if="visibleColumns.includes('address')" prop="address" label="定位地址" min-width="220" show-overflow-tooltip  align="center"/>
        <ElTableColumn v-if="visibleColumns.includes('reporter')" label="上报人" min-width="100" align="center"><template #default="scope">{{ scope.row.reporter_name || displayUser(scope.row.report_user_id, scope.row.report_user_name) }}</template></ElTableColumn>
        <ElTableColumn v-if="visibleColumns.includes('assignee')" label="整改责任人" min-width="120" align="center"><template #default="scope">{{ displayUser(scope.row.assignee_user, scope.row.assignee_user_name) }}</template></ElTableColumn>
        <ElTableColumn v-if="visibleColumns.includes('assigneePhone')" label="联系电话" min-width="140" align="center"><template #default="scope">{{ scope.row.assignee_user_phone?.trim() || "—" }}</template></ElTableColumn>
        <ElTableColumn v-if="visibleColumns.includes('created')" label="排查日期" min-width="155" align="center"><template #default="scope">{{ formatDateTime(scope.row.created_at) }}</template></ElTableColumn>
        <ElTableColumn v-if="visibleColumns.includes('plan')" label="计划完成" min-width="135" align="center">
          <template #default="scope">
            {{ issuePlanDateDisplay(scope.row.plan_date) }}
          </template>
        </ElTableColumn>
        <ElTableColumn v-if="visibleColumns.includes('countdown')" label="倒计时" min-width="150" align="center">
          <template #default="scope">
            <span :class="{ 'text-red-700': issueCountdownDisplay(asIssue(scope.row), today).overdue }">{{ issueCountdownDisplay(asIssue(scope.row), today).text }}</span>
          </template>
        </ElTableColumn>
        <ElTableColumn v-if="visibleColumns.includes('status')" label="状态" width="100" align="center"><template #default="scope"><IssueStatusTag :status="scope.row.status" /></template></ElTableColumn>
        <ElTableColumn label="操作" width="170" fixed="right" align="center">
          <template #default="scope">
            <div class="table-actions">
              <ElButton link type="primary" :loading="detailLoading && detailId === scope.row.id" @click="openDetail(asIssue(scope.row))">查看</ElButton>
              <ElButton v-if="permission.can('web.rectify', 'edit')" link type="primary" @click="editIssue(asIssue(scope.row))">编辑</ElButton>
              <ElButton
                v-if="permission.can('web.rectify', 'delete')"
                link
                type="danger"
                @click="removeIssue(asIssue(scope.row))"
              >删除</ElButton>
            </div>
          </template>
        </ElTableColumn>
      </ElTable>
      </div>
      <div class="data-pagination">
        <ElPagination
          v-if="hasLoaded"
          v-model:current-page="page"
          v-model:page-size="size"
          :total="total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          @current-change="load"
          @size-change="page = 1; load()"
        />
      </div>
    </section>

    <IssueFormDialog v-model="formVisible" :issue="editingIssue" :orgs="orgs" :orgs-ready="orgsReady" @saved="handleSaved" />
    <IssueDetailDrawer v-model="detailVisible" :issue="detail" :loading="detailLoading" :load-error="detailError" @retry="loadDetail" />
    <ImportIssuesDialog v-model="importVisible" @imported="handleSaved" />
  </div>
</template>

<style scoped>
:deep(.el-table .is-overdue > td.el-table__cell) {
  background: #fff4f2;
}
</style>
