<script setup lang="ts">
import type { SysApi, SysRole } from "@gbnt/api-client";
import { Plus } from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox, vLoading } from "element-plus";
import { computed, onMounted, reactive, shallowRef, useTemplateRef, watch } from "vue";
import { useRouter } from "vue-router";
import { useAdminApi } from "@/api/runtime";
import AsyncError from "@/components/AsyncError.vue";
import QueryPanel from "@/components/QueryPanel.vue";
import TableToolbar from "@/components/TableToolbar.vue";
import { useLatestQuery } from "@/composables/useLatestQuery";
import { navigation } from "@/layouts/navigation";
import { useAuthStore } from "@/stores/auth";
import { usePermissionStore } from "@/stores/permission";
import { errorMessage } from "@/utils/error";
import { formatDateTime } from "@/utils/format";
import RoleFormDialog from "./RoleFormDialog.vue";

const api = useAdminApi();
const auth = useAuthStore();
const permission = usePermissionStore();
const router = useRouter();
const tablePage = useTemplateRef<HTMLElement>("tablePage");
const { data, loading, loadError, hasLoaded, run: load } = useLatestQuery<{ roles: SysRole[]; apis: SysApi[] }>({
  initial: () => ({ roles: [], apis: [] }),
  load: async () => {
    const [roles, apis] = await Promise.all([api.roles.list(), api.roles.listApis()]);
    return { roles, apis };
  },
  errorMessage: "角色列表加载失败",
});
const filters = reactive({ name: "", code: "" });
const applied = shallowRef({ name: "", code: "" });
const queryError = shallowRef("");
const filtersVisible = shallowRef(true);
const page = shallowRef(1);
const size = shallowRef(10);
const formVisible = shallowRef(false);
const editingRole = shallowRef<SysRole | null>(null);
const busyIds = shallowRef<number[]>([]);
const columns = [
  { key: "name", label: "角色名称" }, { key: "code", label: "角色ID" }, { key: "desc", label: "备注" },
  { key: "created", label: "创建时间" }, { key: "status", label: "状态" },
];
const visibleColumns = shallowRef(columns.map((column) => column.key));
const serviceReady = computed(() => data.value.apis.some((item) => item.duty));
const canEdit = computed(() => permission.can("web.sys-roles", "edit"));
const canCreate = computed(() => permission.can("web.sys-roles", "create") && canEdit.value);
const filteredRoles = computed(() => {
  const name = applied.value.name.toLowerCase();
  return data.value.roles.filter((role) =>
    (!name || role.name.toLowerCase().includes(name)) && (!applied.value.code || role.code?.toLowerCase() === applied.value.code),
  ).sort((a, b) => {
    const date = (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0);
    return date || b.id - a.id;
  });
});
const total = computed(() => filteredRoles.value.length);
const rows = computed(() => filteredRoles.value.slice((page.value - 1) * size.value, page.value * size.value));
watch([total, size, hasLoaded], () => {
  if (hasLoaded.value) page.value = Math.min(page.value, Math.max(1, Math.ceil(total.value / size.value)));
});

function search(): void {
  const code = filters.code.trim().toLowerCase();
  if (code && !/^[a-z][a-z0-9_-]{0,63}$/.test(code)) {
    queryError.value = "请输入英文角色ID，例如 admin、test";
    return;
  }
  queryError.value = "";
  applied.value = { name: filters.name.trim(), code };
  page.value = 1;
}
function reset(): void {
  filters.name = "";
  filters.code = "";
  search();
}
function createRole(): void {
  if (!canCreate.value) return;
  editingRole.value = null;
  formVisible.value = true;
}
function editRole(role: SysRole): void {
  if (!canEdit.value || role.id === 1) return;
  editingRole.value = role;
  formVisible.value = true;
}

