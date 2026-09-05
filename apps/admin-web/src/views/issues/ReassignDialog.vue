<script setup lang="ts">
import type { Issue } from "@gbnt/api-client";
import { ElMessage } from "element-plus";
import { onScopeDispose, shallowRef, watch } from "vue";
import { useAdminApi } from "@/api/runtime";
import type { UserOptionQuery } from "@/api/types";
import BusinessUserSelect from "@/components/BusinessUserSelect.vue";
import { errorMessage } from "@/utils/error";

const { issue } = defineProps<{ issue: Issue | null }>();
const emit = defineEmits<{ saved: [issueId: number] }>();
const visible = defineModel<boolean>({ required: true });
const api = useAdminApi();
const selected = shallowRef<number>();
const submitting = shallowRef(false);
const candidateReady = shallowRef(false);
let session = 0;
onScopeDispose(() => { session += 1; });

function loadAssignees(query: UserOptionQuery) {
  if (!issue) return Promise.reject(new Error("请先选择问题记录"));
  return api.issues.listAssigneeOptions(issue.id, query);
}

watch(() => [visible.value, issue?.id] as const, ([open]) => {
  session += 1;
  submitting.value = false;
  candidateReady.value = false;
  selected.value = open ? issue?.assignee_user || undefined : undefined;
}, { immediate: true, flush: "sync" });

async function submit(): Promise<void> {
  if (submitting.value || !visible.value) return;
  if (!issue || !selected.value || !candidateReady.value) {
    ElMessage.error("请成功加载候选后选择有效的整改责任人");
    return;
  }
  submitting.value = true;
  const current = session;
  const issueId = issue.id;
  const assignee = selected.value;
  try {
    await api.issues.reassign(issueId, { assignee_user: assignee });
    if (current !== session) return;
    ElMessage.success("整改责任人已更新");
    visible.value = false;
    emit("saved", issueId);
  } catch (error) {
    if (current === session) ElMessage.error(errorMessage(error, "重新指派失败"));
  } finally {
    if (current === session) submitting.value = false;
  }
}
</script>

<template>
  <ElDialog v-model="visible" title="重新指派整改责任人" width="min(500px, 92vw)" destroy-on-close :close-on-click-modal="false" :close-on-press-escape="!submitting" :show-close="!submitting">
    <ElForm label-position="top" :disabled="submitting">
      <ElFormItem label="整改责任人" required>
        <BusinessUserSelect
          v-model="selected"
          :active="visible && Boolean(issue)"
          :scope-key="issue?.id ?? 0"
          :load-options="loadAssignees"
          @ready="candidateReady = $event"
        />
      </ElFormItem>
    </ElForm>
    <template #footer>
      <ElButton :disabled="submitting" @click="visible = false">取消</ElButton>
      <ElButton type="primary" :loading="submitting" :disabled="!candidateReady" @click="submit">确认指派</ElButton>
    </template>
  </ElDialog>
</template>
