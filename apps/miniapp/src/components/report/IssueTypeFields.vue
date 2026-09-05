<script setup lang="ts">
import { toRefs } from "vue";
import type { IssueType } from "@gbnt/api-client";
import {
  BRIDGE_KIND_OPTIONS,
  BUILD_KIND_OPTIONS,
  VOLTAGE_OPTIONS,
} from "@/domain/issues/definitions";
import type { ReportDetailsForm } from "@/domain/issues/form";
import { inputEventValue, type InputEventLike } from "@/utils/events";

interface PickerEventLike {
  detail: { value: string | number };
}

const { type, details } = toRefs(
  defineProps<{
    type: IssueType;
    details: ReportDetailsForm;
  }>(),
);

const emit = defineEmits<{
  updateField: [key: keyof ReportDetailsForm, value: string];
}>();

function update(
  key: keyof ReportDetailsForm,
  event: Event | InputEventLike,
): void {
  emit("updateField", key, inputEventValue(event));
}

function selectBuildKind(event: PickerEventLike): void {
  const option = BUILD_KIND_OPTIONS[Number(event.detail.value)];
  if (option) {
    emit("updateField", "buildKind", option.value);
  }
}

function selectBridgeKind(event: PickerEventLike): void {
  const option = BRIDGE_KIND_OPTIONS[Number(event.detail.value)];
  if (option) {
    emit("updateField", "bridgeKind", option.value);
  }
}

function selectVoltage(event: PickerEventLike): void {
  const option = VOLTAGE_OPTIONS[Number(event.detail.value)];
  if (option) {
    emit("updateField", "voltage", option.value);
  }
}
</script>

