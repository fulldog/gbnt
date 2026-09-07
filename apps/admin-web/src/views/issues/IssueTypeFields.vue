<script setup lang="ts">
import type { IssueTypeDraft } from "./issue-form";
const draft = defineModel<IssueTypeDraft>({ required: true });
function select(value: string | number | boolean | undefined): void {
  if (draft.value.type === "well" && (value === "new" || value === "match")) draft.value.build_kind = value;
  if (draft.value.type === "bridge" && (value === "bridge" || value === "culvert" || value === "gate")) draft.value.kind = value;
  if (draft.value.type === "transformer" && (value === "10kv" || value === "0.4kv")) draft.value.voltage = value;
}
</script>

<template>
  <div class="issue-type-fields" v-bind="{ 'data-type': draft.type }">
    <template v-if="draft.type === 'well'">
      <ElFormItem label="设施类型" required><ElRadioGroup :model-value="draft.build_kind" @update:model-value="select"><ElRadio value="new">新建</ElRadio><ElRadio value="match">配套</ElRadio></ElRadioGroup></ElFormItem>
      <ElFormItem label="出水口总数"><div class="number-unit"><ElInputNumber v-model="draft.outlet_total" :min="0" :precision="0" controls-position="right" placeholder="请输入" /><span>个</span></div></ElFormItem>
      <ElFormItem label="出水口损坏"><div class="number-unit"><ElInputNumber v-model="draft.outlet_damaged" :min="0" :precision="0" controls-position="right" placeholder="请输入" /><span>个</span></div></ElFormItem>
      <ElFormItem label="护筒总数"><div class="number-unit"><ElInputNumber v-model="draft.casing_total" :min="0" :precision="0" controls-position="right" placeholder="请输入" /><span>个</span></div></ElFormItem>
      <ElFormItem label="护筒损坏"><div class="number-unit"><ElInputNumber v-model="draft.casing_damaged" :min="0" :precision="0" controls-position="right" placeholder="请输入" /><span>个</span></div></ElFormItem>
      <slot name="panorama" />
    </template>
    <template v-else-if="draft.type === 'road'">
      <ElFormItem label="长度"><div class="number-unit"><ElInputNumber v-model="draft.length" :min="0" controls-position="right" placeholder="请输入" /><span>千米</span></div></ElFormItem>
      <ElFormItem label="宽度"><div class="number-unit"><ElInputNumber v-model="draft.width" :min="0" controls-position="right" placeholder="请输入" /><span>米</span></div></ElFormItem>
      <ElFormItem label="厚度"><div class="number-unit"><ElInputNumber v-model="draft.thickness" :min="0" controls-position="right" placeholder="请输入" /><span>米</span></div></ElFormItem>
    </template>
    <template v-else-if="draft.type === 'bridge'">
      <ElFormItem label="设施类型" required><ElRadioGroup :model-value="draft.kind" @update:model-value="select"><ElRadio value="bridge">桥</ElRadio><ElRadio value="culvert">涵</ElRadio><ElRadio value="gate">闸</ElRadio></ElRadioGroup></ElFormItem>
      <ElFormItem label="长度"><div class="number-unit"><ElInputNumber v-model="draft.length" :min="0" controls-position="right" placeholder="请输入" /><span>米</span></div></ElFormItem>
      <ElFormItem label="宽度"><div class="number-unit"><ElInputNumber v-model="draft.width" :min="0" controls-position="right" placeholder="请输入" /><span>米</span></div></ElFormItem>
    </template>
    <template v-else-if="draft.type === 'forest'">
      <ElFormItem label="移交株数"><div class="number-unit"><ElInputNumber v-model="draft.handover_count" :min="0" :precision="0" controls-position="right" placeholder="请输入" /><span>株</span></div></ElFormItem>
      <ElFormItem label="现有株数"><div class="number-unit"><ElInputNumber v-model="draft.existing_count" :min="0" :precision="0" controls-position="right" placeholder="请输入" /><span>株</span></div></ElFormItem>
    </template>
    <template v-else-if="draft.type === 'transformer'">
      <ElFormItem label="容量"><div class="number-unit"><ElInputNumber v-model="draft.capacity" :min="0" controls-position="right" placeholder="请输入" /><span>kVA</span></div></ElFormItem>
      <ElFormItem label="型号"><ElInput v-model="draft.model" placeholder="请输入" maxlength="128" /></ElFormItem>
      <ElFormItem label="电压等级"><ElRadioGroup :model-value="draft.voltage" @update:model-value="select"><ElRadio value="10kv">10kV</ElRadio><ElRadio value="0.4kv">0.4kV</ElRadio></ElRadioGroup></ElFormItem>
    </template>
  </div>
</template>

<style scoped>
.number-unit { display: flex; align-items: center; gap: 10px; width: 100%; }
.number-unit :deep(.el-input-number) { flex: 1; width: 100%; min-width: 0; }
.number-unit > span { flex: 0 0 30px; color: #777; }
.number-unit :deep(.el-input__inner) { text-align: left; }
</style>
