<script setup lang="ts">
import { ISSUE_STATUSES, ISSUE_TYPES, PROJECT_YEARS } from "@gbnt/api-client";
import type { Issue, IssueListQuery } from "@gbnt/api-client";
import { Delete, Download, Edit, Plus, Refresh, View } from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox, vLoading } from "element-plus";
import { computed, onMounted, onScopeDispose, reactive, shallowRef, watch } from "vue";
import { useAdminApi } from "@/api/runtime";
import type { AdminIssue, AdminIssueListResult, OrgOption } from "@/api/types";
import AsyncError from "@/components/AsyncError.vue";
import IssueStatusTag from "@/components/IssueStatusTag.vue";
import OrgTreeSelect from "@/components/OrgTreeSelect.vue";
import PageHeader from "@/components/PageHeader.vue";
import { ISSUE_STATUS_META, ISSUE_TYPE_LABELS } from "@/constants/issue";
import { useLatestQuery } from "@/composables/useLatestQuery";
import { useBusinessToday } from "@/composables/useBusinessToday";
import { usePermissionStore } from "@/stores/permission";
import { errorMessage } from "@/utils/error";
import { formatDateTime } from "@/utils/format";
import { displayOrg, displayUser } from "@/utils/display";
import { issuePlanDisplay } from "@/utils/issue-date";
import ImportIssuesDialog from "./ImportIssuesDialog.vue";
import IssueDetailDrawer from "./IssueDetailDrawer.vue";
import IssueFormDialog from "./IssueFormDialog.vue";
import ReassignDialog from "./ReassignDialog.vue";
import RectifyDialog from "./RectifyDialog.vue";

interface IssueFilters {
  type: IssueListQuery["type"];
  status: IssueListQuery["status"];
  org_id?: number;
  project_year?: IssueListQuery["project_year"];
  keyword: string;
}

const api = useAdminApi();
const permission = usePermissionStore();
const page = shallowRef(1);
const size = shallowRef(20);
const selectedIssue = shallowRef<AdminIssue | null>(null);
const detailId = shallowRef<number>();
const formVisible = shallowRef(false);
const detailVisible = shallowRef(false);
const rectifyVisible = shallowRef(false);
const reassignVisible = shallowRef(false);
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

function planDisplay(issue: Issue): string {
  return issuePlanDisplay(issue, today.value).text;
}

