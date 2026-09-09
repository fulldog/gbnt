<script setup lang="ts">
import { computed, shallowRef, watch } from "vue";
import { onHide } from "@dcloudio/uni-app";
import type { OrgTreeNode } from "@gbnt/api-client";
import { useRegionPicker } from "./useRegionPicker";

const props = withDefaults(defineProps<{
  tree: readonly OrgTreeNode[];
  value: number | null;
  label?: string;
  mode?: "leaf" | "filter";
  loading?: boolean;
  error?: string;
  disabled?: boolean;
}>(), { label: "", mode: "leaf", loading: false, error: "", disabled: false });
const emit = defineEmits<{
  select: [selection: { id: number | null; label: string }];
  retry: [];
}>();
const headings = ["区县", "街道", "村（社区）"];
const rolling = shallowRef(false);
const { opened, indices, columns, selection, selectedLabel, selectedName, open, cancel, change, confirm } = useRegionPicker(
  () => props.tree,
  () => props.value,
  (value) => emit("select", value),
  () => props.mode,
);
// 展示已确认值；滚轮中的临时候选不会改动输入栏或筛选条件。
const fullLabel = computed(() => props.label || selectedLabel.value ||
  (props.value !== null ? "所选行政区划已失效" : ""));
const triggerLabel = computed(() => {
  if (props.loading && !props.label) return "正在加载…";
  if (props.mode === "filter") return selectedName.value || fullLabel.value || "全部区域";
  return fullLabel.value || "请选择行政区划";
});

function show(): void {
  if (props.loading || props.disabled) return;
  uni.hideKeyboard();
  rolling.value = false;
  open();
}

function onChange(event: { detail?: { value?: unknown } }): void {
  // 只接受完整三列的原生索引，避免迟到或异常事件污染候选路径。
  const value = event.detail?.value;
  if (!Array.isArray(value) || value.length !== 3 ||
    !value.every((index) => typeof index === "number" && Number.isInteger(index) && index >= 0)) return;
  change(value);
}

function commit(): void {
  if (!rolling.value && !props.loading && !props.error && !props.disabled) confirm();
}

onHide(cancel);
watch(() => props.disabled, (disabled) => { if (disabled) cancel(); });
</script>

