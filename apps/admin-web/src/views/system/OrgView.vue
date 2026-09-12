<script setup lang="ts">
import type { OrgTreeNode, OrgType, SysOrg } from "@gbnt/api-client";
import { Plus } from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox, vLoading } from "element-plus";
import type { FormInstance, FormRules, TableInstance } from "element-plus";
import { computed, onMounted, reactive, shallowRef, useTemplateRef } from "vue";
import { useAdminApi } from "@/api/runtime";
import AsyncError from "@/components/AsyncError.vue";
import TableToolbar from "@/components/TableToolbar.vue";
import { useLatestQuery } from "@/composables/useLatestQuery";
import { usePermissionStore } from "@/stores/permission";
import { useAuthStore } from "@/stores/auth";
import { errorMessage } from "@/utils/error";
import { buildOrgTree } from "@/utils/org";

const ORG_TYPE_LABELS: Record<OrgType, string> = {
  root: "根组织",
  district: "区",
  street: "街道",
  village: "村/社区",
};

const tablePage = useTemplateRef<HTMLElement>("tablePage");
const orgTable = useTemplateRef<TableInstance>("orgTable");
function expandAll(value: boolean): void {
  function visit(nodes: readonly OrgTreeNode[]): void {
    for (const node of nodes) { orgTable.value?.toggleRowExpansion(node, value); visit(node.children); }
  }
  visit(tree.value);
}
const api = useAdminApi();
const permission = usePermissionStore();
const auth = useAuthStore();
const submitting = shallowRef(false);
const { data: orgs, loading, loadError, run: load } = useLatestQuery<SysOrg[]>({
  initial: () => [],
  load: () => api.orgs.list(),
  errorMessage: "组织架构加载失败",
});
const dialogVisible = shallowRef(false);
const editing = shallowRef<SysOrg | null>(null);
const formRef = shallowRef<FormInstance>();
const form = reactive({ name: "", parent_id: 0, sort: 0 as number | undefined });
const tree = computed(() => buildOrgTree(orgs.value));
const byId = computed(() => new Map(orgs.value.map((org) => [org.id, org])));
const currentOrg = computed(() => orgs.value.find((org) => org.id === auth.user?.org_id));
const rules: FormRules<typeof form> = {
  name: [{ required: true, message: "请输入组织名称", trigger: "blur" }],
};
const canCreateRoot = computed(() => permission.can("web.sys-org", "create") && auth.user?.is_super_admin === true);
const canCreateCurrentChild = computed(() =>
  permission.can("web.sys-org", "create") &&
  Boolean(currentOrg.value?.within_org_scope === true && currentOrg.value.type !== "village"),
);

function withinScope(node: Pick<OrgTreeNode, "within_org_scope">): boolean {
  return node.within_org_scope === true;
}

function actionTitle(action: "create" | "edit" | "delete", node?: OrgTreeNode): string {
  if (!permission.can("web.sys-org", action)) return `无${action === "create" ? "新增" : action === "edit" ? "修改" : "删除"}权限`;
  if (node && !withinScope(node)) return "仅可操作本组织及下级组织";
  if (action === "create" && node?.type === "village") return "村/社区为当前末级，不能新增下级单位";
  if (action === "delete" && node?.id === auth.user?.org_id && !auth.user?.is_super_admin) return "不能删除当前账号所属组织";
  if (action === "delete" && (node?.type === "root" || node?.parent_id === 0)) return "根组织不可删除";
  if (action === "delete" && node?.children.length) return "请先删除下级单位";
  return "";
}

function isCancelled(error: unknown): boolean {
  return error === "cancel" || error === "close";
}

function createRoot(): void {
  if (!canCreateRoot.value) return;
  editing.value = null;
  form.name = "";
  form.parent_id = 0;
  form.sort = 0;
  dialogVisible.value = true;
}

function createCurrentChild(): void {
  const parent = currentOrg.value;
  if (!parent || !canCreateCurrentChild.value) return;
  editing.value = null;
  form.name = "";
  form.parent_id = parent.id;
  form.sort = 0;
  dialogVisible.value = true;
}

function createChild(parent: OrgTreeNode): void {
  if (!permission.can("web.sys-org", "create") || !withinScope(parent) || parent.type === "village") return;
  editing.value = null;
  form.name = "";
  form.parent_id = parent.id;
  form.sort = 0;
  dialogVisible.value = true;
}

function edit(node: OrgTreeNode): void {
  if (!permission.can("web.sys-org", "edit") || !withinScope(node)) return;
  editing.value = byId.value.get(node.id) ?? null;
  form.name = node.name;
  form.parent_id = node.parent_id;
  form.sort = node.sort;
  dialogVisible.value = true;
}

function asOrgNode(row: unknown): OrgTreeNode {
  return row as OrgTreeNode;
}

async function submit(): Promise<void> {
  if (!(await formRef.value?.validate().catch(() => false))) return;
  submitting.value = true;
  try {
    if (editing.value) {
      await api.orgs.update(editing.value.id, { name: form.name.trim() });
      ElMessage.success("组织名称已更新");
    } else {
      await api.orgs.create({ name: form.name.trim(), parent_id: form.parent_id, sort: form.sort || undefined });
      ElMessage.success("组织已新增");
    }
    dialogVisible.value = false;
    await load();
  } catch (error) {
    ElMessage.error(errorMessage(error, editing.value ? "组织更新失败" : "组织新增失败"));
  } finally {
    submitting.value = false;
  }
}