<template>
  <view class="type-fields">
    <template v-if="type === 'well'">
      <view class="form-field">
        <text class="form-label"><text class="required">*</text>建设类型</text>
        <picker
          :range="BUILD_KIND_OPTIONS"
          range-key="label"
          :value="BUILD_KIND_OPTIONS.findIndex((item) => item.value === details.buildKind)"
          @change="selectBuildKind"
        >
          <view class="picker-value">
            {{ BUILD_KIND_OPTIONS.find((item) => item.value === details.buildKind)?.label }}
          </view>
        </picker>
      </view>
      <view class="form-grid">
        <view class="form-field">
          <text class="form-label"><text class="required">*</text>出水口总数</text>
          <input class="form-input" type="number" :value="details.outletTotal" placeholder="0" @input="update('outletTotal', $event)" />
        </view>
        <view class="form-field">
          <text class="form-label"><text class="required">*</text>损坏数量</text>
          <input class="form-input" type="number" :value="details.outletDamaged" placeholder="0" @input="update('outletDamaged', $event)" />
        </view>
        <view class="form-field">
          <text class="form-label"><text class="required">*</text>护筒总数</text>
          <input class="form-input" type="number" :value="details.casingTotal" placeholder="0" @input="update('casingTotal', $event)" />
        </view>
        <view class="form-field">
          <text class="form-label"><text class="required">*</text>损坏数量</text>
          <input class="form-input" type="number" :value="details.casingDamaged" placeholder="0" @input="update('casingDamaged', $event)" />
        </view>
      </view>
    </template>

    <template v-else-if="type === 'road'">
      <view class="form-grid">
        <view class="form-field">
          <text class="form-label"><text class="required">*</text>长度（千米）</text>
          <input class="form-input" type="digit" :value="details.length" placeholder="0" @input="update('length', $event)" />
        </view>
        <view class="form-field">
          <text class="form-label"><text class="required">*</text>宽度（米）</text>
          <input class="form-input" type="digit" :value="details.width" placeholder="0" @input="update('width', $event)" />
        </view>
        <view class="form-field">
          <text class="form-label"><text class="required">*</text>厚度（米）</text>
          <input class="form-input" type="digit" :value="details.thickness" placeholder="0" @input="update('thickness', $event)" />
        </view>
        <view class="form-field">
          <text class="form-label"><text class="required">*</text>林网存活数（棵）</text>
          <input class="form-input" type="digit" :value="details.treeSurvive" placeholder="0" @input="update('treeSurvive', $event)" />
        </view>
      </view>
    </template>

    <template v-else-if="type === 'bridge'">
      <view class="form-field">
        <text class="form-label"><text class="required">*</text>设施类型</text>
        <picker
          :range="BRIDGE_KIND_OPTIONS"
          range-key="label"
          :value="BRIDGE_KIND_OPTIONS.findIndex((item) => item.value === details.bridgeKind)"
          @change="selectBridgeKind"
        >
          <view class="picker-value">
            {{ BRIDGE_KIND_OPTIONS.find((item) => item.value === details.bridgeKind)?.label }}
          </view>
        </picker>
      </view>
      <view class="form-grid">
        <view class="form-field">
          <text class="form-label"><text class="required">*</text>长度（米）</text>
          <input class="form-input" type="digit" :value="details.length" placeholder="0" @input="update('length', $event)" />
        </view>
        <view class="form-field">
          <text class="form-label"><text class="required">*</text>宽度（米）</text>
          <input class="form-input" type="digit" :value="details.width" placeholder="0" @input="update('width', $event)" />
        </view>
      </view>
    </template>

    <template v-else-if="type === 'forest'">
      <view class="form-grid">
        <view class="form-field">
          <text class="form-label"><text class="required">*</text>移交株数</text>
          <input class="form-input" type="digit" :value="details.handoverCount" placeholder="0" @input="update('handoverCount', $event)" />
        </view>
        <view class="form-field">
          <text class="form-label"><text class="required">*</text>现有株数</text>
          <input class="form-input" type="digit" :value="details.existingCount" placeholder="0" @input="update('existingCount', $event)" />
        </view>
      </view>
      <view class="form-field">
        <text class="form-label"><text class="required">*</text>存活率（%）</text>
        <input class="form-input" type="digit" :value="details.surviveRate" placeholder="0–100" @input="update('surviveRate', $event)" />
      </view>
    </template>

    <template v-else>
      <view class="form-field">
        <text class="form-label"><text class="required">*</text>容量（kVA）</text>
        <input class="form-input" type="digit" :value="details.capacity" placeholder="请输入容量" @input="update('capacity', $event)" />
      </view>
      <view class="form-field">
        <text class="form-label">型号</text>
        <input class="form-input" type="text" :value="details.transformerModel" placeholder="请输入型号" @input="update('transformerModel', $event)" />
      </view>
      <view class="form-field">
        <text class="form-label"><text class="required">*</text>电压等级</text>
        <picker
          :range="VOLTAGE_OPTIONS"
          range-key="label"
          :value="VOLTAGE_OPTIONS.findIndex((item) => item.value === details.voltage)"
          @change="selectVoltage"
        >
          <view class="picker-value">
            {{ VOLTAGE_OPTIONS.find((item) => item.value === details.voltage)?.label }}
          </view>
        </picker>
      </view>
    </template>

    <view class="form-field">
      <text class="form-label">负责人</text>
      <input class="form-input" type="text" :value="details.keeperName" placeholder="选填" @input="update('keeperName', $event)" />
    </view>
    <view class="form-field">
      <text class="form-label">负责人电话</text>
      <input class="form-input" type="number" maxlength="11" :value="details.keeperPhone" placeholder="选填，11 位手机号" @input="update('keeperPhone', $event)" />
    </view>
  </view>
</template>

<style scoped lang="scss">
.type-fields {
  display: flex;
  flex-direction: column;
  gap: 28rpx;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20rpx;
}

.form-field {
  min-width: 0;
}

.form-label {
  display: block;
  margin-bottom: 12rpx;
  color: var(--color-text);
  font-size: 27rpx;
  font-weight: 600;
  line-height: 1.45;
}

.required {
  margin-right: 6rpx;
  color: var(--color-danger);
}

.form-input,
.picker-value {
  box-sizing: border-box;
  width: 100%;
  min-height: 88rpx;
  padding: 0 24rpx;
  color: var(--color-text);
  font-size: 28rpx;
  line-height: 88rpx;
  background: var(--color-surface-muted);
  border: 2rpx solid transparent;
  border-radius: var(--radius-md);
}

.form-input:focus {
  background: var(--color-surface);
  border-color: var(--color-primary);
}

@media (max-width: 340px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
