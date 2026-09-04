<script setup lang="ts">
import type { SysOrg, SysRole, SysUser } from "@gbnt/api-client";
import { Delete, Download, Edit, Plus, Refresh, Upload } from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox, vLoading } from "element-plus";
import type { UploadRequestOptions } from "element-plus";
import { computed, onMounted, reactive, shallowRef } from "vue";
import { useAdminApi } from "@/api/runtime";
import AsyncError from "@/components/AsyncError.vue";
import OrgTreeSelect from "@/components/OrgTreeSelect.vue";
import PageHeader from "@/components/PageHeader.vue";
import { usePermissionStore } from "@/stores/permission";
import { downloadBlob } from "@/utils/download";
import { errorMessage } from "@/utils/error";
import { formatDateTime } from "@/utils/format";
import { buildOrgPathMap } from "@/utils/org";
import UserFormDialog from "./UserFormDialog.vue";

const api = useAdminApi();
const permission = usePermissionStore();
const loading = shallowRef(false);
const loadError = shallowRef("");
const users = shallowRef<SysUser[]>([]);
const orgs = shallowRef<SysOrg[]>([]);
const roles = shallowRef<SysRole[]>([]);
const total = shallowRef(0);
const page = shallowRef(1);
const size = shallowRef(20);
const formVisible = shallowRef(false);
const editingUser = shallowRef<SysUser | null>(null);
const filters = reactive({ org_id: undefined as number | undefined, keyword: "" });
const orgPaths = computed(() => buildOrgPathMap(orgs.value));
const roleNames = computed(() => new Map(roles.value.map((role) => [role.id, role.name])));

function isCancelled(error: unknown): boolean {
  return error === "cancel" || error === "close";
}

async function loadDictionaries(): Promise<void> {
  const [orgResult, roleResult] = await Promise.allSettled([api.orgs.list(), api.roles.list()]);
  if (orgResult.status === "fulfilled") orgs.value = orgResult.value;
  if (roleResult.status === "fulfilled") roles.value = roleResult.value;
}

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = "";
  try {
    const result = await api.users.list({
      org_id: filters.org_id,
      keyword: filters.keyword.trim() || undefined,
      page: page.value,
      size: size.value,
    });
    users.value = result.list;
    total.value = result.total;
  } catch (error) {
    loadError.value = errorMessage(error, "工作人员列表加载失败");
  } finally {
    loading.value = false;
  }
}

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

function editUser(user: SysUser): void {
  editingUser.value = user;
  formVisible.value = true;
}

async function removeUser(user: SysUser): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定删除账号“${user.username}”吗？`, "删除确认", {
      confirmButtonText: "删除",
      cancelButtonText: "取消",
      type: "warning",
    });
    await api.users.remove(user.id);
    ElMessage.success("工作人员已删除");
    await load();
  } catch (error) {
    if (!isCancelled(error)) ElMessage.error(errorMessage(error, "工作人员删除失败"));
  }
}

async function resetPassword(user: SysUser): Promise<void> {
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

async function toggleStatus(user: SysUser): Promise<void> {
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

function asUser(row: unknown): SysUser {
  return row as SysUser;
}

onMounted(() => {
  void Promise.all([load(), loadDictionaries()]);
});
</script>

<template>
  <div class="space-y-5">
    <PageHeader title="工作人员" description="维护登录账号、所属组织、角色和启停状态。">
      <template #actions>
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
      </template>
    </PageHeader>

    <section class="page-card p-4" @submit.prevent="search">
      <ElForm :model="filters" label-position="top">
        <div class="grid items-end gap-4 md:grid-cols-[320px_1fr_auto]">
          <ElFormItem label="所属组织" class="!mb-0"><OrgTreeSelect v-model="filters.org_id" :orgs="orgs" placeholder="全部组织" /></ElFormItem>
          <ElFormItem label="账号、姓名或手机号" class="!mb-0"><ElInput v-model="filters.keyword" clearable /></ElFormItem>
          <div class="flex justify-end gap-2"><ElButton @click="reset">重置</ElButton><ElButton native-type="submit" type="primary">查询</ElButton></div>
        </div>
      </ElForm>
    </section>

    <AsyncError v-if="loadError" :message="loadError" @retry="load" />

    <section class="page-card overflow-hidden">
      <div class="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <span class="text-sm text-slate-600">共 {{ total }} 名工作人员</span>
        <ElButton text :icon="Refresh" :loading="loading" @click="load">刷新</ElButton>
      </div>
      <ElTable v-loading="loading" :data="users" row-key="id" empty-text="暂无工作人员">
        <ElTableColumn type="index" label="#" width="60" align="center" :index="(index: number) => (page - 1) * size + index + 1" />
        <ElTableColumn prop="username" label="登录账号" min-width="130" />
        <ElTableColumn prop="name" label="姓名" min-width="100" />
        <ElTableColumn prop="phone" label="手机号" min-width="135" />
        <ElTableColumn label="所属组织" min-width="220" show-overflow-tooltip><template #default="scope">{{ orgPaths.get(scope.row.org_id) ?? `组织 #${scope.row.org_id}` }}</template></ElTableColumn>
        <ElTableColumn label="角色" min-width="130"><template #default="scope">{{ roleNames.get(scope.row.role_id) ?? `角色 #${scope.row.role_id}` }}</template></ElTableColumn>
        <ElTableColumn label="状态" width="90" align="center"><template #default="scope"><ElTag :type="scope.row.status === 1 ? 'success' : 'info'">{{ scope.row.status === 1 ? "启用" : "停用" }}</ElTag></template></ElTableColumn>
        <ElTableColumn label="创建时间" min-width="155"><template #default="scope">{{ formatDateTime(scope.row.created_at) }}</template></ElTableColumn>
        <ElTableColumn label="操作" width="280" fixed="right">
          <template #default="scope">
            <div v-if="!scope.row.is_super_admin" class="table-actions">
              <ElButton v-if="permission.can('web.sys-staff', 'edit')" link type="primary" :icon="Edit" @click="editUser(asUser(scope.row))">编辑</ElButton>
              <ElButton v-if="permission.can('web.sys-staff', 'edit')" link type="warning" @click="toggleStatus(asUser(scope.row))">{{ scope.row.status === 1 ? "停用" : "启用" }}</ElButton>
              <ElButton v-if="permission.can('web.sys-staff', 'edit')" link type="warning" @click="resetPassword(asUser(scope.row))">重置密码</ElButton>
              <ElButton v-if="permission.can('web.sys-staff', 'delete')" link type="danger" :icon="Delete" @click="removeUser(asUser(scope.row))">删除</ElButton>
            </div>
            <ElTag v-else type="danger" effect="plain">超级管理员</ElTag>
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

    <UserFormDialog v-model="formVisible" :user="editingUser" :orgs="orgs" :roles="roles" @saved="load" />
  </div>
</template>
