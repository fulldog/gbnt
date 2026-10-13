<script setup lang="ts">
import type { FormInstance, FormRules } from "element-plus";
import type { HandoverInput, HandoverListResult, HandoverRecord } from "@/api/handovers";
import type { OrgOption } from "@/api/types";
import { Plus } from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox, vLoading } from "element-plus";
import { computed, onMounted, reactive, shallowRef, useTemplateRef } from "vue";
import { useAdminApi } from "@/api/runtime";
import AsyncError from "@/components/AsyncError.vue";
import OrgTreeSelect from "@/components/OrgTreeSelect.vue";
import QueryPanel from "@/components/QueryPanel.vue";
import TableToolbar from "@/components/TableToolbar.vue";
import { useLatestQuery } from "@/composables/useLatestQuery";
import { usePermissionStore } from "@/stores/permission";
import { errorMessage } from "@/utils/error";

const years = [2020, 2021, 2022, 2023] as const;
const countFields = [
  ["well_handover", "机井"],
  ["bridge_handover", "桥涵闸"],
  ["road_handover", "道路"],
  ["forest_handover", "林网"],
  ["transformer_handover", "变压器"],
] as const;

const api = useAdminApi();
const permission = usePermissionStore();
const tablePage = useTemplateRef<HTMLElement>("tablePage");
const formRef = useTemplateRef<FormInstance>("formRef");
const filtersVisible = shallowRef(true);
const page = shallowRef(1);
const size = shallowRef(20);
const filters = reactive<{ org_id?: number; project_year?: number }>({});
const applied = shallowRef<{ org_id?: number; project_year?: number }>({});
const orgs = shallowRef<OrgOption[]>([]);
const formVisible = shallowRef(false);
const saving = shallowRef(false);
const editing = shallowRef<HandoverRecord | null>(null);
const busyIds = shallowRef<number[]>([]);
interface HandoverForm {
  org_id?: number;
  project_year?: number;
  well_handover: number | undefined;
  bridge_handover: number | undefined;
  road_handover: number | undefined;
  forest_handover: number | undefined;
  transformer_handover: number | undefined;
  remark: string;
}
const form = reactive<HandoverForm>({
  org_id: undefined, project_year: undefined, well_handover: 0, bridge_handover: 0,
  road_handover: 0, forest_handover: 0, transformer_handover: 0, remark: "",
});

const columns = [
  { key: "org", label: "组织" }, { key: "year", label: "建设年份" },
  ...countFields.map(([key, label]) => ({ key, label: `${label}移交` })),
  { key: "remark", label: "备注" },
];
const visibleColumns = shallowRef(columns.map((column) => column.key));
const canCreate = computed(() => permission.can("web.ledger-handover", "create"));
const canEdit = computed(() => permission.can("web.ledger-handover", "edit"));
const canDelete = computed(() => permission.can("web.ledger-handover", "delete"));

const { data, loading, loadError, hasLoaded, run: load } = useLatestQuery<HandoverListResult>({
  initial: () => ({ list: [], total: 0, page: 1, size: 20 }),
  load: () => api.handovers.list({
    org_id: applied.value.org_id,
    project_year: applied.value.project_year,
    page: page.value,
    size: size.value,
  }),
  errorMessage: "移交数量加载失败",
});

function requiredCount(_: unknown, value: number, callback: (error?: Error) => void): void {
  if (!Number.isSafeInteger(value) || value < 0) callback(new Error("请输入不小于 0 的整数"));
  else callback();
}
const rules: FormRules = {
  org_id: [{ required: true, type: "number", message: "请选择组织", trigger: "change" }],
  project_year: [{ required: true, type: "number", message: "请选择建设年份", trigger: "change" }],
  ...Object.fromEntries(countFields.map(([key]) => [key, [{ validator: requiredCount, trigger: "change" }]])),
  remark: [{ max: 255, message: "备注不能超过 255 字", trigger: "blur" }],
};

