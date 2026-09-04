<script setup lang="ts">
import { ISSUE_STATUSES, ISSUE_TYPES, PROJECT_YEARS } from "@gbnt/api-client";
import type { Issue, IssueListQuery, SysOrg, SysUser } from "@gbnt/api-client";
import { Delete, Download, Edit, Plus, Refresh, View } from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox, vLoading } from "element-plus";
import { computed, onMounted, reactive, shallowRef } from "vue";
import { useAdminApi } from "@/api/runtime";
import AsyncError from "@/components/AsyncError.vue";
import IssueStatusTag from "@/components/IssueStatusTag.vue";
import OrgTreeSelect from "@/components/OrgTreeSelect.vue";
import PageHeader from "@/components/PageHeader.vue";
import { ISSUE_STATUS_META, ISSUE_TYPE_LABELS } from "@/constants/issue";
import { usePermissionStore } from "@/stores/permission";
import { errorMessage } from "@/utils/error";
import { formatDate, formatDateTime } from "@/utils/format";
import { buildOrgPathMap } from "@/utils/org";
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
const loading = shallowRef(false);
const detailLoading = shallowRef(false);
const loadError = shallowRef("");
const list = shallowRef<Issue[]>([]);
const total = shallowRef(0);
const page = shallowRef(1);
const size = shallowRef(20);
const orgs = shallowRef<SysOrg[]>([]);
const users = shallowRef<SysUser[]>([]);
const selectedIssue = shallowRef<Issue | null>(null);
const formVisible = shallowRef(false);
const detailVisible = shallowRef(false);
const rectifyVisible = shallowRef(false);
const reassignVisible = shallowRef(false);
const importVisible = shallowRef(false);
const editingIssue = shallowRef<Issue | null>(null);
const filters = reactive<IssueFilters>({ type: "all", status: "all", keyword: "" });

const orgPaths = computed(() => buildOrgPathMap(orgs.value));
const userNames = computed(() =>
  new Map(users.value.map((user) => [user.id, user.name || user.username])),
);

function isCancelled(error: unknown): boolean {
  return error === "cancel" || error === "close";
}

function userName(id: number): string {
  if (!id) return "—";
  return userNames.value.get(id) ?? `#${id}`;
}

function planDisplay(issue: Issue): string {
  if (!issue.plan_date) return "—";
  if (issue.status === "done") return formatDate(issue.plan_date);
  const end = new Date(`${issue.plan_date}T23:59:59`).getTime();
  if (Number.isNaN(end)) return issue.plan_date;
  const days = Math.ceil((end - Date.now()) / 86_400_000);
  if (days < 0) return `${formatDate(issue.plan_date)}（逾期 ${Math.abs(days)} 天）`;
  if (days === 0) return `${formatDate(issue.plan_date)}（今天到期）`;
  return `${formatDate(issue.plan_date)}（剩余 ${days} 天）`;
}

function rowClassName({ row }: { row: Issue }): string {
  if (row.status === "done" || !row.plan_date) return "";
  const end = new Date(`${row.plan_date}T23:59:59`).getTime();
  return Number.isFinite(end) && end < Date.now() ? "is-overdue" : "";
}

function asIssue(row: unknown): Issue {
  return row as Issue;
}

async function loadDictionaries(): Promise<void> {
  const [orgResult, userResult] = await Promise.allSettled([
    api.orgs.list(),
    api.users.list({ page: 1, size: 1000 }),
  ]);
  if (orgResult.status === "fulfilled") orgs.value = orgResult.value;
  if (userResult.status === "fulfilled") users.value = userResult.value.list;
}

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = "";
  try {
    const result = await api.issues.list({
      type: filters.type,
      status: filters.status,
      org_id: filters.org_id,
      project_year: filters.project_year,
      keyword: filters.keyword.trim() || undefined,
      page: page.value,
      size: size.value,
    });
    list.value = result.list;
    total.value = result.total;
  } catch (error) {
    loadError.value = errorMessage(error, "专项整改列表加载失败");
  } finally {
    loading.value = false;
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
  editingIssue.value = null;
  formVisible.value = true;
}

function editIssue(issue: Issue): void {
  editingIssue.value = issue;
  formVisible.value = true;
}

async function openDetail(issue: Issue): Promise<void> {
  detailLoading.value = true;
  try {
    selectedIssue.value = await api.issues.get(issue.id);
    detailVisible.value = true;
  } catch (error) {
    ElMessage.error(errorMessage(error, "详情加载失败"));
  } finally {
    detailLoading.value = false;
  }
}

function openRectify(issue: Issue): void {
  selectedIssue.value = issue;
  rectifyVisible.value = true;
}

function openReassign(issue: Issue): void {
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
    if (list.value.length === 1 && page.value > 1) page.value -= 1;
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
    await load();
  } catch (error) {
    if (!isCancelled(error)) ElMessage.error(errorMessage(error, "重新整改失败"));
  }
}

async function handleSaved(): Promise<void> {
  await Promise.all([load(), loadDictionaries()]);
}

onMounted(() => {
  void Promise.all([load(), loadDictionaries()]);
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
            <OrgTreeSelect v-model="filters.org_id" :orgs="orgs" placeholder="全部组织" />
          </ElFormItem>
          <ElFormItem label="编号或地址">
            <ElInput v-model="filters.keyword" clearable placeholder="输入关键字" />
          </ElFormItem>
        </div>
        <div class="flex justify-end gap-2">
          <ElButton @click="reset">重置</ElButton>
          <ElButton native-type="submit" type="primary">查询</ElButton>
        </div>
      </ElForm>
    </section>

    <AsyncError v-if="loadError" :message="loadError" @retry="load" />

    <section class="page-card overflow-hidden">
      <div class="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <span class="text-sm text-slate-600">共 {{ total }} 条记录</span>
        <ElButton text :icon="Refresh" :loading="loading" @click="load">刷新</ElButton>
      </div>
      <ElTable
        v-loading="loading"
        :data="list"
        row-key="id"
        :row-class-name="rowClassName"
        empty-text="暂无排查整改记录"
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
          <template #default="scope">{{ orgPaths.get(scope.row.org_id) ?? `组织 #${scope.row.org_id}` }}</template>
        </ElTableColumn>
        <ElTableColumn prop="address" label="定位地址" min-width="220" show-overflow-tooltip />
        <ElTableColumn label="上报人" min-width="100"><template #default="scope">{{ userName(scope.row.report_user_id) }}</template></ElTableColumn>
        <ElTableColumn label="整改人" min-width="100"><template #default="scope">{{ userName(scope.row.assignee_user) }}</template></ElTableColumn>
        <ElTableColumn label="计划完成" min-width="190"><template #default="scope">{{ planDisplay(asIssue(scope.row)) }}</template></ElTableColumn>
        <ElTableColumn label="状态" width="100" align="center"><template #default="scope"><IssueStatusTag :status="scope.row.status" /></template></ElTableColumn>
        <ElTableColumn label="创建时间" min-width="155"><template #default="scope">{{ formatDateTime(scope.row.created_at) }}</template></ElTableColumn>
        <ElTableColumn label="操作" width="300" fixed="right">
          <template #default="scope">
            <div class="table-actions">
              <ElButton link type="primary" :icon="View" :loading="detailLoading && selectedIssue?.id === scope.row.id" @click="openDetail(asIssue(scope.row))">详情</ElButton>
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

    <IssueFormDialog v-model="formVisible" :issue="editingIssue" :orgs="orgs" @saved="handleSaved" />
    <IssueDetailDrawer v-model="detailVisible" :issue="selectedIssue" :org-paths="orgPaths" :user-names="userNames" />
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
