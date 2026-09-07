<script setup lang="ts">
import type { SysOrg, SysRole } from "@gbnt/api-client";
import type { AdminUser, AdminUserListResult } from "@/api/types";
import { Download, Plus, Upload } from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox, vLoading } from "element-plus";
import type { UploadRequestOptions } from "element-plus";
import { computed, onMounted, reactive, shallowRef, useTemplateRef } from "vue";
import { useAdminApi } from "@/api/runtime";
import AsyncError from "@/components/AsyncError.vue";
import OrgFilterTree from "@/components/OrgFilterTree.vue";
import QueryPanel from "@/components/QueryPanel.vue";
import TableToolbar from "@/components/TableToolbar.vue";
import { useLatestQuery } from "@/composables/useLatestQuery";
import { usePermissionStore } from "@/stores/permission";
import { downloadBlob } from "@/utils/download";
import { errorMessage } from "@/utils/error";
import { formatDateTime } from "@/utils/format";
import { displayOrg, displayRole } from "@/utils/display";
import UserFormDialog from "./UserFormDialog.vue";

const tablePage = useTemplateRef<HTMLElement>("tablePage");
const filtersVisible = shallowRef(true);
const columns = [{ key: "username", label: "登录账号" }, { key: "phone", label: "手机号" }, { key: "org", label: "所属组织" }, { key: "role", label: "角色" }, { key: "status", label: "状态" }, { key: "created", label: "创建时间" }];
const visibleColumns = shallowRef(columns.map((column) => column.key));
const api = useAdminApi();
const permission = usePermissionStore();
const page = shallowRef(1);
const size = shallowRef(20);
const formVisible = shallowRef(false);
const editingUser = shallowRef<AdminUser | null>(null);
const filters = reactive({ org_id: undefined as number | undefined, keyword: "" });
const { data: orgs, loading: orgsLoading, loadError: orgsError, hasLoaded: orgsReady, run: loadOrgs } = useLatestQuery<SysOrg[]>({
  initial: () => [],
  load: () => api.orgs.list(),
  errorMessage: "组织候选加载失败，筛选和人员表单暂不可选择组织",
});
const { data: roles, loading: rolesLoading, loadError: rolesError, hasLoaded: rolesReady, run: loadRoles } = useLatestQuery<SysRole[]>({
  initial: () => [],
  load: () => api.roles.list(),
  errorMessage: "角色候选加载失败，人员表单暂不可保存",
});
const { data: result, loading, loadError, hasLoaded, run: load } = useLatestQuery<AdminUserListResult>({
  initial: () => ({ list: [], total: 0, page: 1, size: 20 }),
  load: () => api.users.list({
    org_id: filters.org_id,
    keyword: filters.keyword.trim() || undefined,
    page: page.value,
    size: size.value,
  }),
  errorMessage: "工作人员列表加载失败",
});
const users = computed(() => result.value.list);
const total = computed(() => result.value.total);
const optionsReady = computed(() => orgsReady.value && rolesReady.value);
const optionsLoading = computed(() => orgsLoading.value || rolesLoading.value);
const optionsError = computed(() => [orgsError.value, rolesError.value].filter(Boolean).join("；"));

function isCancelled(error: unknown): boolean {
  return error === "cancel" || error === "close";
}

async function loadDictionaries(): Promise<void> {
  await Promise.all([loadOrgs(), loadRoles()]);
}

function selectOrg(id: number | undefined): void { filters.org_id = id; search(); }

function search(): void {
  page.value = 1;
  void load();
}

function reset(): void {
  filters.org_id = undefined;
  filters.keyword = "";
  search();
}

function createUser(): void {
  editingUser.value = null;
  formVisible.value = true;
}

function editUser(user: AdminUser): void {
  editingUser.value = user;
  formVisible.value = true;
}

