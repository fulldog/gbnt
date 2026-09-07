<script setup lang="ts">
import { onBeforeUnmount } from "vue";
import type { FileItem } from "@gbnt/api-client";
import { issueQuizIsAbnormal } from "@gbnt/api-client";
import PhotoUpload from "@/components/PhotoUpload.vue";
import type { ChecklistDraft } from "./issue-form";
import { quizPhotoMinimum } from "./issue-form";

const { items, address, lat, lng, disabled = false, version = 2 } = defineProps<{
  items: ChecklistDraft[]; address: string; lat?: number; lng?: number; disabled?: boolean; version?: number;
}>();
const emit = defineEmits<{ uploading: [type: string, busy: boolean] }>();
let disposed = false;
onBeforeUnmount(() => { disposed = true; });
function abnormal(item: ChecklistDraft, value: boolean): boolean {
  // 未补填新题的旧道路继续使用原问题判定，说明提示与保存校验保持一致。
  return issueQuizIsAbnormal(version === 1 && item.observationOnly ? { ...item, observationOnly: false } : item, value);
}
function setFiles(item: ChecklistDraft, files: string[]) { if (!disposed) item.files = [...files]; }
function uploaded(item: ChecklistDraft, photo: FileItem) {
  if (!disposed) item.photos = [...item.photos.filter((p) => p.file_id !== photo.file_id), photo];
}
</script>

<template>
  <div class="issue-checklist-fields">
    <article v-for="item in items" :key="item.type" class="checklist-question" v-bind="{ 'data-question': item.type }">
      <div class="question-heading">
        <span class="question-label"><i>*</i>{{ item.label }}<small v-if="item.type === 'water_out'">（≥1分钟）</small></span>
        <ElRadioGroup :model-value="item.value ?? undefined" @update:model-value="item.value = typeof $event === 'boolean' ? $event : null" v-bind="{ 'aria-label': item.label }" :disabled="disabled">
          <ElRadio :value="true" :class="{ 'is-abnormal': abnormal(item, true) }">是</ElRadio><ElRadio :value="false" :class="{ 'is-abnormal': abnormal(item, false) }">否</ElRadio>
        </ElRadioGroup>
      </div>
      <div v-show="item.value !== null || item.files.length > 0 || item.desc" class="question-content">
        <ElInput v-model="item.desc" :disabled="disabled" type="textarea" :rows="2" maxlength="500" resize="none" v-bind="{ 'aria-label': `${item.label}说明` }" :placeholder="item.value !== null && abnormal(item, item.value) ? '请输入问题描述（必填）' : '请输入备注（选填）'" />
        <PhotoUpload :model-value="item.files" :photos="item.photos" compact :disabled="disabled" :address="address" :lat="lat" :lng="lng"
          @update:model-value="setFiles(item, $event)" @uploaded="uploaded(item, $event)" @uploading="emit('uploading', item.type, $event)" />
        <span class="photo-requirement">现场照片（{{ quizPhotoMinimum(item, version) ? '必填' : '选填' }}）<template v-if="item.value === true && item.type === 'water_out' && version === 2">，至少 2 张</template></span>
      </div>
    </article>
  </div>
</template>

<style scoped>
.checklist-question { margin-bottom: 22px; }
.question-heading { display: grid; grid-template-columns: 200px minmax(0, 1fr); gap: 12px; align-items: center; min-height: 36px; }
.question-label { text-align: right; font-size: 14px; line-height: 1.5; color: #333; }
.question-label i { color: #d03050; font-style: normal; margin-right: 3px; }
.question-label small { font-size: 12px; color: #999; }
.question-content { margin: 8px 0 0 212px; padding: 10px; border: 1px solid #dcdfe6; border-radius: 6px; }
.question-content :deep(.el-textarea__inner) { box-shadow: none; padding: 0; font-size: 14px; }
.question-content :deep(.photo-upload-compact) { margin-top: 8px; }
.photo-requirement { display: block; margin-top: 6px; color: #999; font-size: 12px; line-height: 1.5; }
.question-heading :deep(.el-radio.is-abnormal .el-radio__input.is-checked .el-radio__inner) { background: #cf1833; border-color: #cf1833; }
.question-heading :deep(.el-radio.is-abnormal.is-checked .el-radio__label) { color: #cf1833; }
.question-heading :deep(.el-radio) { margin-right: 16px; }
@media (max-width: 1100px) { .question-heading { grid-template-columns: 170px minmax(0, 1fr); } .question-content { margin-left: 182px; } }
@media (max-width: 640px) { .question-heading { grid-template-columns: 1fr auto; } .question-label { text-align: left; } .question-content { margin-left: 0; } }
</style>
