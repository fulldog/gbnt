<script setup lang="ts">
import { ISSUE_TYPES, PROJECT_YEARS } from "@gbnt/api-client";
import type { Issue, SysOrg, SysUser, UpdateIssueInput } from "@gbnt/api-client";
import { ElMessage } from "element-plus";
import type { FormInstance, FormRules } from "element-plus";
import { computed, reactive, shallowRef, watch } from "vue";
import { useAdminApi } from "@/api/runtime";
import OrgTreeSelect from "@/components/OrgTreeSelect.vue";
import PhotoUpload from "@/components/PhotoUpload.vue";
import SignaturePad from "@/components/SignaturePad.vue";
import { ISSUE_TYPE_LABELS, quizIndicatesIssue } from "@/constants/issue";
import { useAuthStore } from "@/stores/auth";
import { errorMessage } from "@/utils/error";
import {
  buildCreateInput,
  createChecklist,
  createIssueDraft,
  draftNeedsRectify,
  validateChecklist,
} from "./issue-form";
import type { ChecklistDraft, IssueFormDraft } from "./issue-form";

interface SignaturePadExpose {
  clear: () => void;
  empty: Readonly<{ value: boolean }>;
  toBlob: () => Promise<Blob>;
}

const { issue = null, orgs } = defineProps<{
  issue?: Issue | null;
  orgs: readonly SysOrg[];
}>();

const emit = defineEmits<{
  saved: [];
}>();

const visible = defineModel<boolean>({ required: true });
const api = useAdminApi();
const auth = useAuthStore();
const formRef = shallowRef<FormInstance>();
const signatureRef = shallowRef<SignaturePadExpose>();
const submitting = shallowRef(false);
const usersLoading = shallowRef(false);
const orgUsers = shallowRef<Array<Pick<SysUser, "id" | "name" | "username">>>([]);
const form = reactive<IssueFormDraft>(createIssueDraft(auth.user?.id));

const editing = computed(() => Boolean(issue));
const needsRectify = computed(() => draftNeedsRectify(form));

const rules: FormRules<IssueFormDraft> = {
  type: [{ required: true, message: "请选择问题类型", trigger: "change" }],
  project_year: [{ required: true, message: "请选择项目年度", trigger: "change" }],
  org_id: [{ required: true, message: "请选择组织", trigger: "change" }],
  address: [{ required: true, message: "请输入定位地址", trigger: "blur" }],
  report_user_id: [{ required: true, message: "请选择上报人", trigger: "change" }],
};

function resetForm(): void {
  const next = createIssueDraft(auth.user?.id);
  if (issue) {
    next.type = issue.type;
    next.project_year = issue.project_year;
    next.org_id = issue.org_id;
    next.code = issue.code;
    next.address = issue.address;
    next.lat = issue.lat;
    next.lng = issue.lng;
    next.plan_date = issue.plan_date;
    next.report_user_id = issue.report_user_id;
    next.checklist = createChecklist(issue.type);
  }
  Object.assign(form, next);
  formRef.value?.clearValidate();
}

async function loadOrgUsers(orgId: number | undefined): Promise<void> {
  if (!orgId) {
    orgUsers.value = [];
    return;
  }
  usersLoading.value = true;
  try {
    const result = await api.users.listByOrg(orgId);
    orgUsers.value = result.list;
    if (!editing.value && !form.report_user_id) {
      form.report_user_id = result.list[0]?.id ?? auth.user?.id;
    }
  } catch {
    orgUsers.value = auth.user
      ? [{ id: auth.user.id, name: auth.user.name, username: auth.user.username }]
      : [];
    form.report_user_id ??= auth.user?.id;
  } finally {
    usersLoading.value = false;
  }
}

watch(
  () => form.type,
  (type, previous) => {
    if (!editing.value && type !== previous) form.checklist = createChecklist(type);
  },
);

watch(
  () => form.org_id,
  (orgId) => {
    if (visible.value) void loadOrgUsers(orgId);
  },
);

watch(visible, (open) => {
  if (!open) return;
  resetForm();
  void loadOrgUsers(form.org_id);
});

async function uploadSignature(): Promise<string> {
  if (!signatureRef.value) throw new Error("电子签名组件未就绪");
  const blob = await signatureRef.value.toBlob();
  const file = new File([blob], `signature-${Date.now()}.png`, { type: "image/png" });
  const result = await api.attachments.uploadImages({ files: [file] });
  const fileId = result.list[0]?.file_id;
  if (!fileId) throw new Error("电子签名上传失败");
  return fileId;
}

function updateChecklistValue(
  item: ChecklistDraft,
  value: string | number | boolean | undefined,
): void {
  item.value = typeof value === "boolean" ? value : null;
}

