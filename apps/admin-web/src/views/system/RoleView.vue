<script setup lang="ts">
import type { SysApi, SysRole } from "@gbnt/api-client";
import { Delete, Edit, Key, Plus, Refresh } from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox, ElTree, vLoading } from "element-plus";
import type { FormInstance, FormRules } from "element-plus";
import { computed, nextTick, onMounted, reactive, shallowRef, watch } from "vue";
import { useAdminApi } from "@/api/runtime";
import AsyncError from "@/components/AsyncError.vue";
import PageHeader from "@/components/PageHeader.vue";
import { useLatestQuery } from "@/composables/useLatestQuery";
import { useAuthStore } from "@/stores/auth";
import { usePermissionStore } from "@/stores/permission";
import { errorMessage } from "@/utils/error";
import { formatDateTime } from "@/utils/format";

interface PermissionNode {
  id: string | number;
  label: string;
  children?: PermissionNode[];
}

const MODULE_LABELS: Record<string, string> = {
  "web.workbench": "工作台",
  "web.rectify": "专项整改",
  "web.ledger-street": "街道台账",
  "web.ledger-survey": "排查汇总",
  "web.sys-org": "组织架构",
  "web.sys-staff": "工作人员",
  "web.sys-roles": "角色权限",
  "web.sys-logs": "操作日志",
};

const ACTION_LABELS: Record<string, string> = {
  view: "查看",
  create: "新增",
  edit: "编辑",
  delete: "删除",
  import: "导入",
  export: "导出",
};

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
const treeRef = shallowRef<InstanceType<typeof ElTree>>();
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
  if (!query) return roles.value;
  return roles.value.filter(
    (role) => role.name.toLowerCase().includes(query) || role.desc.toLowerCase().includes(query) || String(role.id) === query,
  );
});

const permissionTree = computed<PermissionNode[]>(() => {
  const groups = new Map<string, SysApi[]>();
  for (const item of apis.value) {
    const list = groups.get(item.module) ?? [];
    list.push(item);
    groups.set(item.module, list);
  }
  return [...groups.entries()].map(([module, items]) => ({
    id: `module:${module}`,
    label: MODULE_LABELS[module] ?? module,
    children: items
      .sort((a, b) => a.sort - b.sort || a.id - b.id)
      .map((item) => ({
        id: item.id,
        label: `${ACTION_LABELS[item.action] ?? item.action} · ${item.name}（${item.method} ${item.path}）`,
      })),
  }));
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
  treeRef.value?.setCheckedKeys([], false);
  if (await loadPermissionIds()) {
    await nextTick();
    if (permissionVisible.value && permissionsReady.value) treeRef.value?.setCheckedKeys(permissionIds.value, false);
  }
}

watch(permissionVisible, (visible) => {
  if (!visible) invalidatePermissions();
});

async function savePermissions(): Promise<void> {
  if (!selectedRole.value || selectedRole.value.id === 1 || !permissionsReady.value || permissionLoading.value || loading.value || loadError.value || submitting.value) return;
  const checked = treeRef.value?.getCheckedKeys(false) ?? [];
  const apiIds = checked.filter((id): id is number => typeof id === "number");
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
  <div class="space-y-5">
    <PageHeader title="角色权限" description="角色授权以当前后端 API 目录中的数字 ID 为准。">
      <template #actions>
        <ElButton :icon="Refresh" :loading="loading" @click="load">刷新</ElButton>
        <ElButton v-if="permission.can('web.sys-roles', 'create')" type="primary" :icon="Plus" @click="createRole">新增角色</ElButton>
      </template>
    </PageHeader>

    <section class="page-card p-4">
      <ElFormItem label="角色名称、说明或 ID" class="!mb-0">
        <ElInput v-model="keyword" clearable class="max-w-lg" placeholder="输入关键字筛选当前角色列表" />
      </ElFormItem>
    </section>

    <AsyncError v-if="loadError" :message="loadError" @retry="load" />

    <section class="page-card overflow-hidden">
      <ElTable v-loading="loading" :data="filteredRoles" row-key="id" :empty-text="loading ? '正在加载…' : loadError ? '加载失败，请重试' : '暂无角色'">
        <ElTableColumn prop="id" label="角色 ID" width="100" align="center" />
        <ElTableColumn prop="name" label="角色名称" min-width="160" />
        <ElTableColumn prop="desc" label="角色说明" min-width="240" show-overflow-tooltip />
        <ElTableColumn label="状态" width="100" align="center"><template #default="scope"><ElTag :type="scope.row.status === 1 ? 'success' : 'info'">{{ scope.row.status === 1 ? "启用" : "停用" }}</ElTag></template></ElTableColumn>
        <ElTableColumn label="创建时间" min-width="160"><template #default="scope">{{ formatDateTime(scope.row.created_at) }}</template></ElTableColumn>
        <ElTableColumn label="操作" width="260" fixed="right">
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
    </section>

    <ElDialog v-model="roleDialogVisible" :title="editingRole ? '编辑角色' : '新增角色'" width="min(520px, 92vw)" destroy-on-close>
      <ElForm ref="formRef" :model="form" :rules="rules" label-position="top">
        <ElFormItem label="角色名称" prop="name"><ElInput v-model="form.name" maxlength="64" /></ElFormItem>
        <ElFormItem label="角色说明"><ElInput v-model="form.desc" type="textarea" :rows="3" maxlength="255" show-word-limit /></ElFormItem>
        <ElFormItem v-if="editingRole" label="状态"><ElRadioGroup :model-value="form.status" @update:model-value="updateRoleStatus"><ElRadio :value="1">启用</ElRadio><ElRadio :value="0">停用</ElRadio></ElRadioGroup></ElFormItem>
        <p v-else class="mt-0 mb-0 text-sm text-slate-500">新角色按后端规则默认启用，创建后可再停用。</p>
      </ElForm>
      <template #footer><ElButton @click="roleDialogVisible = false">取消</ElButton><ElButton type="primary" :loading="submitting" @click="submitRole">保存</ElButton></template>
    </ElDialog>

    <ElDrawer v-model="permissionVisible" :title="`${selectedRole?.name ?? ''} · API 权限`" size="min(760px, 96vw)" destroy-on-close>
      <AsyncError v-if="permissionError" class="mb-4" :message="permissionError" @retry="loadPermissions" />
      <ElAlert
        v-if="selectedRole?.id === 1"
        class="mb-4"
        type="info"
        show-icon
        :closable="false"
        title="管理员角色固定拥有全部 API 权限，不允许修改。"
      />
      <ElTree
        v-if="!permissionError"
        ref="treeRef"
        v-loading="permissionLoading"
        :data="permissionTree"
        node-key="id"
        :show-checkbox="selectedRole?.id !== 1"
        default-expand-all
        :props="{ label: 'label', children: 'children' }"
      />
      <template #footer>
        <div class="flex justify-end gap-2 p-4">
          <ElButton @click="permissionVisible = false">关闭</ElButton>
          <ElButton v-if="selectedRole?.id !== 1" type="primary" :loading="submitting" :disabled="!permissionsReady || permissionLoading || loading || Boolean(loadError)" @click="savePermissions">保存权限</ElButton>
        </div>
      </template>
    </ElDrawer>
  </div>
</template>
