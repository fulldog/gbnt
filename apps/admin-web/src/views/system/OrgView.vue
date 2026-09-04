<script setup lang="ts">
import type { OrgTreeNode, OrgType, SysOrg } from "@gbnt/api-client";
import { Delete, Edit, Plus, Refresh } from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox, vLoading } from "element-plus";
import type { FormInstance, FormRules } from "element-plus";
import { computed, onMounted, reactive, shallowRef } from "vue";
import { useAdminApi } from "@/api/runtime";
import AsyncError from "@/components/AsyncError.vue";
import PageHeader from "@/components/PageHeader.vue";
import { usePermissionStore } from "@/stores/permission";
import { errorMessage } from "@/utils/error";
import { buildOrgTree } from "@/utils/org";

const ORG_TYPE_LABELS: Record<OrgType, string> = {
  root: "根组织",
  district: "区",
  street: "街道",
  village: "村/社区",
};

const api = useAdminApi();
const permission = usePermissionStore();
const loading = shallowRef(false);
const submitting = shallowRef(false);
const loadError = shallowRef("");
const orgs = shallowRef<SysOrg[]>([]);
const dialogVisible = shallowRef(false);
const editing = shallowRef<SysOrg | null>(null);
const formRef = shallowRef<FormInstance>();
const form = reactive({ name: "", parent_id: 0, sort: 0 as number | undefined });
const tree = computed(() => buildOrgTree(orgs.value));
const byId = computed(() => new Map(orgs.value.map((org) => [org.id, org])));
const rules: FormRules<typeof form> = {
  name: [{ required: true, message: "请输入组织名称", trigger: "blur" }],
};

function isCancelled(error: unknown): boolean {
  return error === "cancel" || error === "close";
}

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = "";
  try {
    orgs.value = await api.orgs.list();
  } catch (error) {
    loadError.value = errorMessage(error, "组织架构加载失败");
  } finally {
    loading.value = false;
  }
}

function createRoot(): void {
  editing.value = null;
  form.name = "";
  form.parent_id = 0;
  form.sort = 0;
  dialogVisible.value = true;
}

function createChild(parent: OrgTreeNode): void {
  editing.value = null;
  form.name = "";
  form.parent_id = parent.id;
  form.sort = 0;
  dialogVisible.value = true;
}

function edit(node: OrgTreeNode): void {
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
  <div class="space-y-5">
    <PageHeader title="组织架构" description="维护 root、district、street、village 四级组织结构。">
      <template #actions>
        <ElButton :icon="Refresh" :loading="loading" @click="load">刷新</ElButton>
        <ElButton v-if="permission.can('web.sys-org', 'create')" type="primary" :icon="Plus" @click="createRoot">新增根组织</ElButton>
      </template>
    </PageHeader>

    <AsyncError v-if="loadError" :message="loadError" @retry="load" />

    <section class="page-card overflow-hidden">
      <ElTable
        v-loading="loading"
        :data="tree"
        row-key="id"
        default-expand-all
        :tree-props="{ children: 'children' }"
        empty-text="暂无组织数据"
      >
        <ElTableColumn prop="name" label="组织名称" min-width="260" />
        <ElTableColumn label="组织类型" width="120"><template #default="scope">{{ ORG_TYPE_LABELS[scope.row.type as OrgType] }}</template></ElTableColumn>
        <ElTableColumn prop="sort" label="排序" width="100" align="center" />
        <ElTableColumn prop="id" label="组织 ID" width="110" align="center" />
        <ElTableColumn label="操作" width="240" fixed="right">
          <template #default="scope">
            <div class="table-actions">
              <ElButton
                v-if="permission.can('web.sys-org', 'create') && scope.row.type !== 'village'"
                link
                type="primary"
                :icon="Plus"
                @click="createChild(asOrgNode(scope.row))"
              >新增下级</ElButton>
              <ElButton v-if="permission.can('web.sys-org', 'edit')" link type="primary" :icon="Edit" @click="edit(asOrgNode(scope.row))">改名</ElButton>
              <ElButton
                v-if="permission.can('web.sys-org', 'delete') && scope.row.type !== 'root' && !scope.row.children.length"
                link
                type="danger"
                :icon="Delete"
                @click="remove(asOrgNode(scope.row))"
              >删除</ElButton>
            </div>
          </template>
        </ElTableColumn>
      </ElTable>
    </section>

    <ElDialog v-model="dialogVisible" :title="editing ? '修改组织名称' : '新增组织'" width="min(480px, 92vw)" destroy-on-close>
      <ElForm ref="formRef" :model="form" :rules="rules" label-position="top">
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
