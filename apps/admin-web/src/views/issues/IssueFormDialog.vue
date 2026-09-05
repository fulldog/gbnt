<script setup lang="ts">
import { ISSUE_TYPES, PROJECT_YEARS } from "@gbnt/api-client";
import type { Issue, UpdateIssueInput } from "@gbnt/api-client";
import { ElMessage } from "element-plus";
import type { FormInstance, FormRules } from "element-plus";
import { computed, onScopeDispose, reactive, shallowRef, watch } from "vue";
import { useAdminApi } from "@/api/runtime";
import type { OrgOption, UserOptionQuery } from "@/api/types";
import BusinessUserSelect from "@/components/BusinessUserSelect.vue";
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

const { issue = null, orgs, orgsReady = true } = defineProps<{
  issue?: Issue | null;
  orgs: readonly OrgOption[];
  orgsReady?: boolean;
}>();

const emit = defineEmits<{
  saved: [issueId: number];
}>();

const visible = defineModel<boolean>({ required: true });
const api = useAdminApi();
const auth = useAuthStore();
const formRef = shallowRef<FormInstance>();
const signatureRef = shallowRef<SignaturePadExpose>();
const submitting = shallowRef(false);
const reporterReady = shallowRef(false);
const photoSession = shallowRef(0);
const uploadingQuestions = shallowRef<ReadonlySet<ChecklistDraft>>(new Set());
const photosUploading = computed(() => uploadingQuestions.value.size > 0);
const form = reactive<IssueFormDraft>(createIssueDraft(auth.user?.id));
let session = 0;
onScopeDispose(() => { session += 1; });

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

function loadReporters(query: UserOptionQuery) {
  if (!form.org_id) return Promise.reject(new Error("请先选择组织"));
  return api.issues.listReporterOptions({ ...query, org_id: form.org_id });
}

function resetPhotoUploads(): void {
  photoSession.value += 1;
  uploadingQuestions.value = new Set();
}

function updatePhotoUploading(item: ChecklistDraft, busy: boolean): void {
  // 旧题目组件卸载/请求完成时，不得覆盖新弹窗或新题型的上传状态。
  if (!visible.value || !form.checklist.includes(item)) return;
  const next = new Set(uploadingQuestions.value);
  if (busy) next.add(item);
  else next.delete(item);
  uploadingQuestions.value = next;
}

watch(
  () => form.type,
  (type, previous) => {
    if (!editing.value && type !== previous) {
      resetPhotoUploads();
      form.checklist = createChecklist(type);
    }
  },
  { flush: "sync" },
);

watch(
  () => form.org_id,
  () => {
    reporterReady.value = false;
    if (!editing.value) form.report_user_id = undefined;
  },
  { flush: "sync" },
);

watch(() => [visible.value, issue?.id] as const, ([open]) => {
  session += 1;
  submitting.value = false;
  reporterReady.value = false;
  resetPhotoUploads();
  if (open) resetForm();
}, { immediate: true, flush: "sync" });

