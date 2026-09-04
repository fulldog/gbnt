<script setup lang="ts">
import type { AdminCreateIssueInput } from "@gbnt/api-client";
import { UploadFilled } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import type { UploadFile, UploadFiles } from "element-plus";
import { shallowRef, watch } from "vue";
import { useAdminApi } from "@/api/runtime";
import { errorMessage } from "@/utils/error";

const emit = defineEmits<{ imported: [] }>();
const visible = defineModel<boolean>({ required: true });
const api = useAdminApi();
const rows = shallowRef<AdminCreateIssueInput[]>([]);
const filename = shallowRef("");
const parseError = shallowRef("");
const submitting = shallowRef(false);

watch(visible, (open) => {
  if (!open) return;
  rows.value = [];
  filename.value = "";
  parseError.value = "";
});

async function readFile(file: UploadFile, _files: UploadFiles): Promise<void> {
  rows.value = [];
  parseError.value = "";
  filename.value = file.name;
  try {
    const text = await file.raw?.text();
    if (!text) throw new Error("文件内容为空");
    const parsed = JSON.parse(text) as unknown;
    const candidate = Array.isArray(parsed)
      ? parsed
      : typeof parsed === "object" && parsed !== null && "rows" in parsed
        ? (parsed as { rows: unknown }).rows
        : null;
    if (!Array.isArray(candidate)) throw new Error("JSON 必须是数组或包含 rows 数组");
    rows.value = candidate as AdminCreateIssueInput[];
  } catch (error) {
    parseError.value = errorMessage(error, "无法解析 JSON 文件");
  }
}

async function submit(): Promise<void> {
  if (!rows.value.length) {
    ElMessage.error("请选择包含数据的 JSON 文件");
    return;
  }
  submitting.value = true;
  try {
    const result = await api.issues.importRows({ rows: rows.value });
    ElMessage.success(`成功导入 ${result.imported} 条记录`);
    visible.value = false;
    emit("imported");
  } catch (error) {
    ElMessage.error(errorMessage(error, "批量导入失败"));
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <ElDialog v-model="visible" title="批量导入排查记录" width="min(560px, 92vw)" destroy-on-close>
    <ElAlert
      class="mb-4"
      type="info"
      show-icon
      :closable="false"
      title="当前后端接口接收 JSON rows，不是 Excel 文件。每行字段须与新增排查接口一致。"
    />
    <ElUpload
      drag
      action="#"
      accept="application/json,.json"
      :auto-upload="false"
      :limit="1"
      :on-change="readFile"
    >
      <ElIcon class="el-icon--upload"><UploadFilled /></ElIcon>
      <div class="el-upload__text">将 JSON 文件拖到此处，或<em>点击选择</em></div>
    </ElUpload>
    <ElAlert v-if="parseError" class="mt-4" type="error" :title="parseError" show-icon :closable="false" />
    <p v-else-if="rows.length" class="mt-4 mb-0 text-sm text-emerald-700">
      已读取 {{ filename }}，共 {{ rows.length }} 条记录。
    </p>
    <template #footer>
      <ElButton @click="visible = false">取消</ElButton>
      <ElButton type="primary" :loading="submitting" :disabled="!rows.length" @click="submit">开始导入</ElButton>
    </template>
  </ElDialog>
</template>
