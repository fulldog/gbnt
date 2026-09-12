<script setup lang="ts">
import { ApiError, FACILITY_CODE_CONFLICT, ISSUE_REQUEST_CONFLICT, ISSUE_TYPES, PROJECT_YEARS, prepareIssueSubmission } from "@gbnt/api-client";
import type { FileItem, IssueType, IssueSubmissionAttempt } from "@gbnt/api-client";
import { ElMessage } from "element-plus";
import type { FormInstance, FormRules } from "element-plus";
import { computed, onScopeDispose, reactive, shallowRef, watch } from "vue";
import { useAdminApi } from "@/api/runtime";
import type { AdminIssue, OrgOption, UserOptionQuery } from "@/api/types";
import AsyncError from "@/components/AsyncError.vue";
import OrgTreeSelect from "@/components/OrgTreeSelect.vue";
import BusinessUserSelect from "@/components/BusinessUserSelect.vue";
import PhotoUpload from "@/components/PhotoUpload.vue";
import SignaturePad from "@/components/SignaturePad.vue";
import { ISSUE_TYPE_LABELS } from "@/constants/issue";
import { useAuthStore } from "@/stores/auth";
import { errorMessage } from "@/utils/error";
import IssueTypeFields from "./IssueTypeFields.vue";
import IssueChecklistFields from "./IssueChecklistFields.vue";
import { buildCreateInput, buildUpdateInput, createIssueDraft, draftNeedsRectify, draftSchemaVersion, hydrateIssueDraft, validateChecklist } from "./issue-form";
import type { IssueFormDraft, IssueTypeDraft, WellDraft } from "./issue-form";
import { useIssueCodeDrafts } from "./useIssueCodeDrafts";

interface SignaturePadExpose { changed?: boolean; revision?: number; toBlob: () => Promise<Blob> }
const { issue = null, orgs, orgsReady = true, defaultOrgId } = defineProps<{
  issue?: AdminIssue | null;
  orgs: readonly OrgOption[];
  orgsReady?: boolean;
  defaultOrgId?: number;
}>();
const emit = defineEmits<{ saved: [issueId: number] }>();
const visible = defineModel<boolean>({ required: true });
const api = useAdminApi();
const auth = useAuthStore();
const formRef = shallowRef<FormInstance>();
const signatureRef = shallowRef<SignaturePadExpose>();
const submitting = shallowRef(false);
const loading = shallowRef(false);
const loadError = shallowRef("");
const original = shallowRef<AdminIssue | null>(null);
const photoSession = shallowRef(0);
const signatureSession = shallowRef(0);
const uploadingKeys = shallowRef<ReadonlySet<string>>(new Set());
const photosUploading = computed(() => uploadingKeys.value.size > 0);
const form = reactive<IssueFormDraft>(createIssueDraft());
let session = 0;
onScopeDispose(() => { session += 1; });
const editing = computed(() => Boolean(issue));
const formReady = shallowRef(false);
const codeDrafts = useIssueCodeDrafts(form, () => visible.value && !editing.value && formReady.value);
const codeError = shallowRef("");
const manualCode = computed(() => editing.value || form.codeMode === "manual");
let uploadedSignature: { pad: SignaturePadExpose; revision?: number; fileId: string } | undefined;
let attempts: Partial<Record<IssueType, IssueSubmissionAttempt>> = {};
watch(() => [form.code, form.codeMode, form.org_id, form.type], () => { codeError.value = ""; formRef.value?.clearValidate("code"); });
const activeDraft = computed({ get: () => form.types[form.type], set: (draft: IssueTypeDraft) => { Object.assign(form.types, { [draft.type]: draft }); } });
const renderContext = computed(() => ({ draft: activeDraft.value, token: photoSession.value }));
const needsRectify = computed(() => draftNeedsRectify(form, original.value));
const needsAssignee = computed(() => original.value ? original.value.status !== "done" : needsRectify.value);
const assigneeReady = shallowRef(false);
function loadAssignees(query: UserOptionQuery) {
  if (!form.org_id) return Promise.reject(new Error("请先选择行政区划"));
  return original.value
    ? api.issues.listAssigneeOptions(original.value.id, { ...query, org_id: form.org_id })
    : api.issues.listReporterOptions({ ...query, org_id: form.org_id });
}
const schemaVersion = computed(() => draftSchemaVersion(form, original.value));
const existingSignature = computed(() => original.value?.reporter_signature ?? (original.value?.reporter_signature_file_id ? { file_id: original.value.reporter_signature_file_id, url: "" } : undefined));
const rules: FormRules<IssueFormDraft> = {
  type: [{ required: true, message: "请选择问题类型", trigger: "change" }],
  project_year: [{ required: true, message: "请选择项目年度", trigger: "change" }],
  org_id: [{ required: true, message: "请选择行政区划", trigger: "change" }],
  code: [{ validator: (_rule, _value, callback) => callback(manualCode.value && !form.code.trim() ? new Error("请填写设施编号") : undefined), trigger: "blur" }],
  address: [{ required: true, whitespace: true, message: "请填写地址", trigger: "blur" }],
  reporter_phone: [{ pattern: /^(?:1[3-9]\d{9})?$/, message: "请输入有效的手机号码", trigger: "blur" }],
  assignee_user: [{ validator: (_rule, _value, callback) => callback(needsAssignee.value && !form.assignee_user ? new Error("请指定整改人") : undefined), trigger: "change" }],
};

