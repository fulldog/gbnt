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

const props = defineProps<{
  type: IssueType;
  details: ReportDetailsForm;
}>();
const { type, details } = toRefs(props);

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
        <text class="form-label">设施类型</text>
        <view class="choice-options" role="radiogroup">
          <button v-for="(option, index) in BUILD_KIND_OPTIONS" :key="option.value" class="choice-option" :class="{ 'choice-option--selected': details.buildKind === option.value }" role="radio" :aria-checked="details.buildKind === option.value" @tap="selectBuildKind({ detail: { value: index } })">
            <view class="choice-mark" aria-hidden="true">
              <image v-if="details.buildKind === option.value" class="choice-mark__icon" src="/static/icons/check-white.svg" mode="aspectFit" />
            </view>{{ option.label }}
          </button>
        </view>
      </view>
      <view class="form-grid">
        <view class="form-field">
          <text class="form-label">出水口总数</text>
          <input class="form-input" type="number" :value="details.outletTotal" placeholder="请输入" @input="update('outletTotal', $event)" /><text class="form-unit">个</text>
        </view>
        <view class="form-field">
          <text class="form-label">出水口损坏</text>
          <input class="form-input" type="number" :value="details.outletDamaged" placeholder="请输入" @input="update('outletDamaged', $event)" /><text class="form-unit">个</text>
        </view>
        <view class="form-field">
          <text class="form-label">护筒总数</text>
          <input class="form-input" type="number" :value="details.casingTotal" placeholder="请输入" @input="update('casingTotal', $event)" /><text class="form-unit">个</text>
        </view>
        <view class="form-field">
          <text class="form-label">护筒损坏</text>
          <input class="form-input" type="number" :value="details.casingDamaged" placeholder="请输入" @input="update('casingDamaged', $event)" /><text class="form-unit">个</text>
        </view>
      </view>
    </template>

    <template v-else-if="type === 'road'">
      <view class="form-grid">
        <view class="form-field">
          <text class="form-label">长度</text>
          <input class="form-input" type="digit" :value="details.length" placeholder="请输入" @input="update('length', $event)" /><text class="form-unit">千米</text>
        </view>
        <view class="form-field">
          <text class="form-label">宽度</text>
          <input class="form-input" type="digit" :value="details.width" placeholder="请输入" @input="update('width', $event)" /><text class="form-unit">米</text>
        </view>
        <view class="form-field">
          <text class="form-label">厚度</text>
          <input class="form-input" type="digit" :value="details.thickness" placeholder="请输入" @input="update('thickness', $event)" /><text class="form-unit">米</text>
        </view>
      </view>
    </template>

    <template v-else-if="type === 'bridge'">
      <view class="form-field">
        <text class="form-label">设施类型</text>
        <view class="choice-options" role="radiogroup">
          <button v-for="(option, index) in BRIDGE_KIND_OPTIONS" :key="option.value" class="choice-option" :class="{ 'choice-option--selected': details.bridgeKind === option.value }" role="radio" :aria-checked="details.bridgeKind === option.value" @tap="selectBridgeKind({ detail: { value: index } })">
            <view class="choice-mark" aria-hidden="true">
              <image v-if="details.bridgeKind === option.value" class="choice-mark__icon" src="/static/icons/check-white.svg" mode="aspectFit" />
            </view>{{ option.label }}
          </button>
        </view>
      </view>
      <view class="form-grid">
        <view class="form-field">
          <text class="form-label">长度</text>
          <input class="form-input" type="digit" :value="details.length" placeholder="请输入" @input="update('length', $event)" /><text class="form-unit">米</text>
        </view>
        <view class="form-field">
          <text class="form-label">宽度</text>
          <input class="form-input" type="digit" :value="details.width" placeholder="请输入" @input="update('width', $event)" /><text class="form-unit">米</text>
        </view>
      </view>
    </template>

    <template v-else-if="type === 'forest'">
      <view class="form-grid">
        <view class="form-field">
          <text class="form-label">移交株数</text>
          <input class="form-input" type="digit" :value="details.handoverCount" placeholder="请输入" @input="update('handoverCount', $event)" /><text class="form-unit">株</text>
        </view>
        <view class="form-field">
          <text class="form-label">现有株数</text>
          <input class="form-input" type="digit" :value="details.existingCount" placeholder="请输入" @input="update('existingCount', $event)" /><text class="form-unit">株</text>
        </view>
      </view>
    </template>

    <template v-else>
      <view class="form-field">
        <text class="form-label">容量</text>
        <input class="form-input" type="digit" :value="details.capacity" placeholder="请输入容量" @input="update('capacity', $event)" /><text class="form-unit">kVA</text>
      </view>
      <view class="form-field">
        <text class="form-label">型号</text>
        <input class="form-input" type="text" :value="details.transformerModel" placeholder="请输入型号" @input="update('transformerModel', $event)" />
      </view>
      <view class="form-field">
        <text class="form-label">电压等级</text>
        <view class="choice-options" role="radiogroup">
          <button v-for="(option, index) in VOLTAGE_OPTIONS" :key="option.value" class="choice-option" :class="{ 'choice-option--selected': details.voltage === option.value }" role="radio" :aria-checked="details.voltage === option.value" @tap="selectVoltage({ detail: { value: index } })">
            <view class="choice-mark" aria-hidden="true">
              <image v-if="details.voltage === option.value" class="choice-mark__icon" src="/static/icons/check-white.svg" mode="aspectFit" />
            </view>{{ option.label }}
          </button>
        </view>
      </view>
    </template>

    <slot name="after-type-fields" />

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
.type-fields, .form-grid {
  display: flex;
  flex-direction: column;
}
.form-field {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  min-height: 48px;
  padding: 10px 0;
  border-bottom: 1px solid #eef2f6;
}
.form-label {
  flex: none;
  color: #000;
  font-size: 14px;
  line-height: 1.5;
}
.form-input {
  flex: 1;
  min-width: 0;
  width: auto;
  height: 28px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--color-text);
  font-size: 14px;
  line-height: 28px;
  text-align: right;
}
.form-unit {
  flex: none;
  color: #6b7a90;
  font-size: 14px;
  line-height: 28px;
}
.choice-options {
  display: flex;
  flex: 1;
  justify-content: flex-end;
  gap: 14px;
  min-width: 0;
}
.choice-option {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--color-text);
  font-size: 14px;
  line-height: 28px;
}
.choice-option--selected {
  color: var(--color-primary);
  font-weight: 600;
}
.choice-mark {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: 1px solid #d9d9d9;
  border-radius: 50%;
}
.choice-option--selected .choice-mark {
  border-color: var(--color-primary);
  background: var(--color-primary);
}
.choice-mark__icon {
  flex: none;
  width: 14px;
  height: 14px;
}
</style>