function search(): void {
  applied.value = { org_id: filters.org_id, project_year: filters.project_year };
  page.value = 1;
  void load();
}
function reset(): void {
  filters.org_id = undefined;
  filters.project_year = undefined;
  search();
}
function openCreate(): void {
  if (!canCreate.value) return;
  editing.value = null;
  Object.assign(form, {
    org_id: undefined, project_year: undefined, well_handover: 0, bridge_handover: 0,
    road_handover: 0, forest_handover: 0, transformer_handover: 0, remark: "",
  });
  formVisible.value = true;
}
function openEdit(row: HandoverRecord): void {
  if (!canEdit.value) return;
  editing.value = row;
  Object.assign(form, {
    org_id: row.org_id, project_year: row.project_year, well_handover: row.well_handover,
    bridge_handover: row.bridge_handover, road_handover: row.road_handover,
    forest_handover: row.forest_handover, transformer_handover: row.transformer_handover, remark: row.remark,
  });
  formVisible.value = true;
}
async function submit(): Promise<void> {
  if (saving.value || !(await formRef.value?.validate().catch(() => false))) return;
  if (form.org_id === undefined || form.project_year === undefined || form.well_handover === undefined || form.bridge_handover === undefined || form.road_handover === undefined || form.forest_handover === undefined || form.transformer_handover === undefined) return;
  const input: HandoverInput = {
    org_id: form.org_id, project_year: form.project_year, well_handover: form.well_handover,
    bridge_handover: form.bridge_handover, road_handover: form.road_handover,
    forest_handover: form.forest_handover, transformer_handover: form.transformer_handover,
    remark: form.remark?.trim() ?? "",
  };
  saving.value = true;
  try {
    if (editing.value) await api.handovers.update(editing.value.id, input);
    else await api.handovers.create(input);
    ElMessage.success(editing.value ? "移交数量已保存" : "移交数量已新增");
    formVisible.value = false;
    await load();
  } catch (error) {
    ElMessage.error(errorMessage(error, "移交数量保存失败"));
  } finally {
    saving.value = false;
  }
}
async function remove(row: HandoverRecord): Promise<void> {
  if (!canDelete.value || busyIds.value.includes(row.id)) return;
  busyIds.value = [...busyIds.value, row.id];
  try {
    await ElMessageBox.confirm(`确定删除${row.org_name ?? "该组织"} ${row.project_year} 年的移交数量吗？`, "删除确认", {
      confirmButtonText: "删除", cancelButtonText: "取消", type: "warning",
    });
    await api.handovers.remove(row.id);
    ElMessage.success("移交数量已删除");
    await load();
  } catch (error) {
    if (error !== "cancel" && error !== "close") ElMessage.error(errorMessage(error, "移交数量删除失败"));
  } finally {
    busyIds.value = busyIds.value.filter((id) => id !== row.id);
  }
}
function asRow(row: unknown): HandoverRecord { return row as HandoverRecord; }

onMounted(async () => {
  try {
    orgs.value = await api.orgs.list();
  } catch (error) {
    ElMessage.error(errorMessage(error, "组织列表加载失败"));
  }
  void load();
});
</script>