async function initialize(): Promise<void> {
  const current = ++session;
  assigneeReady.value = false;
  formReady.value = false;
  codeDrafts.reset();
  codeError.value = ""; attempts = {}; uploadedSignature = undefined;
  submitting.value = false; loading.value = false; loadError.value = ""; original.value = null;
  uploadingKeys.value = new Set(); photoSession.value += 1; signatureSession.value += 1;
  if (!visible.value) return;
  if (!issue) {
    const next = createIssueDraft(auth.user?.id);
    next.codeMode = "auto";
    next.org_id = defaultOrgId;
    next.reporter_name = auth.user?.name ?? ""; next.reporter_phone = auth.user?.phone ?? "";
    Object.assign(form, next); formRef.value?.clearValidate(); formReady.value = true; return;
  }
  loading.value = true;
  try {
    const fresh = await api.issues.get(issue.id);
    if (current !== session || !visible.value) return;
    original.value = fresh;
    Object.assign(form, hydrateIssueDraft(fresh));
    formRef.value?.clearValidate();
  } catch (error) {
    if (current === session) loadError.value = errorMessage(error, "排查记录加载失败");
  } finally { if (current === session) loading.value = false; }
}
watch(() => [visible.value, issue?.id] as const, () => { void initialize(); }, { immediate: true, flush: "sync" });
watch(() => form.type, () => { photoSession.value += 1; uploadingKeys.value = new Set(); formRef.value?.clearValidate(); }, { flush: "sync" });