async function removeUser(user: AdminUser): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定删除账号“${user.username}”吗？`, "删除确认", {
      confirmButtonText: "删除",
      cancelButtonText: "取消",
      type: "warning",
    });
    await api.users.remove(user.id);
    ElMessage.success("工作人员已删除");
    if (await load()) {
      const lastPage = Math.max(1, Math.ceil(total.value / size.value));
      if (page.value > lastPage) {
        page.value = lastPage;
        await load();
      }
    }
  } catch (error) {
    if (!isCancelled(error)) ElMessage.error(errorMessage(error, "工作人员删除失败"));
  }
}

async function resetPassword(user: AdminUser): Promise<void> {
  try {
    await ElMessageBox.confirm(`密码将重置为账号“${user.username}”，是否继续？`, "重置密码", {
      confirmButtonText: "重置",
      cancelButtonText: "取消",
      type: "warning",
    });
    await api.users.resetPassword(user.id);
    ElMessage.success("密码已重置");
  } catch (error) {
    if (!isCancelled(error)) ElMessage.error(errorMessage(error, "密码重置失败"));
  }
}

async function toggleStatus(user: AdminUser): Promise<void> {
  try {
    await api.users.update(user.id, {
      name: user.name,
      phone: user.phone,
      org_id: user.org_id,
      role_id: user.role_id,
      status: user.status === 1 ? 0 : 1,
    });
    ElMessage.success(user.status === 1 ? "账号已停用" : "账号已启用");
    await load();
  } catch (error) {
    ElMessage.error(errorMessage(error, "状态更新失败"));
  }
}

async function exportUsers(): Promise<void> {
  try {
    const result = await api.users.exportFile({
      org_id: filters.org_id,
      keyword: filters.keyword.trim() || undefined,
    });
    downloadBlob(result.blob, result.filename ?? "users.xlsx");
  } catch (error) {
    ElMessage.error(errorMessage(error, "人员导出失败"));
  }
}

async function importUsers(options: UploadRequestOptions): Promise<unknown> {
  try {
    const result = await api.users.importFile({ file: options.file });
    ElMessage.success(`成功导入 ${result.imported} 名工作人员`);
    await Promise.all([load(), loadDictionaries()]);
    return result;
  } catch (error) {
    ElMessage.error(errorMessage(error, "人员导入失败"));
    throw error;
  }
}

function asUser(row: unknown): AdminUser {
  return row as AdminUser;
}

onMounted(() => {
  void Promise.all([load(), loadDictionaries()]);
});
</script>

<template>
  <div class="staff-layout">
    <OrgFilterTree :model-value="filters.org_id" :orgs="orgs" :loading="orgsLoading" :unavailable="Boolean(orgsError)" @update:model-value="selectOrg" />
    <div ref="tablePage" class="data-page">
      <QueryPanel v-show="filtersVisible" :columns="1" :loading="loading" @search="search" @reset="reset">
        <ElFormItem label="姓名 / 电话"><ElInput v-model="filters.keyword" clearable placeholder="请输入账号、姓名或手机号" /></ElFormItem>
      </QueryPanel>
    <AsyncError v-if="orgsError" :message="orgsError" @retry="loadOrgs" />
    <AsyncError v-if="rolesError" :message="rolesError" @retry="loadRoles" />
    <AsyncError v-if="loadError" :message="loadError" @retry="load" />

    <section class="data-card">
      <TableToolbar v-model:filters-visible="filtersVisible" v-model:visible-columns="visibleColumns" title="人员列表" :columns="columns" :loading="loading" :target="() => tablePage" @refresh="load">

        <ElButton v-if="permission.can('web.sys-staff', 'export')" :icon="Download" @click="exportUsers">导出 Excel</ElButton>
        <ElUpload
          v-if="permission.can('web.sys-staff', 'import')"
          action="#"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          :show-file-list="false"
          :http-request="importUsers"
        >
          <ElButton :icon="Upload">导入 Excel</ElButton>
        </ElUpload>
        <ElButton v-if="permission.can('web.sys-staff', 'create')" type="primary" :icon="Plus" @click="createUser">新增人员</ElButton>
      </TableToolbar>
      <div class="data-table">
      <ElTable height="100%" v-loading="loading" :data="users" row-key="id" :empty-text="loading ? '正在加载…' : loadError ? '加载失败，请重试' : '暂无工作人员'">
        <ElTableColumn type="index" label="序号" width="60" align="center" :index="(index: number) => (page - 1) * size + index + 1" />
        <ElTableColumn prop="name" label="姓名" min-width="100"  align="center"/>
        <ElTableColumn v-if="visibleColumns.includes('username')" prop="username" label="登录账号" min-width="130"  align="center"/>
        <ElTableColumn v-if="visibleColumns.includes('phone')" prop="phone" label="手机号" min-width="135"  align="center"/>
        <ElTableColumn v-if="visibleColumns.includes('org')" label="所属组织" min-width="220" show-overflow-tooltip align="center"><template #default="scope">{{ displayOrg(scope.row.org_id, scope.row.org_path || scope.row.org_name) }}</template></ElTableColumn>
        <ElTableColumn v-if="visibleColumns.includes('role')" label="角色" min-width="130" align="center"><template #default="scope">{{ displayRole(asUser(scope.row)) }}</template></ElTableColumn>
        <ElTableColumn v-if="visibleColumns.includes('status')" label="状态" width="90" align="center"><template #default="scope"><ElTag :type="scope.row.status === 1 ? 'success' : 'info'">{{ scope.row.status === 1 ? "启用" : "停用" }}</ElTag></template></ElTableColumn>
        <ElTableColumn v-if="visibleColumns.includes('created')" label="创建时间" min-width="155" align="center"><template #default="scope">{{ formatDateTime(scope.row.created_at) }}</template></ElTableColumn>
        <ElTableColumn label="操作" width="280" fixed="right" align="center">
          <template #default="scope">
            <div v-if="!scope.row.is_super_admin" class="table-actions">
              <ElButton v-if="permission.can('web.sys-staff', 'edit')" link type="primary" @click="editUser(asUser(scope.row))">编辑</ElButton>
              <ElButton v-if="permission.can('web.sys-staff', 'edit')" link type="warning" @click="toggleStatus(asUser(scope.row))">{{ scope.row.status === 1 ? "停用" : "启用" }}</ElButton>
              <ElButton v-if="permission.can('web.sys-staff', 'edit')" link type="warning" @click="resetPassword(asUser(scope.row))">重置密码</ElButton>
              <ElButton v-if="permission.can('web.sys-staff', 'delete')" link type="danger" @click="removeUser(asUser(scope.row))">删除</ElButton>
            </div>
            <ElTag v-else type="danger" effect="plain">超级管理员</ElTag>
          </template>
        </ElTableColumn>
      </ElTable>
      </div>
      <div v-if="hasLoaded" class="data-pagination">
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

    </div>
    <UserFormDialog v-model="formVisible" :user="editingUser" :orgs="orgs" :roles="roles" :options-ready="optionsReady" :options-loading="optionsLoading" :options-error="optionsError" @retry-options="loadDictionaries" @saved="load" />
  </div>
</template>

<style scoped>
.staff-layout { display: flex; flex: 1; gap: 12px; min-width: 0; min-height: 0; }
@media (max-width: 900px) { .staff-layout { flex-direction: column; flex: 1 0 auto; } }
</style>
