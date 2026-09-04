<script setup lang="ts">
import type { Issue, SysUser } from "@gbnt/api-client";
import { ElMessage } from "element-plus";
import { shallowRef, watch } from "vue";
import { useAdminApi } from "@/api/runtime";
import { errorMessage } from "@/utils/error";

const { issue } = defineProps<{ issue: Issue | null }>();
const emit = defineEmits<{ saved: [] }>();
const visible = defineModel<boolean>({ required: true });
const api = useAdminApi();
const users = shallowRef<SysUser[]>([]);
const selected = shallowRef<number>();
const loading = shallowRef(false);
const submitting = shallowRef(false);
const loadError = shallowRef("");

async function load(): Promise<void> {
  if (!issue) return;
  loading.value = true;
  loadError.value = "";
  try {
    const result = await api.users.listByOrg(issue.org_id);
    users.value = result.list.filter((user) => user.status === 1);
    selected.value = issue.assignee_user || users.value[0]?.id;
  } catch (error) {
    users.value = [];
    loadError.value = errorMessage(error, "责任人列表加载失败");
  } finally {
    loading.value = false;
  }
}

watch(visible, (open) => {
  if (open) void load();
});

async function submit(): Promise<void> {
  if (!issue || !selected.value) {
    ElMessage.error("请选择整改责任人");
    return;
  }
  submitting.value = true;
  try {
    await api.issues.reassign(issue.id, { assignee_user: selected.value });
    ElMessage.success("整改责任人已更新");
    visible.value = false;
    emit("saved");
  } catch (error) {
    ElMessage.error(errorMessage(error, "重新指派失败"));
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <ElDialog v-model="visible" title="重新指派整改责任人" width="min(500px, 92vw)" destroy-on-close>
    <ElAlert v-if="loadError" class="mb-4" type="error" :title="loadError" show-icon :closable="false" />
    <ElForm label-position="top">
      <ElFormItem label="整改责任人" required>
        <ElSelect v-model="selected" filterable :loading="loading" class="w-full" placeholder="请选择启用人员">
          <ElOption
            v-for="user in users"
            :key="user.id"
            :label="`${user.name || user.username}（${user.username}）`"
            :value="user.id"
          />
        </ElSelect>
      </ElFormItem>
    </ElForm>
    <template #footer>
      <ElButton @click="visible = false">取消</ElButton>
      <ElButton type="primary" :loading="submitting" :disabled="!selected" @click="submit">确认指派</ElButton>
    </template>
  </ElDialog>
</template>