function updateType(value: string | number | boolean | undefined): void {
  if (submitting.value || photosUploading.value) return;
  const type = ISSUE_TYPES.find((item) => item === value);
  if (type) form.type = type;
}
function updateYear(value: string | number | boolean | undefined): void {
  const year = PROJECT_YEARS.find((item) => item === value); if (year) form.project_year = year;
}
function setCodeMode(value: string | number | boolean | undefined): void {
  if (!submitting.value && (value === "auto" || value === "manual")) form.codeMode = value;
}
function setUploading(key: string, busy: boolean, token: number): void {
  if (!visible.value || token !== photoSession.value) return;
  const next = new Set(uploadingKeys.value); if (busy) next.add(key); else next.delete(key); uploadingKeys.value = next;
}
function setPanorama(draft: WellDraft, ids: string[], token: number): void {
  if (visible.value && token === photoSession.value) draft.panorama_files = [...ids];
}
function rememberPanorama(draft: WellDraft, photo: FileItem, token: number): void {
  if (visible.value && token === photoSession.value) draft.panorama_photos = [...draft.panorama_photos.filter((p) => p.file_id !== photo.file_id), photo];
}
function setSignatureRef(value: unknown): void { signatureRef.value = value as SignaturePadExpose | undefined; }
async function signatureId(current: number): Promise<string> {
  if (original.value?.reporter_signature_file_id && !signatureRef.value?.changed) return original.value.reporter_signature_file_id;
  const pad = signatureRef.value;
  if (!pad) throw new Error("电子签名组件未就绪");
  if (uploadedSignature?.pad === pad && uploadedSignature.revision === pad.revision) return uploadedSignature.fileId;
  const revision = pad.revision;
  const blob = await pad.toBlob();
  if (current !== session || !visible.value) throw new Error("当前填报已取消");
  const file = new File([blob], `signature-${Date.now()}.png`, { type: "image/png" });
  const result = await api.attachments.uploadImages({ files: [file], watermark: false });
  const id = result.list[0]?.file_id; if (!id) throw new Error("电子签名上传失败");
  if (current === session && visible.value && revision === pad.revision) uploadedSignature = { pad, revision, fileId: id };
  return id;
}
async function submit(): Promise<void> {
  if (submitting.value || photosUploading.value || loading.value || loadError.value || !visible.value) return;
  const current = session;
  if (!(await formRef.value?.validate().catch(() => false))) return;
  if (current !== session || photosUploading.value || submitting.value) return;
  if (!orgsReady) { ElMessage.error("行政区划加载失败，请重试"); return; }
  if ((needsAssignee.value || form.assignee_user) && !assigneeReady.value) { ElMessage.error("请选择有效的整改人，或等待人员候选加载完成"); return; }
  if (original.value && original.value.type !== form.type && original.value.rectify_records.length) {
    ElMessage.error("该记录已有整改历史，请保留原类型编辑"); return;
  }
  const validation = validateChecklist(form, original.value);
  if (validation) { ElMessage.error(validation); return; }
  submitting.value = true;
  try {
    const id = await signatureId(current); if (current !== session) return;
    let savedId: number;
    let savedCode = "";
    if (original.value) {
      await api.issues.update(original.value.id, buildUpdateInput(form, original.value, id)); savedId = original.value.id;
    } else {
      const input = buildCreateInput(form, id);
      if (form.reporter_name.trim() !== auth.user?.name?.trim()) delete input.report_user_id;
      const attempt = prepareIssueSubmission(input, attempts[form.type]);
      attempts[form.type] = attempt;
      const saved = await api.issues.create({ ...input, request_id: attempt.requestId });
      savedId = saved.id; savedCode = saved.code;
    }
    if (current !== session) return;
    ElMessage.success(editing.value ? "巡查记录已保存" : `巡查记录已新增，设施编号 ${savedCode}`); visible.value = false; emit("saved", savedId);
  } catch (error) {
    if (current === session) {
      if (error instanceof ApiError && error.code === FACILITY_CODE_CONFLICT) { codeError.value = error.message; formRef.value?.scrollToField("code"); }
      if (error instanceof ApiError && error.code === ISSUE_REQUEST_CONFLICT) delete attempts[form.type];
      ElMessage.error(errorMessage(error, "保存失败"));
    }
  }
  finally { if (current === session) submitting.value = false; }
}
</script>