async function submit(): Promise<void> {
  if (!(await formRef.value?.validate().catch(() => false))) return;

  if (!editing.value) {
    const validationError = validateChecklist(form);
    if (validationError) {
      ElMessage.error(validationError);
      return;
    }
  }

  submitting.value = true;
  try {
    if (issue) {
      if (!form.org_id) throw new Error("请选择组织");
      const input: UpdateIssueInput = {
        project_year: form.project_year,
        org_id: form.org_id,
        code: form.code.trim(),
        address: form.address.trim(),
        lat: form.lat ?? 0,
        lng: form.lng ?? 0,
        plan_date: form.plan_date,
      };
      await api.issues.update(issue.id, input);
      ElMessage.success("基础信息已更新");
    } else {
      const signatureFileId = await uploadSignature();
      await api.issues.create(buildCreateInput(form, signatureFileId));
      ElMessage.success("排查记录已新增");
    }
    visible.value = false;
    emit("saved");
  } catch (error) {
    ElMessage.error(errorMessage(error, editing.value ? "更新失败" : "新增失败"));
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <ElDialog
    v-model="visible"
    :title="editing ? '编辑排查记录' : '新增排查记录'"
    width="min(1040px, 96vw)"
    top="4vh"
    destroy-on-close
    :close-on-click-modal="false"
  >
    <ElAlert
      v-if="editing"
      class="mb-5"
      type="info"
      show-icon
      :closable="false"
      title="当前后端更新接口仅保存基础信息，排查清单与电子签名在编辑时只读。"
    />

    <ElForm ref="formRef" :model="form" :rules="rules" label-position="top" scroll-to-error>
      <section>
        <h3 class="mt-0 mb-4 text-base font-semibold text-slate-900">基础信息</h3>
        <div class="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
          <ElFormItem label="问题类型" prop="type">
            <ElSelect v-model="form.type" :disabled="editing" class="w-full">
              <ElOption v-for="type in ISSUE_TYPES" :key="type" :label="ISSUE_TYPE_LABELS[type]" :value="type" />
            </ElSelect>
          </ElFormItem>
          <ElFormItem label="项目年度" prop="project_year">
            <ElSelect v-model="form.project_year" class="w-full">
              <ElOption v-for="year in PROJECT_YEARS" :key="year" :label="`${year} 年`" :value="year" />
            </ElSelect>
          </ElFormItem>
          <ElFormItem label="设施编号">
            <ElInput v-model="form.code" maxlength="64" placeholder="请输入设施编号" />
          </ElFormItem>
          <ElFormItem label="所属组织" prop="org_id" class="lg:col-span-2">
            <OrgTreeSelect v-model="form.org_id" :orgs="orgs" :clearable="false" />
          </ElFormItem>
          <ElFormItem v-if="!editing" label="上报人" prop="report_user_id">
            <ElSelect v-model="form.report_user_id" filterable :loading="usersLoading" class="w-full">
              <ElOption
                v-for="user in orgUsers"
                :key="user.id"
                :label="`${user.name || user.username}（${user.username}）`"
                :value="user.id"
              />
            </ElSelect>
          </ElFormItem>
          <ElFormItem label="定位地址" prop="address" class="sm:col-span-2 lg:col-span-3">
            <ElInput v-model="form.address" maxlength="255" show-word-limit placeholder="请输入详细定位地址" />
          </ElFormItem>
          <ElFormItem label="纬度">
            <ElInputNumber v-model="form.lat" :precision="6" :controls="false" class="!w-full" />
          </ElFormItem>
          <ElFormItem label="经度">
            <ElInputNumber v-model="form.lng" :precision="6" :controls="false" class="!w-full" />
          </ElFormItem>
          <ElFormItem label="计划整改完成日期">
            <ElDatePicker
              v-model="form.plan_date"
              type="date"
              value-format="YYYY-MM-DD"
              placeholder="无需整改时可留空"
              class="!w-full"
            />
          </ElFormItem>
        </div>
      </section>

      <template v-if="!editing">
        <ElDivider />
        <section>
          <h3 class="mt-0 mb-4 text-base font-semibold text-slate-900">{{ ISSUE_TYPE_LABELS[form.type] }}属性</h3>

          <div v-if="form.type === 'well'" class="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
            <ElFormItem label="设施类型">
              <ElSelect v-model="form.build_kind" class="w-full">
                <ElOption label="新建" value="new" />
                <ElOption label="配套" value="match" />
              </ElSelect>
            </ElFormItem>
            <ElFormItem label="出水口总数"><ElInputNumber v-model="form.outlet_total" :min="0" class="!w-full" /></ElFormItem>
            <ElFormItem label="出水口损坏数量"><ElInputNumber v-model="form.outlet_damaged" :min="0" class="!w-full" /></ElFormItem>
            <ElFormItem label="护筒总数"><ElInputNumber v-model="form.casing_total" :min="0" class="!w-full" /></ElFormItem>
            <ElFormItem label="护筒损坏数量"><ElInputNumber v-model="form.casing_damaged" :min="0" class="!w-full" /></ElFormItem>
          </div>

          <div v-else-if="form.type === 'road'" class="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-4">
            <ElFormItem label="长度（千米）"><ElInputNumber v-model="form.length" :min="0" :precision="2" class="!w-full" /></ElFormItem>
            <ElFormItem label="宽度（米）"><ElInputNumber v-model="form.width" :min="0" :precision="2" class="!w-full" /></ElFormItem>
            <ElFormItem label="厚度（米）"><ElInputNumber v-model="form.thickness" :min="0" :precision="2" class="!w-full" /></ElFormItem>
            <ElFormItem label="林网树木存活数量"><ElInputNumber v-model="form.tree_survive" :min="0" class="!w-full" /></ElFormItem>
          </div>

          <div v-else-if="form.type === 'bridge'" class="grid gap-x-4 sm:grid-cols-3">
            <ElFormItem label="设施类型">
              <ElSelect v-model="form.bridge_kind" class="w-full">
                <ElOption label="桥" value="bridge" />
                <ElOption label="涵" value="culvert" />
                <ElOption label="闸" value="gate" />
              </ElSelect>
            </ElFormItem>
            <ElFormItem label="长度（米）"><ElInputNumber v-model="form.length" :min="0" :precision="2" class="!w-full" /></ElFormItem>
            <ElFormItem label="宽度（米）"><ElInputNumber v-model="form.width" :min="0" :precision="2" class="!w-full" /></ElFormItem>
          </div>

          <div v-else-if="form.type === 'forest'" class="grid gap-x-4 sm:grid-cols-3">
            <ElFormItem label="移交株数"><ElInputNumber v-model="form.handover_count" :min="0" class="!w-full" /></ElFormItem>
            <ElFormItem label="现有株数"><ElInputNumber v-model="form.existing_count" :min="0" class="!w-full" /></ElFormItem>
            <ElFormItem label="存活率（%）"><ElInputNumber v-model="form.survive_rate" :min="0" :max="100" :precision="2" class="!w-full" /></ElFormItem>
          </div>

          <div v-else class="grid gap-x-4 sm:grid-cols-3">
            <ElFormItem label="容量（kVA）"><ElInputNumber v-model="form.capacity" :min="0" :precision="2" class="!w-full" /></ElFormItem>
            <ElFormItem label="型号"><ElInput v-model="form.model" /></ElFormItem>
            <ElFormItem label="电压等级">
              <ElSelect v-model="form.voltage" class="w-full">
                <ElOption label="10kV" value="10kv" />
                <ElOption label="0.4kV" value="0.4kv" />
              </ElSelect>
            </ElFormItem>
          </div>

          <div class="grid gap-x-4 sm:grid-cols-2">
            <ElFormItem label="负责人"><ElInput v-model="form.keeper_name" maxlength="64" /></ElFormItem>
            <ElFormItem label="联系电话"><ElInput v-model="form.keeper_phone" maxlength="32" /></ElFormItem>
          </div>
        </section>

        <ElDivider />
        <section>
          <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h3 class="m-0 text-base font-semibold text-slate-900">排查清单</h3>
            <ElTag :type="needsRectify ? 'danger' : 'success'">
              {{ needsRectify ? '后端将判定为需整改' : '当前答案未判定需整改' }}
            </ElTag>
          </div>

          <div class="space-y-4">
            <article v-for="(item, index) in form.checklist" :key="item.type" class="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
              <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
                <strong class="text-sm text-slate-900">{{ index + 1 }}. {{ item.label }}</strong>
                <span class="text-xs text-slate-500">{{ item.negative ? '是 = 有问题' : '否 = 有问题' }}</span>
              </div>
              <ElRadioGroup
                :model-value="item.value ?? undefined"
                @update:model-value="updateChecklistValue(item, $event)"
              >
                <ElRadio :value="true">是</ElRadio>
                <ElRadio :value="false">否</ElRadio>
              </ElRadioGroup>
              <ElInput
                v-model="item.desc"
                class="mt-3"
                type="textarea"
                :rows="2"
                maxlength="500"
                show-word-limit
                :placeholder="item.value !== null && quizIndicatesIssue(item.value, item.negative) ? '存在问题，说明必填' : '补充说明（选填）'"
              />
              <div v-if="item.mustImg" class="mt-3">
                <PhotoUpload v-model="item.files" />
              </div>
            </article>
          </div>
        </section>

        <ElDivider />
        <section>
          <h3 class="mt-0 mb-4 text-base font-semibold text-slate-900">上报人电子签名</h3>
          <SignaturePad ref="signatureRef" />
        </section>
      </template>
    </ElForm>

    <template #footer>
      <ElButton @click="visible = false">取消</ElButton>
      <ElButton type="primary" :loading="submitting" @click="submit">
        {{ editing ? '保存基础信息' : '提交排查记录' }}
      </ElButton>
    </template>
  </ElDialog>
</template>