function rowClassName({ row }: { row: Issue }): string {
  return issuePlanDisplay(row, today.value).overdue ? "is-overdue" : "";
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
  rectifyVisible.value = false;
  reassignVisible.value = false;
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

function openRectify(issue: AdminIssue): void {
  closeIssuePanels();
  selectedIssue.value = issue;
  rectifyVisible.value = true;
}

function openReassign(issue: AdminIssue): void {
  closeIssuePanels();
  selectedIssue.value = issue;
  reassignVisible.value = true;
}

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

async function reRectify(issue: Issue): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定将 ${issue.issue_key} 重新进入整改流程吗？`, "重新整改", {
      confirmButtonText: "确认",
      cancelButtonText: "取消",
      type: "warning",
    });
    await api.issues.reRectify(issue.id);
    ElMessage.success("已重新进入整改流程");
    await handleSaved(issue.id);
  } catch (error) {
    if (!isCancelled(error)) ElMessage.error(errorMessage(error, "重新整改失败"));
  }
}

async function handleSaved(issueId?: number): Promise<void> {
  const current = ++refreshSequence;
  // 写入响应仍为基础 Issue，展示字段以管理端 GET 的最新结果为准。
  await Promise.all([
    load(),
    issueId ? api.issues.get(issueId).then((fresh) => {
      if (current === refreshSequence && selectedIssue.value?.id === fresh.id) selectedIssue.value = fresh;
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
  <div class="space-y-5">
    <PageHeader title="专项整改" description="按当前后端字段管理排查、整改和责任人指派。">
      <template #actions>
        <ElButton v-if="permission.can('web.rectify', 'import')" :icon="Download" @click="importVisible = true">
          JSON 导入
        </ElButton>
        <ElButton v-if="permission.can('web.rectify', 'create')" type="primary" :icon="Plus" @click="createIssue">
          新增排查
        </ElButton>
      </template>
    </PageHeader>

    <section class="page-card p-4" @submit.prevent="search">
      <ElForm :model="filters" label-position="top">
        <div class="grid gap-x-4 sm:grid-cols-2 xl:grid-cols-5">
          <ElFormItem label="问题类型">
            <ElSelect v-model="filters.type" class="w-full">
              <ElOption label="全部类型" value="all" />
              <ElOption v-for="type in ISSUE_TYPES" :key="type" :label="ISSUE_TYPE_LABELS[type]" :value="type" />
            </ElSelect>
          </ElFormItem>
          <ElFormItem label="整改状态">
            <ElSelect v-model="filters.status" class="w-full">
              <ElOption label="全部状态" value="all" />
              <ElOption
                v-for="status in ISSUE_STATUSES"
                :key="status"
                :label="ISSUE_STATUS_META[status].label"
                :value="status"
              />
            </ElSelect>
          </ElFormItem>
          <ElFormItem label="项目年度">
            <ElSelect v-model="filters.project_year" clearable class="w-full" placeholder="全部年度">
              <ElOption v-for="year in PROJECT_YEARS" :key="year" :label="`${year} 年`" :value="year" />
            </ElSelect>
          </ElFormItem>
          <ElFormItem label="所属组织">
            <OrgTreeSelect v-model="filters.org_id" :orgs="orgs" :disabled="!orgsReady" placeholder="全部组织" />
          </ElFormItem>
          <ElFormItem label="问题编号、设施编号或地址">
            <ElInput v-model="filters.keyword" clearable placeholder="输入问题编号、设施编号或地址" />
          </ElFormItem>
        </div>
        <div class="flex justify-end gap-2">
          <ElButton @click="reset">重置</ElButton>
          <ElButton native-type="submit" type="primary">查询</ElButton>
        </div>
      </ElForm>
    </section>

    <AsyncError v-if="orgError" :message="orgError" @retry="loadOrgs" />
    <AsyncError v-if="loadError" :message="loadError" @retry="load" />

    <section class="page-card overflow-hidden">
      <div class="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <span class="text-sm text-slate-600">{{ hasLoaded ? `共 ${total} 条记录` : loading ? '正在加载…' : '数据未加载' }}</span>
        <ElButton text :icon="Refresh" :loading="loading" @click="load">刷新</ElButton>
      </div>
      <ElTable
        v-loading="loading"
        :data="list"
        row-key="id"
        :row-class-name="rowClassName"
        :empty-text="loadError ? '加载失败，请重试' : loading ? '正在加载…' : '暂无排查整改记录'"
        class="w-full"
      >
        <ElTableColumn type="index" label="#" width="60" align="center" :index="(index: number) => (page - 1) * size + index + 1" />
        <ElTableColumn prop="issue_key" label="问题编号" min-width="150" show-overflow-tooltip />
        <ElTableColumn label="类型" width="100">
          <template #default="scope">{{ ISSUE_TYPE_LABELS[scope.row.type as Issue['type']] }}</template>
        </ElTableColumn>
        <ElTableColumn prop="project_year" label="年度" width="80" align="center" />
        <ElTableColumn prop="code" label="设施编号" min-width="120" show-overflow-tooltip />
        <ElTableColumn label="所属组织" min-width="200" show-overflow-tooltip>
          <template #default="scope">{{ displayOrg(scope.row.org_id, scope.row.org_path || scope.row.org_name) }}</template>
        </ElTableColumn>
        <ElTableColumn prop="address" label="定位地址" min-width="220" show-overflow-tooltip />
        <ElTableColumn label="上报人" min-width="100"><template #default="scope">{{ displayUser(scope.row.report_user_id, scope.row.report_user_name) }}</template></ElTableColumn>
        <ElTableColumn label="整改人" min-width="100"><template #default="scope">{{ displayUser(scope.row.assignee_user, scope.row.assignee_user_name) }}</template></ElTableColumn>
        <ElTableColumn label="计划完成" min-width="190">
          <template #default="scope">
            <span :class="{ 'text-red-700': issuePlanDisplay(asIssue(scope.row), today).overdue }">{{ planDisplay(asIssue(scope.row)) }}</span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="状态" width="100" align="center"><template #default="scope"><IssueStatusTag :status="scope.row.status" /></template></ElTableColumn>
        <ElTableColumn label="创建时间" min-width="155"><template #default="scope">{{ formatDateTime(scope.row.created_at) }}</template></ElTableColumn>
        <ElTableColumn label="操作" width="300" fixed="right">
          <template #default="scope">
            <div class="table-actions">
              <ElButton link type="primary" :icon="View" :loading="detailLoading && detailId === scope.row.id" @click="openDetail(asIssue(scope.row))">详情</ElButton>
              <ElButton v-if="permission.can('web.rectify', 'edit')" link type="primary" :icon="Edit" @click="editIssue(asIssue(scope.row))">编辑</ElButton>
              <ElButton
                v-if="permission.can('web.rectify', 'edit') && scope.row.status !== 'done'"
                link
                type="success"
                @click="openRectify(asIssue(scope.row))"
              >整改</ElButton>
              <ElButton
                v-if="permission.can('web.rectify', 'edit') && scope.row.status !== 'done'"
                link
                type="warning"
                @click="openReassign(asIssue(scope.row))"
              >指派</ElButton>
              <ElButton
                v-if="permission.can('web.rectify', 'edit') && scope.row.status === 'done' && scope.row.rectify_records.length"
                link
                type="warning"
                @click="reRectify(asIssue(scope.row))"
              >重新整改</ElButton>
              <ElButton
                v-if="permission.can('web.rectify', 'delete')"
                link
                type="danger"
                :icon="Delete"
                @click="removeIssue(asIssue(scope.row))"
              >删除</ElButton>
            </div>
          </template>
        </ElTableColumn>
      </ElTable>
      <div class="flex justify-end border-t border-slate-200 px-4 py-3">
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
    <RectifyDialog v-model="rectifyVisible" :issue="selectedIssue" @saved="handleSaved" />
    <ReassignDialog v-model="reassignVisible" :issue="selectedIssue" @saved="handleSaved" />
    <ImportIssuesDialog v-model="importVisible" @imported="handleSaved" />
  </div>
</template>

<style scoped>
:deep(.el-table .is-overdue > td.el-table__cell) {
  background: #fff4f2;
}
</style>