<template>
  <ElDialog v-model="visible" :title="editing ? '编辑巡查' : '新增巡查'" width="min(1200px, 96vw)" top="6vh" class="issue-form-dialog" destroy-on-close :close-on-click-modal="false" :close-on-press-escape="!submitting" :show-close="!submitting">
    <ElSkeleton v-if="loading" class="form-loading" :rows="10" animated />
    <AsyncError v-else-if="loadError" :message="loadError" @retry="initialize" />
    <ElForm v-else ref="formRef" :model="form" :rules="rules" :disabled="submitting" label-position="right" label-width="88px" class="issue-form" scroll-to-error>
      <div v-for="context in [renderContext]" :key="'issue-form'" class="issue-form-columns">
        <div class="issue-form-pane issue-form-basic">
          <section>
            <h3>基本信息</h3>
            <ElFormItem label="问题类型" prop="type">
              <ElRadioGroup :model-value="form.type" :disabled="photosUploading" class="issue-type-picker" @update:model-value="updateType">
                <ElRadioButton v-for="type in ISSUE_TYPES" :key="type" :value="type">{{ ISSUE_TYPE_LABELS[type] }}</ElRadioButton>
              </ElRadioGroup>
            </ElFormItem>
            <ElFormItem label="行政区划" prop="org_id"><OrgTreeSelect v-model="form.org_id" :orgs="orgs" :disabled="!orgsReady" :clearable="false" restrict-scope /></ElFormItem>
            <ElFormItem label="整改人" prop="assignee_user" :required="needsAssignee">
              <BusinessUserSelect :key="session" v-model="form.assignee_user" :active="visible && !!form.org_id && !loading" :scope-key="form.org_id || 0" :load-options="loadAssignees" placeholder="请选择整改人" @ready="assigneeReady = $event" />
            </ElFormItem>
            <ElFormItem label="项目年度" prop="project_year"><ElRadioGroup :model-value="form.project_year" class="issue-year-picker" @update:model-value="updateYear"><ElRadioButton v-for="year in PROJECT_YEARS" :key="year" :value="year">{{ year }}</ElRadioButton></ElRadioGroup></ElFormItem>
            <ElFormItem label="设施编号" prop="code" :error="codeError">
              <div class="facility-code-control">
                <ElRadioGroup v-if="!editing" :model-value="form.codeMode" class="code-mode-options" @update:model-value="setCodeMode"><ElRadioButton value="auto">自动生成</ElRadioButton><ElRadioButton value="manual">手动填写</ElRadioButton></ElRadioGroup>
                <ElInput v-if="manualCode" v-model="form.code" maxlength="64" placeholder="请输入设施编号" />
                <span v-else class="code-status">提交时自动生成</span>
              </div>
            </ElFormItem>
            <ElFormItem label="上报人"><ElInput v-model="form.reporter_name" maxlength="128" placeholder="请输入上报人" /></ElFormItem>
            <ElFormItem label="联系电话" prop="reporter_phone"><ElInput v-model="form.reporter_phone" type="tel" maxlength="11" placeholder="请输入联系电话" /></ElFormItem>
          </section>
          <section>
            <h3>类型属性</h3>
            <IssueTypeFields v-model="activeDraft">
              <template #panorama>
                <ElFormItem v-if="context.draft.type === 'well'" label="全景照片" :required="schemaVersion === 2">
                  <PhotoUpload :key="context.token" :model-value="context.draft.panorama_files" :photos="context.draft.panorama_photos" compact :address="form.address" :lat="form.lat" :lng="form.lng" :disabled="submitting"
                    @update:model-value="setPanorama(context.draft, $event, context.token)" @uploaded="rememberPanorama(context.draft, $event, context.token)" @uploading="setUploading('panorama', $event, context.token)" />
                </ElFormItem>
              </template>
            </IssueTypeFields>
          </section>
          <section>
            <h3>地址</h3>
            <ElFormItem label="地址" prop="address"><ElInput v-model="form.address" maxlength="255" placeholder="请输入现场地址" /></ElFormItem>
            <details class="location-help"><summary>现场定位（上传照片时填写）</summary>
              <div class="coordinates"><ElFormItem label="纬度"><ElInputNumber v-model="form.lat" :min="-90" :max="90" :precision="6" :controls="false" /></ElFormItem><ElFormItem label="经度"><ElInputNumber v-model="form.lng" :min="-180" :max="180" :precision="6" :controls="false" /></ElFormItem></div>
              <p>请填写实际现场坐标，用于照片水印；系统不会自动补零。</p>
            </details>
          </section>
        </div>
        <div class="issue-form-pane issue-form-survey">
          <section>
            <h3>排查清单</h3>
            <IssueChecklistFields :key="context.token" :items="context.draft.checklist" :version="schemaVersion" :address="form.address" :lat="form.lat" :lng="form.lng" :disabled="submitting" @uploading="(key, busy) => setUploading(key, busy, context.token)" />
            <ElFormItem v-if="needsRectify" label="整改计划日期" label-width="200px" required class="plan-date"><ElDatePicker v-model="context.draft.plan_date" type="date" value-format="YYYY-MM-DD" placeholder="请选择日期" /></ElFormItem>
          </section>
          <section class="signature-section"><h3>电子签名</h3><SignaturePad :key="signatureSession" :ref="setSignatureRef" :existing="existingSignature" :disabled="submitting" class="issue-signature" /></section>
        </div>
      </div>
    </ElForm>
    <template #footer>
      <span v-if="photosUploading" class="upload-status" role="status">现场照片上传中，请完成后再提交。</span>
      <ElButton :disabled="submitting" @click="visible = false">取消</ElButton>
      <ElButton type="primary" :loading="submitting" :disabled="loading || Boolean(loadError) || photosUploading || !orgsReady" @click="submit">确认提交</ElButton>
    </template>
  </ElDialog>
