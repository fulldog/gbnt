<script setup lang="ts">
import type { Issue, QuizType } from "@gbnt/api-client";
import { ElMessage } from "element-plus";
import { computed, ref, shallowRef, watch } from "vue";
import { useAdminApi } from "@/api/runtime";
import PhotoUpload from "@/components/PhotoUpload.vue";
import { QUIZ_DEFINITIONS, quizIndicatesIssue, quizLabel } from "@/constants/issue";
import { errorMessage } from "@/utils/error";

interface RectifyDraft {
  type: QuizType;
  note: string;
  files: string[];
}

const { issue } = defineProps<{ issue: Issue | null }>();
const emit = defineEmits<{ saved: [] }>();
const visible = defineModel<boolean>({ required: true });
const api = useAdminApi();
const submitting = shallowRef(false);
const drafts = ref<RectifyDraft[]>([]);

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

watch(visible, (open) => {
  if (!open) return;
  drafts.value = neededTypes.value.map((type) => ({ type, note: "", files: [] }));
});

async function submit(): Promise<void> {
  if (!issue) return;
  if (!drafts.value.length) {
    ElMessage.error("当前记录没有可映射到整改接口的异常题目");
    return;
  }
  const invalid = drafts.value.find((item) => !item.note.trim() || item.files.length === 0);
  if (invalid) {
    ElMessage.error(`请完整填写“${quizLabel(invalid.type)}”的整改说明和照片`);
    return;
  }

  submitting.value = true;
  try {
    await api.issues.rectify(issue.id, {
      rectify_list: drafts.value.map((item) => ({
        type: item.type,
        note: item.note.trim(),
        file_uuids: [...item.files],
      })),
    });
    ElMessage.success("整改反馈已提交");
    visible.value = false;
    emit("saved");
  } catch (error) {
    ElMessage.error(errorMessage(error, "整改提交失败"));
  } finally {
    submitting.value = false;
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
  >
    <ElAlert
      v-if="!drafts.length"
      type="warning"
      show-icon
      :closable="false"
      title="该记录的需整改原因没有对应 checklist 题目，当前接口无法生成整改项。"
    />
    <div v-else class="space-y-4">
      <article v-for="(draft, index) in drafts" :key="draft.type" class="rounded-lg border border-slate-200 p-4">
        <h3 class="mt-0 mb-4 text-sm font-semibold text-slate-900">{{ index + 1 }}. {{ quizLabel(draft.type) }}</h3>
        <ElFormItem label="整改说明" required>
          <ElInput v-model="draft.note" type="textarea" :rows="3" maxlength="1000" show-word-limit />
        </ElFormItem>
        <ElFormItem label="整改照片" required>
          <PhotoUpload v-model="draft.files" />
        </ElFormItem>
      </article>
    </div>
    <template #footer>
      <ElButton @click="visible = false">取消</ElButton>
      <ElButton type="primary" :disabled="!drafts.length" :loading="submitting" @click="submit">提交整改</ElButton>
    </template>
  </ElDialog>
</template>