async function remove(node: OrgTreeNode): Promise<void> {
  if (!permission.can("web.sys-org", "delete") || !withinScope(node) || node.type === "root" || node.parent_id === 0 ||
    (node.id === auth.user?.org_id && !auth.user?.is_super_admin)) return;
  if (node.children.length) {
    ElMessage.warning("请先删除下级单位");
    return;
  }
  try {
    await ElMessageBox.confirm(`确定删除组织“${node.name}”吗？`, "删除确认", {
      confirmButtonText: "删除",
      cancelButtonText: "取消",
      type: "warning",
    });
    await api.orgs.remove(node.id);
    ElMessage.success("组织已删除");
    await load();
  } catch (error) {
    if (!isCancelled(error)) ElMessage.error(errorMessage(error, "组织删除失败"));
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div ref="tablePage" class="data-page">
    <AsyncError v-if="loadError" :message="loadError" @retry="load" />

    <section class="data-card">
      <TableToolbar title="单位列表" :filterable="false" :loading="loading" :target="() => tablePage" @refresh="load">
        <ElButtonGroup><ElButton @click="expandAll(true)">展开全部</ElButton><ElButton @click="expandAll(false)">折叠全部</ElButton></ElButtonGroup>
        <ElButton type="primary" :icon="Plus" :disabled="!canCreateCurrentChild" v-bind="{ title: '在当前账号所属组织下新增单位' }" @click="createCurrentChild">新增下级组织</ElButton>
        <ElButton type="primary" :icon="Plus" :disabled="!canCreateRoot" v-bind="{ title: canCreateRoot ? '新增根组织' : !permission.can('web.sys-org', 'create') ? '无新增权限' : '只有超级管理员可以新增根组织' }" @click="createRoot">新增根组织</ElButton>
      </TableToolbar>
      <div class="data-table">
      <ElTable ref="orgTable" height="100%"
        v-loading="loading"
        :data="tree"
        row-key="id"
        default-expand-all
        :tree-props="{ children: 'children' }"
        :empty-text="loading ? '正在加载…' : loadError ? '加载失败，请重试' : '暂无组织数据'"
      >
        <ElTableColumn prop="name" label="单位名称" align="left" min-width="260" />
        <ElTableColumn label="组织类型" width="120"><template #default="scope">{{ ORG_TYPE_LABELS[scope.row.type as OrgType] }}</template></ElTableColumn>
        <ElTableColumn prop="sort" label="排序" width="100" align="center" />
        <ElTableColumn prop="id" label="组织 ID" width="110" align="center" />
        <ElTableColumn label="操作" width="240" fixed="right" align="center">
          <template #default="scope">
            <div class="table-actions">
              <ElButton
                link
                type="primary"
                :disabled="!permission.can('web.sys-org', 'create') || scope.row.within_org_scope !== true || scope.row.type === 'village'"
                v-bind="{ title: actionTitle('create', asOrgNode(scope.row)) }"
                @click="createChild(asOrgNode(scope.row))"
              >新增单位</ElButton>
              <ElButton link type="primary" :disabled="!permission.can('web.sys-org', 'edit') || scope.row.within_org_scope !== true" v-bind="{ title: actionTitle('edit', asOrgNode(scope.row)) }" @click="edit(asOrgNode(scope.row))">修改</ElButton>
              <ElButton
                link
                type="danger"
                :disabled="!permission.can('web.sys-org', 'delete') || scope.row.within_org_scope !== true || scope.row.type === 'root' || scope.row.parent_id === 0 || (scope.row.id === auth.user?.org_id && !auth.user?.is_super_admin) || scope.row.children.length > 0"
                v-bind="{ title: actionTitle('delete', asOrgNode(scope.row)) }"
                @click="remove(asOrgNode(scope.row))"
              >删除</ElButton>
            </div>
          </template>
        </ElTableColumn>
      </ElTable>
      </div>
    </section>

    <ElDialog v-model="dialogVisible" :title="editing ? '修改组织名称' : '新增组织'" width="min(480px, 92vw)" destroy-on-close>
      <ElForm ref="formRef" :model="form" :rules="rules" label-position="right" label-width="90px">
        <ElFormItem v-if="!editing" label="上级组织">
          <ElInput :model-value="form.parent_id ? byId.get(form.parent_id)?.name ?? `组织 #${form.parent_id}` : '无（根组织）'" disabled />
        </ElFormItem>
        <ElFormItem label="组织名称" prop="name">
          <ElInput v-model="form.name" maxlength="128" show-word-limit />
        </ElFormItem>
        <ElFormItem v-if="!editing" label="排序号">
          <ElInputNumber v-model="form.sort" :min="0" class="!w-full" />
          <p class="mt-1 mb-0 text-xs text-slate-500">填写 0 时由后端追加到同级末尾。</p>
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="dialogVisible = false">取消</ElButton>
        <ElButton type="primary" :loading="submitting" @click="submit">保存</ElButton>
      </template>
    </ElDialog>
  </div>
</template>