</template>

<style scoped>
.issue-form { height: 100%; }
.form-loading { padding: 24px; }
.facility-code-control { width: 100%; }
.code-mode-options { margin-bottom: 6px; }
.code-status { display: block; font-size: 12px; line-height: 20px; color: #727b89; }
.code-error { color: #bd6400; }
.issue-form-columns { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 8px; height: 100%; min-height: 0; background: #eef3f9; }
.issue-form-pane { overflow-y: auto; overflow-x: hidden; min-width: 0; min-height: 0; padding: 20px 24px; background: #fff; }
.issue-form h3 { font-size: 14px; font-weight: 600; color: #333; margin: 0 0 16px; }
.issue-form section + section { margin-top: 24px; }
.issue-form :deep(.el-form-item) { margin-bottom: 12px; }
.issue-form :deep(.el-form-item__label) { padding-right: 12px; min-height: 36px; line-height: 36px; white-space: nowrap; }
.issue-form :deep(.el-form-item__content) { min-width: 0; }
.issue-form :deep(.el-input__wrapper), .issue-form :deep(.el-select__wrapper) { min-height: 36px; }
.issue-form :deep(.el-select), .issue-form :deep(.el-date-editor), .coordinates :deep(.el-input-number) { width: 100%; }
.issue-type-picker, .issue-year-picker { display: flex; width: 100%; gap: 4px; }
.issue-type-picker { padding: 3px; border-radius: 6px; background: #f1f4f8; }
.issue-type-picker :deep(.el-radio-button), .issue-year-picker :deep(.el-radio-button) { flex: 1; min-width: 0; }
.issue-type-picker :deep(.el-radio-button__inner), .issue-year-picker :deep(.el-radio-button__inner) { width: 100%; padding: 10px 4px; border: 0; border-radius: 4px; background: #f1f4f8; box-shadow: none; }
.issue-type-picker :deep(.el-radio-button.is-active .el-radio-button__inner) { color: var(--gbnt-primary); background: #fff; }
.issue-year-picker :deep(.el-radio-button.is-active .el-radio-button__inner) { color: #fff; background: var(--gbnt-primary); }
.location-help { margin: 4px 0 0 88px; color: #8a919c; font-size: 12px; }
.location-help summary { cursor: pointer; }
.coordinates { margin-top: 12px; }
.coordinates :deep(.el-form-item__label) { width: 44px !important; }
.coordinates :deep(.el-input__inner) { text-align: left; }
.location-help p { line-height: 1.5; }
.issue-signature :deep(canvas) { height: 180px; border: 1px solid #e4dfc3; background: repeating-linear-gradient(transparent 0 38px, #eee8c9 39px 40px) #fbf6df; }
.upload-status { margin-right: 12px; font-size: 13px; color: #ad7100; }
@media (max-width: 900px) { .issue-form, .issue-form-columns { height: auto; } .issue-form-columns { grid-template-columns: minmax(0, 1fr); } .issue-form-pane { overflow: visible; } }
@media (max-width: 640px) { .issue-form-pane { padding: 16px; } .issue-type-picker { flex-wrap: wrap; } .issue-type-picker :deep(.el-radio-button) { flex-basis: 28%; } .plan-date :deep(.el-form-item__label) { width: 112px !important; } }
</style>
