<script setup lang="ts">
import type { SysApi, SysRole } from "@gbnt/api-client";
import { Delete, Edit, Key, Plus } from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox, vLoading } from "element-plus";
import type { FormInstance, FormRules } from "element-plus";
import { computed, onMounted, reactive, shallowRef, useTemplateRef, watch } from "vue";
import { useAdminApi } from "@/api/runtime";
import AsyncError from "@/components/AsyncError.vue";
import QueryPanel from "@/components/QueryPanel.vue";
import TableToolbar from "@/components/TableToolbar.vue";
import PermissionMatrix from "@/components/PermissionMatrix.vue";
import { useLatestQuery } from "@/composables/useLatestQuery";
import { useAuthStore } from "@/stores/auth";
import { usePermissionStore } from "@/stores/permission";
import { errorMessage } from "@/utils/error";
import { formatDateTime } from "@/utils/format";

const tablePage = useTemplateRef<HTMLElement>("tablePage");
const filtersVisible = shallowRef(true);
const roleIdFilter = shallowRef("");
const columns = [{ key: "desc", label: "角色说明" }, { key: "created", label: "创建时间" }, { key: "status", label: "状态" }];
const visibleColumns = shallowRef(columns.map((column) => column.key));
const api = useAdminApi();
const auth = useAuthStore();
const permission = usePermissionStore();
const { data: roleData, loading, loadError, run: load } = useLatestQuery<{ roles: SysRole[]; apis: SysApi[] }>({
  initial: () => ({ roles: [], apis: [] }),
  load: async () => {
    const [roles, apis] = await Promise.all([api.roles.list(), api.roles.listApis()]);
    return { roles, apis };
  },
  errorMessage: "角色权限数据加载失败",
});
const roles = computed(() => roleData.value.roles);
const apis = computed(() => roleData.value.apis);
const keyword = shallowRef("");
const roleDialogVisible = shallowRef(false);
const permissionVisible = shallowRef(false);
const editingRole = shallowRef<SysRole | null>(null);
const selectedRole = shallowRef<SysRole | null>(null);
const formRef = shallowRef<FormInstance>();
const selectedApiIds = shallowRef<number[]>([]);
const submitting = shallowRef(false);
const {
  data: permissionIds, loading: permissionLoading, loadError: permissionError,
  hasLoaded: permissionsReady, run: loadPermissionIds, invalidate: invalidatePermissions,
} = useLatestQuery<number[]>({
  initial: () => [],
  load: async () => {
    if (!selectedRole.value) throw new Error("请先选择角色");
    const result = await api.roles.getPermissions(selectedRole.value.id);
    return result.api_ids === "*" ? apis.value.map((item) => item.id) : result.api_ids;
  },
  errorMessage: "角色权限加载失败，请重试后保存",
});
const form = reactive({ name: "", desc: "", status: 1 });
const rules: FormRules<typeof form> = {
  name: [{ required: true, message: "请输入角色名称", trigger: "blur" }],
};

const filteredRoles = computed(() => {
  const query = keyword.value.trim().toLowerCase();
  const matchingRoles = roleIdFilter.value.trim() ? roles.value.filter((role) => String(role.id) === roleIdFilter.value.trim()) : roles.value;
  if (!query) return matchingRoles;
  return matchingRoles.filter(
    (role) => role.name.toLowerCase().includes(query) || role.desc.toLowerCase().includes(query) || String(role.id) === query,
  );
});

function isCancelled(error: unknown): boolean {
  return error === "cancel" || error === "close";
}

function createRole(): void {
  editingRole.value = null;
  form.name = "";
  form.desc = "";
  form.status = 1;
  roleDialogVisible.value = true;
}

function editRole(role: SysRole): void {
  editingRole.value = role;
  form.name = role.name;
  form.desc = role.desc;
  form.status = role.status;
  roleDialogVisible.value = true;
}

async function submitRole(): Promise<void> {
  if (!(await formRef.value?.validate().catch(() => false))) return;
  submitting.value = true;
  try {
    const input = { name: form.name.trim(), desc: form.desc.trim(), status: form.status };
    if (editingRole.value) {
      await api.roles.update(editingRole.value.id, input);
      ElMessage.success("角色已更新");
    } else {
      await api.roles.create(input);
      ElMessage.success("角色已新增");
    }
    roleDialogVisible.value = false;
    await load();
  } catch (error) {
    ElMessage.error(errorMessage(error, editingRole.value ? "角色更新失败" : "角色新增失败"));
  } finally {
    submitting.value = false;
  }
}