/** 当前角色变化后更新身份与菜单；失去本页权限时进入仍可访问的页面。 */
async function refreshCurrentRole(id: number): Promise<boolean> {
  if (id !== auth.user?.role_id) return true;
  const catalog = data.value.apis;
  try {
    const user = await api.auth.getMe();
    auth.applyUser(user);
    permission.reset();
    await permission.loadCatalog();
    // 撤销目录读取权限后，仍用刚刚成功读取的目录解释最新授权，不能回退为全菜单可见。
    if (!permission.catalogAvailable && catalog.length) {
      permission.catalog = catalog;
      permission.catalogAvailable = true;
    }
    const grants = user.apis;
    const allowed = (module: string) => grants === "*" || catalog.some((item) =>
      item.module === module && ["view", "create", "edit", "delete", "import", "export"].includes(item.action) && grants.includes(item.id),
    );
    if (allowed("web.sys-roles")) return true;
    const destination = navigation.flatMap((item) => item.children ?? [item]).find((item) => item.module && allowed(item.module));
    if (destination?.path) await router.replace(destination.path);
    else { auth.reset(); await router.replace("/login"); }
  } catch {
    ElMessage.warning("角色已保存，请重新登录以更新权限");
    auth.reset();
    await router.replace("/login");
  }
  return false;
}
async function saved(role: SysRole, created: boolean): Promise<void> {
  if (created) reset();
  if (await refreshCurrentRole(role.id)) await load();
}
async function toggleStatus(role: SysRole): Promise<boolean> {
  if (!canEdit.value || role.id === 1 || busyIds.value.includes(role.id) || !serviceReady.value) return false;
  busyIds.value = [...busyIds.value, role.id];
  try {
    const updated = await api.roles.update(role.id, { status: role.status === 1 ? 0 : 1 });
    data.value = { ...data.value, roles: data.value.roles.map((item) => item.id === role.id ? updated : item) };
    ElMessage.success(updated.status === 1 ? "角色已启用" : "角色已停用");
    await refreshCurrentRole(role.id);
    return true;
  } catch (error) {
    ElMessage.error(errorMessage(error, "角色状态修改失败"));
    return false;
  } finally {
    busyIds.value = busyIds.value.filter((id) => id !== role.id);
  }
}
async function removeRole(role: SysRole): Promise<void> {
  if (role.id === 1 || busyIds.value.includes(role.id) || !permission.can("web.sys-roles", "delete")) return;
  busyIds.value = [...busyIds.value, role.id];
  try {
    await ElMessageBox.confirm("确定删除角色“" + role.name + "”（角色ID：" + (role.code || "未配置") + "）吗？", "删除确认", {
      confirmButtonText: "删除", cancelButtonText: "取消", type: "warning",
    });
    await api.roles.remove(role.id);
    ElMessage.success("角色已删除");
    await load();
  } catch (error) {
    if (error !== "cancel" && error !== "close") ElMessage.error(errorMessage(error, "角色删除失败"));
  } finally {
    busyIds.value = busyIds.value.filter((id) => id !== role.id);
  }
}
function asRole(row: unknown): SysRole { return row as SysRole; }
onMounted(() => { void load(); });
</script>

<template>
  <div ref="tablePage" class="data-page">
    <QueryPanel v-show="filtersVisible" :loading="loading" @search="search" @reset="reset">
      <ElFormItem label="角色名称"><ElInput v-model="filters.name" clearable placeholder="请输入" /></ElFormItem>
      <ElFormItem label="角色ID" :error="queryError"><ElInput v-model="filters.code" clearable placeholder="例如 admin、test" maxlength="64" /></ElFormItem>
    </QueryPanel>
    <AsyncError v-if="loadError" :message="loadError" @retry="load" />
    <section class="data-card">
      <TableToolbar v-model:filters-visible="filtersVisible" v-model:visible-columns="visibleColumns" title="角色管理" :columns="columns" :loading="loading" :target="() => tablePage" @refresh="load">
        <ElTooltip v-if="permission.can('web.sys-roles', 'create')" content="新增并授权角色需要角色修改权限" :disabled="canCreate">
          <span><ElButton type="primary" :icon="Plus" :disabled="!canCreate || loading" @click="createRole">新增角色</ElButton></span>
        </ElTooltip>
      </TableToolbar>
      <div class="data-table">
        <ElTable height="100%" v-loading="loading" :data="rows" row-key="id" :empty-text="loading ? '正在加载…' : loadError ? '加载失败，请重试' : '暂无角色'">
          <ElTableColumn type="index" label="序号" width="80" align="center" :index="(index: number) => total - (page - 1) * size - index" />
          <ElTableColumn v-if="visibleColumns.includes('name')" prop="name" label="角色名称" min-width="180" align="center" show-overflow-tooltip />
          <ElTableColumn v-if="visibleColumns.includes('code')" prop="code" label="角色ID" min-width="160" align="center" show-overflow-tooltip />
          <ElTableColumn v-if="visibleColumns.includes('desc')" prop="desc" label="备注" min-width="240" align="center" show-overflow-tooltip />
          <ElTableColumn v-if="visibleColumns.includes('created')" label="创建时间" min-width="180" align="center"><template #default="scope">{{ formatDateTime(scope.row.created_at, true) }}</template></ElTableColumn>
          <ElTableColumn v-if="visibleColumns.includes('status')" label="状态" width="100" align="center">
            <template #default="scope">
              <ElSwitch :model-value="scope.row.status === 1" :loading="busyIds.includes(scope.row.id)" :disabled="scope.row.id === 1 || !canEdit || !serviceReady" :before-change="() => toggleStatus(asRole(scope.row))" v-bind="{ 'aria-label': scope.row.name + '状态' }" />
            </template>
          </ElTableColumn>
          <ElTableColumn label="操作" width="140" align="center" fixed="right">
            <template #default="scope">
              <div class="table-actions" :title="scope.row.id === 1 ? '内置管理员角色不可修改或删除' : undefined">
                <ElButton v-if="canEdit" link type="primary" :disabled="scope.row.id === 1 || busyIds.includes(scope.row.id)" @click="editRole(asRole(scope.row))">修改</ElButton>
                <ElButton v-if="permission.can('web.sys-roles', 'delete')" link type="danger" :disabled="scope.row.id === 1 || busyIds.includes(scope.row.id)" @click="removeRole(asRole(scope.row))">删除</ElButton>
              </div>
            </template>
          </ElTableColumn>
        </ElTable>
      </div>
      <div class="data-pagination">
        <ElPagination v-model:current-page="page" v-model:page-size="size" :total="total" :page-sizes="[10, 20, 50, 100]" layout="total, sizes, prev, pager, next" @size-change="page = 1" />
      </div>
    </section>
    <RoleFormDialog v-model="formVisible" :role="editingRole" @saved="saved" />
  </div>
</template>