async function uploadSignature(current: number): Promise<string> {
  const pad = signatureRef.value;
  if (!pad) throw new Error("电子签名组件未就绪");
  const blob = await pad.toBlob();
  if (current !== session || !visible.value) throw new Error("当前填报已取消");
  const file = new File([blob], `signature-${Date.now()}.png`, { type: "image/png" });
  const result = await api.attachments.uploadImages({ files: [file], watermark: false });
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
  if (submitting.value || photosUploading.value || !visible.value) return;
  const current = session;
  if (!(await formRef.value?.validate().catch(() => false))) return;
  if (current !== session || submitting.value || photosUploading.value) return;
  if (!orgsReady || (!editing.value && !reporterReady.value)) {
    ElMessage.error("请先成功加载组织和人员候选，并选择有效的上报人");
    return;
  }

  if (!editing.value) {
    const validationError = validateChecklist(form);
    if (validationError) {
      ElMessage.error(validationError);
      return;
    }
  }

  submitting.value = true;
  try {
    let savedId: number;
    if (issue) {
      if (!form.org_id) throw new Error("请选择组织");
      const input: UpdateIssueInput = {
        project_year: form.project_year,
        org_id: form.org_id,
        code: form.code.trim(),
        address: form.address.trim(),
        lat: form.lat,
        lng: form.lng,
        plan_date: form.plan_date,
      };
      await api.issues.update(issue.id, input);
      if (current !== session) return;
      savedId = issue.id;
      ElMessage.success("基础信息已更新");
    } else {
      const signatureFileId = await uploadSignature(current);
      if (current !== session) return;
      const created = await api.issues.create(buildCreateInput(form, signatureFileId));
      if (current !== session) return;
      savedId = created.id;
      ElMessage.success("排查记录已新增");
    }
    visible.value = false;
    emit("saved", savedId);
  } catch (error) {
    if (current === session) ElMessage.error(errorMessage(error, editing.value ? "更新失败" : "新增失败"));
  } finally {
    if (current === session) submitting.value = false;
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
    :close-on-press-escape="!submitting"
    :show-close="!submitting"
  >
    <ElAlert
      v-if="editing"
      class="mb-5"
      type="info"
      show-icon
      :closable="false"
      title="当前后端更新接口仅保存基础信息，排查清单与电子签名在编辑时只读。"
    />

    <ElAlert v-if="!orgsReady" class="mb-4" type="warning" :closable="false" title="组织候选尚未加载成功，请关闭弹窗后重试组织查询。" />
    <ElForm ref="formRef" :model="form" :rules="rules" :disabled="submitting" label-position="top" scroll-to-error>
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
            <OrgTreeSelect v-model="form.org_id" :orgs="orgs" :disabled="!orgsReady" :clearable="false" />
          </ElFormItem>
          <ElFormItem v-if="!editing" label="上报人" prop="report_user_id">
            <BusinessUserSelect
              v-model="form.report_user_id"
              :active="visible && Boolean(form.org_id) && orgsReady"
              :scope-key="form.org_id ?? 0"
              :load-options="loadReporters"
              @ready="reporterReady = $event"
            />
          </ElFormItem>
          <ElFormItem label="定位地址" prop="address" class="sm:col-span-2 lg:col-span-3">
            <ElInput v-model="form.address" maxlength="255" show-word-limit placeholder="请输入详细定位地址" />
          </ElFormItem>
          <ElFormItem label="纬度">
            <ElInputNumber v-model="form.lat" :min="-90" :max="90" :precision="6" :controls="false" class="!w-full" />
          </ElFormItem>
          <ElFormItem label="经度">
            <ElInputNumber v-model="form.lng" :min="-180" :max="180" :precision="6" :controls="false" class="!w-full" />
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
        <p v-if="!editing" class="m-0 text-xs text-slate-500">上传现场照片前，请填写真实定位地址和经纬度，用于生成现场水印；未填写或 (0, 0) 占位坐标不能用于上传，系统不会自动补零。</p>
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
            <article v-for="(item, index) in form.checklist" :key="`${photoSession}:${item.type}`" class="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
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
              <div class="mt-3">
                <p class="mb-2 text-xs text-slate-500">现场照片（{{ item.mustImg ? '必填' : '选填' }}）</p>
                <PhotoUpload
                  v-if="visible"
                  v-model="item.files"
                  :address="form.address"
                  :lat="form.lat"
                  :lng="form.lng"
                  :disabled="submitting"
                  @uploading="updatePhotoUploading(item, $event)"
                />
              </div>
            </article>
          </div>
        </section>

        <ElDivider />
        <section>
          <h3 class="mt-0 mb-4 text-base font-semibold text-slate-900">上报人电子签名</h3>
          <SignaturePad v-if="visible" :key="photoSession" ref="signatureRef" />
        </section>
      </template>
    </ElForm>

    <template #footer>
      <span v-if="photosUploading" class="mr-3 text-sm text-amber-700" role="status">现场照片上传中，请完成后再提交。</span>
      <ElButton :disabled="submitting" @click="visible = false">取消</ElButton>
      <ElButton type="primary" :loading="submitting" :disabled="photosUploading || !orgsReady || (!editing && !reporterReady)" @click="submit">
        {{ editing ? '保存基础信息' : '提交排查记录' }}
      </ElButton>
    </template>
  </ElDialog>
</template>