async function toggleStatus(role: SysRole): Promise<void> {
  try {
    await api.roles.update(role.id, {
      name: role.name,
      desc: role.desc,
      status: role.status === 1 ? 0 : 1,
    });
    ElMessage.success(role.status === 1 ? "角色已停用" : "角色已启用");
    await load();
  } catch (error) {
    ElMessage.error(errorMessage(error, "角色状态更新失败"));
  }
}

async function removeRole(role: SysRole): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定删除角色“${role.name}”吗？`, "删除确认", {
      confirmButtonText: "删除",
      cancelButtonText: "取消",
      type: "warning",
    });
    await api.roles.remove(role.id);
    ElMessage.success("角色已删除");
    await load();
  } catch (error) {
    if (!isCancelled(error)) ElMessage.error(errorMessage(error, "角色删除失败"));
  }
}

async function openPermissions(role: SysRole): Promise<void> {
  selectedRole.value = role;
  permissionVisible.value = true;
  await loadPermissions();
}

async function loadPermissions(): Promise<void> {
  selectedApiIds.value = [];
  if (await loadPermissionIds()) {
    if (permissionVisible.value && permissionsReady.value) selectedApiIds.value = [...permissionIds.value];
  }
}

watch(permissionVisible, (visible) => {
  if (!visible) invalidatePermissions();
});

async function savePermissions(): Promise<void> {
  if (!selectedRole.value || selectedRole.value.id === 1 || !permissionsReady.value || permissionLoading.value || loading.value || loadError.value || submitting.value) return;
  const apiIds = [...selectedApiIds.value];
  submitting.value = true;
  try {
    await api.roles.updatePermissions(selectedRole.value.id, { api_ids: apiIds });
    ElMessage.success("角色权限已保存");
    permissionVisible.value = false;
    if (selectedRole.value.id === auth.user?.role_id) {
      try {
        auth.applyUser(await api.auth.getMe());
        permission.reset();
        await permission.loadCatalog();
      } catch {
        ElMessage.warning("权限已保存，重新登录后生效");
      }
    }
  } catch (error) {
    ElMessage.error(errorMessage(error, "角色权限保存失败"));
  } finally {
    submitting.value = false;
  }
}

function asRole(row: unknown): SysRole {
  return row as SysRole;
}

function updateRoleStatus(value: string | number | boolean | undefined): void {
  if (typeof value === "number") form.status = value;
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div ref="tablePage" class="data-page">
    <QueryPanel v-show="filtersVisible" :loading="loading" @search="load" @reset="keyword = ''; roleIdFilter = ''; load()">
      <ElFormItem label="角色名称"><ElInput v-model="keyword" clearable placeholder="角色名称或说明" /></ElFormItem>
      <ElFormItem label="角色 ID"><ElInput v-model="roleIdFilter" clearable placeholder="请输入角色 ID" /></ElFormItem>
    </QueryPanel>
    <AsyncError v-if="loadError" :message="loadError" @retry="load" />

    <section class="data-card">
      <TableToolbar v-model:filters-visible="filtersVisible" v-model:visible-columns="visibleColumns" title="角色管理" :columns="columns" :loading="loading" :target="() => tablePage" @refresh="load">
        <ElButton v-if="permission.can('web.sys-roles', 'create')" type="primary" :icon="Plus" @click="createRole">新增角色</ElButton>
      </TableToolbar>
      <div class="data-table">
      <ElTable height="100%" v-loading="loading" :data="filteredRoles" row-key="id" :empty-text="loading ? '正在加载…' : loadError ? '加载失败，请重试' : '暂无角色'">
        <ElTableColumn prop="id" label="角色 ID" width="100" align="center" />
        <ElTableColumn prop="name" label="角色名称" min-width="160"  align="center"/>
        <ElTableColumn v-if="visibleColumns.includes('desc')" prop="desc" label="角色说明" min-width="240" show-overflow-tooltip  align="center"/>
        <ElTableColumn v-if="visibleColumns.includes('status')" label="状态" width="100" align="center"><template #default="scope"><ElTag :type="scope.row.status === 1 ? 'success' : 'info'">{{ scope.row.status === 1 ? "启用" : "停用" }}</ElTag></template></ElTableColumn>
        <ElTableColumn v-if="visibleColumns.includes('created')" label="创建时间" min-width="160" align="center"><template #default="scope">{{ formatDateTime(scope.row.created_at) }}</template></ElTableColumn>
        <ElTableColumn label="操作" width="260" fixed="right" align="center">
          <template #default="scope">
            <div v-if="scope.row.id !== 1" class="table-actions">
              <ElButton v-if="permission.can('web.sys-roles', 'view')" link type="primary" :icon="Key" @click="openPermissions(asRole(scope.row))">授权</ElButton>
              <ElButton v-if="permission.can('web.sys-roles', 'edit')" link type="primary" :icon="Edit" @click="editRole(asRole(scope.row))">编辑</ElButton>
              <ElButton v-if="permission.can('web.sys-roles', 'edit')" link type="warning" @click="toggleStatus(asRole(scope.row))">{{ scope.row.status === 1 ? "停用" : "启用" }}</ElButton>
              <ElButton v-if="permission.can('web.sys-roles', 'delete')" link type="danger" :icon="Delete" @click="removeRole(asRole(scope.row))">删除</ElButton>
            </div>
            <div v-else class="flex items-center gap-2">
              <ElTag type="danger" effect="plain">管理员角色</ElTag>
              <ElButton link type="primary" :icon="Key" @click="openPermissions(asRole(scope.row))">查看权限</ElButton>
            </div>
          </template>
        </ElTableColumn>
      </ElTable>
      </div>
      <div class="data-pagination">共 {{ filteredRoles.length }} 条记录</div>
    </section>

    <ElDialog v-model="roleDialogVisible" :title="editingRole ? '编辑角色' : '新增角色'" width="min(520px, 92vw)" destroy-on-close>
      <ElForm ref="formRef" :model="form" :rules="rules" label-position="right" label-width="90px">
        <ElFormItem label="角色名称" prop="name"><ElInput v-model="form.name" maxlength="64" /></ElFormItem>
        <ElFormItem label="角色说明"><ElInput v-model="form.desc" type="textarea" :rows="3" maxlength="255" show-word-limit /></ElFormItem>
        <ElFormItem v-if="editingRole" label="状态"><ElRadioGroup :model-value="form.status" @update:model-value="updateRoleStatus"><ElRadio :value="1">启用</ElRadio><ElRadio :value="0">停用</ElRadio></ElRadioGroup></ElFormItem>
        <p v-else class="mt-0 mb-0 text-sm text-slate-500">新角色默认启用，创建后可配置权限。</p>
      </ElForm>
      <template #footer><ElButton @click="roleDialogVisible = false">取消</ElButton><ElButton type="primary" :loading="submitting" @click="submitRole">保存</ElButton></template>
    </ElDialog>

    <ElDialog v-model="permissionVisible" :title="`${selectedRole?.name ?? ''} · 角色授权`" width="min(760px, 94vw)" top="8vh" destroy-on-close :close-on-click-modal="false" :close-on-press-escape="!submitting" :show-close="!submitting">
      <AsyncError v-if="permissionError" class="mb-4" :message="permissionError" @retry="loadPermissions" />
      <ElAlert v-if="selectedRole?.id === 1" class="mb-4" type="info" show-icon :closable="false" title="管理员角色拥有全部权限，不允许修改。" />
      <dl class="role-info"><div><dt>角色名称</dt><dd>{{ selectedRole?.name }}</dd></div><div><dt>备注</dt><dd>{{ selectedRole?.desc || '—' }}</dd></div></dl>
      <div v-loading="permissionLoading">
        <PermissionMatrix v-if="!permissionError" v-model="selectedApiIds" :apis="apis" :disabled="selectedRole?.id === 1 || permissionLoading || !permissionsReady || submitting" />
      </div>
      <template #footer>
        <ElButton :disabled="submitting" @click="permissionVisible = false">关闭</ElButton>
        <ElButton v-if="selectedRole?.id !== 1" type="primary" :loading="submitting" :disabled="!permissionsReady || permissionLoading || loading || Boolean(loadError)" @click="savePermissions">保存权限</ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
.role-info { display: grid; gap: 12px; margin: 0 0 20px; }
.role-info > div { display: grid; grid-template-columns: 80px minmax(0, 1fr); }
.role-info dt { color: #6b7a90; }
.role-info dd { margin: 0; overflow-wrap: anywhere; }
</style>
