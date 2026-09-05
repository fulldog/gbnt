<script setup lang="ts">
import type { Issue, QuizType } from "@gbnt/api-client";
import { ElMessage } from "element-plus";
import { computed, onScopeDispose, ref, shallowRef, watch } from "vue";
import { useAdminApi } from "@/api/runtime";
import PhotoUpload from "@/components/PhotoUpload.vue";
import { QUIZ_DEFINITIONS, quizIndicatesIssue, quizLabel } from "@/constants/issue";
import { errorMessage } from "@/utils/error";

interface RectifyDraft {
  type: QuizType;
  selected: boolean;
  note: string;
  files: string[];
  sessionId: number;
}

const { issue } = defineProps<{ issue: Issue | null }>();
const emit = defineEmits<{ saved: [issueId: number] }>();
const visible = defineModel<boolean>({ required: true });
const api = useAdminApi();
const submitting = shallowRef(false);
const drafts = ref<RectifyDraft[]>([]);
const uploadingTypes = shallowRef<ReadonlySet<QuizType>>(new Set());
let session = 0;
onScopeDispose(() => { session += 1; });
const selectedDrafts = computed(() => drafts.value.filter((draft) => draft.selected));
const hasUploads = computed(() => uploadingTypes.value.size > 0);
const currentRound = computed(() => issue?.rectify_round ?? 0);
const currentRoundTypes = computed(() => new Set(issue?.rectify_records
  .filter((record) => (record.round ?? 0) === currentRound.value)
  .map((record) => record.quiz_type) ?? []));
const historicalTypes = computed(() => new Set(issue?.rectify_records
  .filter((record) => (record.round ?? 0) < currentRound.value)
  .map((record) => record.quiz_type) ?? []));

const neededTypes = computed(() => {
  if (!issue) return [];
  const definitions = QUIZ_DEFINITIONS[issue.type];
  return issue.type_ext.checklist
    .filter((item) => {
      const definition = definitions.find((candidate) => candidate.type === item.type);
      return definition ? quizIndicatesIssue(item.value, definition.negative) : false;
    })
    .map((item) => item.type);
});

watch(() => [visible.value, issue?.id, currentRound.value] as const, ([open]) => {
  session += 1;
  submitting.value = false;
  uploadingTypes.value = new Set();
  drafts.value = open ? neededTypes.value.map((type) => ({
    type, selected: false, note: "", files: [], sessionId: session,
  })) : [];
}, { immediate: true, flush: "sync" });

function setUploading(draft: RectifyDraft, uploading: boolean): void {
  // 关闭重开及切换问题后，旧上传组件的事件不能污染新一轮表单。
  if (!visible.value || draft.sessionId !== session) return;
  const next = new Set(uploadingTypes.value);
  if (uploading) next.add(draft.type);
  else next.delete(draft.type);
  uploadingTypes.value = next;
}

async function submit(): Promise<void> {
  if (!issue || submitting.value || !visible.value) return;
  if (!drafts.value.length) {
    ElMessage.error("当前记录没有可映射到整改接口的异常题目");
    return;
  }
  if (hasUploads.value) {
    ElMessage.error("请等待所有整改照片上传完成");
    return;
  }
  if (!selectedDrafts.value.length) {
    ElMessage.error("请至少选择一项本次处理的异常项");
    return;
  }
  const invalid = selectedDrafts.value.find((item) => !item.note.trim() || item.files.length === 0);
  if (invalid) {
    ElMessage.error(`请完整填写“${quizLabel(invalid.type)}”的整改说明和照片`);
    return;
  }

  submitting.value = true;
  const current = session;
  const issueId = issue.id;
  try {
    await api.issues.rectify(issueId, {
      expected_round: currentRound.value,
      rectify_list: selectedDrafts.value.map((item) => ({
        type: item.type,
        note: item.note.trim(),
        file_uuids: [...item.files],
      })),
    });
    if (current !== session) return;
    ElMessage.success("整改反馈已提交");
    visible.value = false;
    emit("saved", issueId);
  } catch (error) {
    if (current === session) ElMessage.error(errorMessage(error, "整改提交失败"));
  } finally {
    if (current === session) submitting.value = false;
  }
}
</script>

<template>
  <ElDialog
    v-model="visible"
    title="提交整改反馈"
    width="min(760px, 94vw)"
    top="6vh"
    destroy-on-close
    :close-on-click-modal="false"
    :close-on-press-escape="!submitting"
    :show-close="!submitting"
  >
    <ElAlert
      v-if="!drafts.length"
      type="warning"
      show-icon
      :closable="false"
      title="该记录的需整改原因没有对应 checklist 题目，当前接口无法生成整改项。"
    />
    <div v-else class="space-y-4">
      <ElAlert
        type="info"
        show-icon
        :closable="false"
        title="请选择本次处理的异常项，可分次提交。历史已反馈项仍可再次选择，完成状态以后端结果为准。"
        :description="`当前为第 ${currentRound + 1} 轮整改，仅本轮反馈参与完成判断；历史轮已反馈不表示本轮已经完成。`"
      />
      <p class="m-0 text-sm text-slate-600">
        照片水印使用当前记录的地址和坐标；若定位缺失，请先关闭弹窗，在基础编辑中补齐后再上传。
      </p>
      <article v-for="(draft, index) in drafts" :key="`${draft.sessionId}:${draft.type}`" class="rounded-lg border border-slate-200 p-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <ElCheckbox :model-value="draft.selected" :disabled="submitting || hasUploads" @update:model-value="draft.selected = $event === true">
            本次处理：{{ index + 1 }}. {{ quizLabel(draft.type) }}
          </ElCheckbox>
          <div class="flex flex-wrap gap-2">
            <ElTag v-if="currentRoundTypes.has(draft.type)" type="success" effect="plain">本轮已反馈</ElTag>
            <ElTag v-if="historicalTypes.has(draft.type)" type="info" effect="plain">历史轮已反馈</ElTag>
          </div>
        </div>
        <div v-show="draft.selected" class="mt-4">
          <ElFormItem label="整改说明" :required="draft.selected">
            <ElInput v-model="draft.note" :disabled="submitting || !draft.selected" type="textarea" :rows="3" maxlength="1000" show-word-limit />
          </ElFormItem>
          <ElFormItem label="整改照片" :required="draft.selected">
            <PhotoUpload
              v-model="draft.files"
              :address="issue?.address"
              :lat="issue?.lat"
              :lng="issue?.lng"
              :disabled="submitting || !draft.selected"
              @uploading="setUploading(draft, $event)"
            />
          </ElFormItem>
        </div>
      </article>
      <p class="m-0 text-sm text-slate-600">本次已选择 {{ selectedDrafts.length }} 项{{ hasUploads ? '，照片上传中…' : '' }}</p>
    </div>
    <template #footer>
      <ElButton :disabled="submitting" @click="visible = false">取消</ElButton>
      <ElButton type="primary" :disabled="!selectedDrafts.length || hasUploads" :loading="submitting" @click="submit">提交本次整改</ElButton>
    </template>
  </ElDialog>
</template>