<template>
  <view class="region-picker" :class="{ 'region-picker--filter': props.mode === 'filter' }">
    <button
      class="region-picker__trigger"
      :class="{ 'region-picker__trigger--placeholder': !fullLabel && props.mode === 'leaf' }"
      :disabled="props.loading || props.disabled"
      :aria-label="`选择行政区划，${fullLabel || '尚未选择'}`"
      :aria-expanded="opened"
      hover-class="region-picker__pressed"
      @tap="show"
    >
      <text class="region-picker__value">{{ triggerLabel }}</text>
      <image
        v-if="props.mode === 'filter'"
        class="region-picker__filter-chevron"
        src="/static/icons/chevron-down.svg"
        mode="aspectFit"
        aria-hidden="true"
      />
      <view v-else class="region-picker__chevron" aria-hidden="true" />
    </button>
    <view v-if="props.error && !opened" class="region-picker__error" role="alert">
      <text>{{ props.error }}</text>
      <button class="region-picker__action" @tap="emit('retry')">重新加载</button>
    </view>

    <view v-if="opened" class="region-picker__overlay" role="dialog" aria-modal="true" aria-label="行政区划选择">
      <view class="region-picker__mask" @tap="cancel" @touchmove.stop.prevent />
      <view class="region-picker__panel" @touchmove.stop>
        <view class="region-picker__header">
          <button class="region-picker__action" hover-class="region-picker__pressed" @tap="cancel">取消</button>
          <text class="region-picker__title">行政区划</text>
          <button
            class="region-picker__action region-picker__action--confirm"
            :disabled="!selection || rolling || props.loading || !!props.error || props.disabled"
            hover-class="region-picker__pressed"
            @tap="commit"
          >确定</button>
        </view>
        <view class="region-picker__headings">
          <text v-for="heading in headings" :key="heading">{{ heading }}</text>
        </view>
        <view v-if="props.loading" class="region-picker__status">行政区划加载中…</view>
        <view v-else-if="props.error" class="region-picker__status" role="alert">
          <text>{{ props.error }}</text>
          <button class="region-picker__action region-picker__action--confirm" @tap="emit('retry')">重新加载</button>
        </view>
        <picker-view
          v-else
          class="region-picker__wheel"
          :value="indices"
          :immediate-change="true"
          indicator-style="height: 44px; border-top: 1px solid #e8edf3; border-bottom: 1px solid #e8edf3;"
          @change="onChange"
          @pickstart="rolling = true"
          @pickend="rolling = false"
        >
          <picker-view-column v-for="(column, columnIndex) in columns" :key="columnIndex" :aria-label="headings[columnIndex]">
            <view
              v-for="(option, optionIndex) in column"
              :key="option.id ?? 'all'"
              class="region-picker__item"
              :class="{ 'region-picker__item--selected': indices[columnIndex] === optionIndex }"
            ><text>{{ option.name }}</text></view>
            <view v-if="column.length === 0" class="region-picker__item region-picker__item--empty">
              {{ columnIndex === 0 ? '暂无区划' : '暂无下级' }}
            </view>
          </picker-view-column>
        </picker-view>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.region-picker {
  min-width: 0;
  width: 100%;
}
.region-picker__trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  min-height: 28px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--color-text);
  font-size: 14px;
  line-height: 1.5;
  text-align: right;
}
.region-picker__trigger::after, .region-picker__action::after {
  border: 0;
}
.region-picker__trigger--placeholder {
  color: var(--color-text-tertiary);
}
.region-picker__trigger[disabled] {
  opacity: 0.6;
}
.region-picker__value {
  flex: 1;
  min-width: 0;
}
.region-picker--filter .region-picker__trigger {
  height: 36px;
  min-height: 36px;
  padding: 0 8px 0 10px;
  gap: 4px;
  border: 0;
  border-radius: 6px;
  background: #fff;
  color: var(--color-text);
  font-size: 12px;
  text-align: left;
}
.region-picker--filter .region-picker__value {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.region-picker__filter-chevron {
  flex: 0 0 14px;
  width: 14px;
  height: 14px;
}
.region-picker__chevron {
  flex: none;
  width: 6px;
  height: 6px;
  margin-right: 2px;
  border-top: 1px solid #8a94a3;
  border-right: 1px solid #8a94a3;
  transform: rotate(45deg);
}
.region-picker__pressed {
  opacity: 0.65;
}
.region-picker__overlay {
  position: fixed;
  inset: 0;
  z-index: 80;
}
.region-picker__mask {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  animation: region-picker-fade 220ms ease;
}
.region-picker__panel {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding-bottom: env(safe-area-inset-bottom);
  border-radius: 24rpx 24rpx 0 0;
  overflow: hidden;
  background: var(--color-surface);
  animation: region-picker-enter 220ms ease;
}
.region-picker__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 48px;
  padding: 0 8px;
  border-bottom: 1px solid var(--color-border);
}
.region-picker__title {
  color: var(--color-text);
  font-size: 16px;
  font-weight: 600;
}
.region-picker__action {
  min-width: 60px;
  min-height: 44px;
  margin: 0;
  padding: 0 12px;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 14px;
  line-height: 44px;
}
.region-picker__action--confirm {
  color: var(--color-primary);
  font-weight: 600;
}
.region-picker__action[disabled] {
  color: var(--color-text-tertiary);
  opacity: 0.55;
}
.region-picker__headings {
  display: flex;
  padding: 12px 0 4px;
  color: var(--color-text-secondary);
  font-size: 12px;
}
.region-picker__headings > text {
  flex: 1;
  text-align: center;
}
.region-picker__wheel {
  width: 100%;
  height: 220px;
}
.region-picker__item {
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  height: 44px;
  padding: 0 6px;
  color: var(--color-text);
  font-size: 14px;
  line-height: 20px;
  text-align: center;
  word-break: break-all;
}
.region-picker__item--selected {
  color: var(--color-primary);
  font-weight: 600;
}
.region-picker__item--empty {
  color: var(--color-text-tertiary);
  font-size: 12px;
}
.region-picker__status {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 220px;
  padding: 0 24rpx;
  color: var(--color-text-secondary);
  font-size: 14px;
}
.region-picker__error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  color: var(--color-danger);
  font-size: 24rpx;
}
@keyframes region-picker-enter { from { transform: translateY(100%); } to { transform: translateY(0); } }
@keyframes region-picker-fade { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .region-picker__mask, .region-picker__panel {
    animation: none;
  }
}
</style>