<template>
  <div ref="tablePage" class="data-page">
    <QueryPanel v-show="filtersVisible" :loading="loading" @search="search" @reset="reset">
      <ElFormItem label="组织"><OrgTreeSelect v-model="filters.org_id" :orgs="orgs" placeholder="全部组织" /></ElFormItem>
      <ElFormItem label="建设年份">
        <ElSelect v-model="filters.project_year" clearable placeholder="全部年份" class="w-full">
          <ElOption v-for="year in years" :key="year" :label="String(year)" :value="year" />
        </ElSelect>
      </ElFormItem>
    </QueryPanel>
    <AsyncError v-if="loadError" :message="loadError" @retry="load" />
    <section class="data-card">
      <TableToolbar v-model:filters-visible="filtersVisible" v-model:visible-columns="visibleColumns" title="移交数量管理" :columns="columns" :loading="loading" :target="() => tablePage" @refresh="load">
        <ElButton type="primary" :icon="Plus" :disabled="!canCreate || loading" @click="openCreate">新增</ElButton>
      </TableToolbar>
      <div class="data-table">
        <ElTable height="100%" v-loading="loading" :data="data.list" row-key="id" :empty-text="loading ? '正在加载…' : loadError ? '加载失败，请重试' : '暂无移交数量'">
          <ElTableColumn type="index" label="序号" width="70" align="center" :index="(index: number) => (page - 1) * size + index + 1" />
          <ElTableColumn v-if="visibleColumns.includes('org')" prop="org_name" label="组织" min-width="160" align="center" show-overflow-tooltip />
          <ElTableColumn v-if="visibleColumns.includes('year')" prop="project_year" label="建设年份" width="110" align="center" />
          <ElTableColumn v-if="visibleColumns.includes('well_handover')" prop="well_handover" label="机井移交" width="110" align="center" />
          <ElTableColumn v-if="visibleColumns.includes('bridge_handover')" prop="bridge_handover" label="桥涵闸移交" width="120" align="center" />
          <ElTableColumn v-if="visibleColumns.includes('road_handover')" prop="road_handover" label="道路移交" width="110" align="center" />
          <ElTableColumn v-if="visibleColumns.includes('forest_handover')" prop="forest_handover" label="林网移交" width="110" align="center" />
          <ElTableColumn v-if="visibleColumns.includes('transformer_handover')" prop="transformer_handover" label="变压器移交" width="120" align="center" />
          <ElTableColumn v-if="visibleColumns.includes('remark')" prop="remark" label="备注" min-width="180" align="center" show-overflow-tooltip />
          <ElTableColumn label="操作" width="140" align="center" fixed="right">
            <template #default="scope">
              <div class="table-actions">
                <ElButton link type="primary" :disabled="!canEdit" @click="openEdit(asRow(scope.row))">修改</ElButton>
                <ElButton link type="danger" :disabled="!canDelete || busyIds.includes(scope.row.id)" @click="remove(asRow(scope.row))">删除</ElButton>
              </div>
            </template>
          </ElTableColumn>
        </ElTable>
      </div>
      <div v-if="hasLoaded" class="data-pagination">
        <ElPagination v-model:current-page="page" v-model:page-size="size" :total="data.total" :page-sizes="[10, 20, 50, 100]" layout="total, sizes, prev, pager, next" @current-change="load" @size-change="page = 1; load()" />
      </div>
    </section>

    <ElDialog v-model="formVisible" :title="editing ? '修改移交数量' : '新增移交数量'" width="min(640px, 96vw)" destroy-on-close>
      <ElForm ref="formRef" :model="form" :rules="rules" label-width="110px">
        <ElFormItem label="组织" prop="org_id"><OrgTreeSelect v-model="form.org_id" :orgs="orgs" :clearable="false" placeholder="请选择组织" /></ElFormItem>
        <ElFormItem label="建设年份" prop="project_year">
          <ElSelect v-model="form.project_year" placeholder="请选择年份" class="w-full">
            <ElOption v-for="year in years" :key="year" :label="String(year)" :value="year" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="机井移交" prop="well_handover"><ElInputNumber v-model="form.well_handover" :min="0" :precision="0" :step="1" controls-position="right" class="w-full" /></ElFormItem>
        <ElFormItem label="桥涵闸移交" prop="bridge_handover"><ElInputNumber v-model="form.bridge_handover" :min="0" :precision="0" :step="1" controls-position="right" class="w-full" /></ElFormItem>
        <ElFormItem label="道路移交" prop="road_handover"><ElInputNumber v-model="form.road_handover" :min="0" :precision="0" :step="1" controls-position="right" class="w-full" /></ElFormItem>
        <ElFormItem label="林网移交" prop="forest_handover"><ElInputNumber v-model="form.forest_handover" :min="0" :precision="0" :step="1" controls-position="right" class="w-full" /></ElFormItem>
        <ElFormItem label="变压器移交" prop="transformer_handover"><ElInputNumber v-model="form.transformer_handover" :min="0" :precision="0" :step="1" controls-position="right" class="w-full" /></ElFormItem>
        <ElFormItem label="备注" prop="remark"><ElInput v-model="form.remark" type="textarea" maxlength="255" show-word-limit placeholder="选填" /></ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="formVisible = false">取消</ElButton>
        <ElButton type="primary" :loading="saving" @click="submit">保存</ElButton>
      </template>
    </ElDialog>
  </div>
</template>
