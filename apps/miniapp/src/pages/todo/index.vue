<script setup lang="ts">
import type { IssueStatus, IssueType, OrgTreeNode, ProjectYear } from "@gbnt/api-client";
import {
  onLoad,
  onPullDownRefresh,
  onReachBottom,
  onShow,
  onUnload,
} from "@dcloudio/uni-app";
import { computed, shallowRef } from "vue";
import { miniappApi } from "@/api/runtime";
import IssueCard from "@/components/issue/IssueCard.vue";
import { usePagedIssues } from "@/composables/usePagedIssues";
import {
  errorMessage,
  ISSUE_FILTER_TYPE_OPTIONS,
  ISSUE_STATUS_OPTIONS,
} from "@/utils/issue-display";

interface PickerChangeEvent {
  detail: { value: string | number };
}

interface FilterOption<TValue> {
  label: string;
  value: TValue;
}

interface RegionOption extends FilterOption<number | undefined> {}

const YEAR_OPTIONS: FilterOption<ProjectYear | undefined>[] = [
  { label: "全部年度", value: undefined },
  { label: "2023 年", value: 2023 },
  { label: "2022 年", value: 2022 },
  { label: "2021 年", value: 2021 },
  { label: "2020 年", value: 2020 },
];

const {
  items,
  filters,
  total,
  error,
  hasMore,
  isRefreshing,
  isLoadingMore,
  reload,
  resetFilters,
  loadMore,
  invalidate,
} = usePagedIssues();

const searchKeyword = shallowRef("");
const regionOptions = shallowRef<RegionOption[]>([{ label: "全部区域", value: undefined }]);
const regionError = shallowRef("");
let showCount = 0;

const typeIndex = computed(() =>
  Math.max(0, ISSUE_FILTER_TYPE_OPTIONS.findIndex((option) => option.value === filters.value.type)),
);
const statusIndex = computed(() =>
  Math.max(0, ISSUE_STATUS_OPTIONS.findIndex((option) => option.value === filters.value.status)),
);
const yearIndex = computed(() =>
  Math.max(0, YEAR_OPTIONS.findIndex((option) => option.value === filters.value.projectYear)),
);
const regionIndex = computed(() =>
  Math.max(0, regionOptions.value.findIndex((option) => option.value === filters.value.orgId)),
);
const isInitialLoading = computed(() => isRefreshing.value && items.value.length === 0);
const hasActiveFilters = computed(
  () =>
    filters.value.type !== "all" ||
    filters.value.status !== "all" ||
    filters.value.orgId !== undefined ||
    filters.value.projectYear !== undefined ||
    filters.value.keyword !== "",
);

function flattenRegions(
  nodes: readonly OrgTreeNode[],
  parentNames: readonly string[] = [],
): RegionOption[] {
  const options: RegionOption[] = [];
  for (const node of nodes) {
    const names = [...parentNames, node.name];
    options.push({ label: names.join(" / "), value: node.id });
    options.push(...flattenRegions(node.children, names));
  }
  return options;
}

async function loadRegions(): Promise<void> {
  regionError.value = "";
  try {
    const result = await miniappApi.regions.list();
    regionOptions.value = [
      { label: "全部区域", value: undefined },
      ...flattenRegions(result.list),
    ];
  } catch (cause) {
    regionError.value = errorMessage(cause, "区域加载失败");
  }
}

function optionIndex(event: PickerChangeEvent): number {
  const value = Number(event.detail.value);
  return Number.isFinite(value) ? value : 0;
}

function changeType(event: PickerChangeEvent): void {
  const option = ISSUE_FILTER_TYPE_OPTIONS[optionIndex(event)];
  if (option) void reload({ type: option.value as IssueType | "all" });
}

function changeStatus(event: PickerChangeEvent): void {
  const option = ISSUE_STATUS_OPTIONS[optionIndex(event)];
  if (option) void reload({ status: option.value as IssueStatus | "all" });
}

function changeYear(event: PickerChangeEvent): void {
  const option = YEAR_OPTIONS[optionIndex(event)];
  if (option) void reload({ projectYear: option.value });
}

function changeRegion(event: PickerChangeEvent): void {
  const option = regionOptions.value[optionIndex(event)];
  if (option) void reload({ orgId: option.value });
}

function applySearch(): void {
  void reload({ keyword: searchKeyword.value.trim() });
}

function clearSearch(): void {
  if (!searchKeyword.value && !filters.value.keyword) return;
  searchKeyword.value = "";
  void reload({ keyword: "" });
}

function clearAllFilters(): void {
  searchKeyword.value = "";
  void resetFilters();
}

function openDetail(id: number): void {
  uni.navigateTo({ url: `/pages-sub/issue/detail?id=${id}` });
}

function openMap(id: number): void {
  uni.navigateTo({ url: `/pages-sub/issue/map?id=${id}` });
}

function previewImages(urls: string[], index: number): void {
  uni.previewImage({ current: urls[index], urls });
}

onLoad(() => {
  void Promise.all([loadRegions(), reload()]);
});

onShow(() => {
  showCount += 1;
  if (showCount > 1) void reload();
});

onPullDownRefresh(async () => {
  try {
    await Promise.all([loadRegions(), reload()]);
  } finally {
    uni.stopPullDownRefresh();
  }
});

onReachBottom(() => {
  void loadMore();
});

onUnload(invalidate);
</script>

<template>
  <view class="todo-page">
    <view class="todo-page__toolbar">
      <view class="todo-page__search">
        <text class="todo-page__search-icon" aria-hidden="true">⌕</text>
        <input
          v-model="searchKeyword"
          class="todo-page__search-input"
          confirm-type="search"
          placeholder="搜索设施编号或地址"
          @confirm="applySearch"
        />
        <button
          v-if="searchKeyword"
          class="todo-page__clear-search"
          aria-label="清空搜索"
          @tap="clearSearch"
        >
          ×
        </button>
        <button class="todo-page__search-button" @tap="applySearch">搜索</button>
      </view>

      <view class="todo-page__filters">
        <picker
          mode="selector"
          :range="ISSUE_FILTER_TYPE_OPTIONS"
          range-key="label"
          :value="typeIndex"
          @change="changeType"
        >
          <view class="todo-page__filter">
            <text>{{ ISSUE_FILTER_TYPE_OPTIONS[typeIndex]?.label }}</text><text class="todo-page__chevron">⌄</text>
          </view>
        </picker>
        <picker
          mode="selector"
          :range="ISSUE_STATUS_OPTIONS"
          range-key="label"
          :value="statusIndex"
          @change="changeStatus"
        >
          <view class="todo-page__filter">
            <text>{{ ISSUE_STATUS_OPTIONS[statusIndex]?.label }}</text><text class="todo-page__chevron">⌄</text>
          </view>
        </picker>
        <picker
          mode="selector"
          :range="YEAR_OPTIONS"
          range-key="label"
          :value="yearIndex"
          @change="changeYear"
        >
          <view class="todo-page__filter">
            <text>{{ YEAR_OPTIONS[yearIndex]?.label }}</text><text class="todo-page__chevron">⌄</text>
          </view>
        </picker>
        <picker
          mode="selector"
          :range="regionOptions"
          range-key="label"
          :value="regionIndex"
          @change="changeRegion"
        >
          <view class="todo-page__filter todo-page__filter--region">
            <text class="todo-page__filter-text">{{ regionOptions[regionIndex]?.label }}</text>
            <text class="todo-page__chevron">⌄</text>
          </view>
        </picker>
      </view>
      <text v-if="regionError" class="todo-page__region-error" @tap="loadRegions">
        {{ regionError }}，点击重试
      </text>
    </view>

    <view class="todo-page__content">
      <view v-if="items.length" class="todo-page__summary">
        <text>共 {{ total }} 条记录</text>
        <button v-if="hasActiveFilters" class="todo-page__reset" @tap="clearAllFilters">
          清除筛选
        </button>
      </view>

      <view v-if="isInitialLoading" class="todo-page__state">
        <view class="todo-page__spinner" />
        <text>正在加载待办…</text>
      </view>

      <view v-else-if="!items.length && error" class="todo-page__state">
        <text class="todo-page__state-title">待办加载失败</text>
        <text class="todo-page__state-text">{{ error }}</text>
        <button class="todo-page__retry" @tap="reload()">重新加载</button>
      </view>

      <view v-else-if="!items.length" class="todo-page__state">
        <view class="todo-page__empty-icon" aria-hidden="true">✓</view>
        <text class="todo-page__state-title">暂无符合条件的记录</text>
        <text class="todo-page__state-text">可以调整筛选条件，或下拉刷新后重试。</text>
        <button v-if="hasActiveFilters" class="todo-page__retry" @tap="clearAllFilters">
          清除筛选
        </button>
      </view>

      <view v-else class="todo-page__list">
        <IssueCard
          v-for="issue in items"
          :key="issue.id"
          :issue="issue"
          @open="openDetail"
          @map="openMap"
          @preview="previewImages"
        />
      </view>

      <view v-if="items.length" class="todo-page__footer-state">
        <text v-if="isLoadingMore">正在加载更多…</text>
        <button v-else-if="error" class="todo-page__footer-retry" @tap="loadMore">
          加载失败，点击重试
        </button>
        <text v-else-if="!hasMore">已经到底了</text>
        <text v-else>上拉加载更多</text>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.todo-page {
  min-height: 100vh;
  background: var(--gb-color-background, #f4f7fa);
}

.todo-page__toolbar {
  position: sticky;
  top: 0;
  z-index: 10;
  padding: 20rpx 24rpx 18rpx;
  border-bottom: 1rpx solid var(--gb-color-border, #e5eaf0);
  background: rgba(255, 255, 255, 0.98);
}

.todo-page__search {
  display: flex;
  align-items: center;
  gap: 12rpx;
  min-height: 80rpx;
  padding-left: 22rpx;
  border: 1rpx solid var(--gb-color-border, #dfe5ec);
  border-radius: var(--gb-radius-md, 16rpx);
  background: #f7f9fc;
}

.todo-page__search-icon {
  color: var(--gb-color-text-muted, #8490a3);
  font-size: 34rpx;
}

.todo-page__search-input {
  flex: 1;
  min-width: 0;
  height: 72rpx;
  color: var(--gb-color-text-primary, #172033);
  font-size: 28rpx;
}

.todo-page__clear-search,
.todo-page__search-button,
.todo-page__reset,
.todo-page__retry,
.todo-page__footer-retry {
  min-height: 0;
  padding: 0;
  border: 0;
  background: transparent;
}

.todo-page__clear-search::after,
.todo-page__search-button::after,
.todo-page__reset::after,
.todo-page__retry::after,
.todo-page__footer-retry::after {
  border: 0;
}

.todo-page__clear-search {
  width: 56rpx;
  height: 56rpx;
  color: var(--gb-color-text-muted, #8490a3);
  font-size: 38rpx;
  line-height: 56rpx;
}

.todo-page__search-button {
  align-self: stretch;
  min-width: 108rpx;
  padding: 0 18rpx;
  border-radius: 0 var(--gb-radius-md, 16rpx) var(--gb-radius-md, 16rpx) 0;
  background: var(--gb-color-primary, #015cbb);
  color: #fff;
  font-size: 27rpx;
  line-height: 80rpx;
}

.todo-page__filters {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12rpx;
  margin-top: 16rpx;
}

.todo-page__filter {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10rpx;
  min-height: 64rpx;
  padding: 0 18rpx;
  border-radius: var(--gb-radius-sm, 12rpx);
  background: #f2f5f8;
  color: var(--gb-color-text-secondary, #566176);
  font-size: 25rpx;
}

.todo-page__filter-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.todo-page__chevron {
  flex-shrink: 0;
  color: var(--gb-color-text-muted, #8490a3);
}

.todo-page__region-error {
  display: block;
  margin-top: 12rpx;
  color: var(--gb-color-danger, #cf1322);
  font-size: 23rpx;
  text-align: center;
}

.todo-page__content {
  padding: 20rpx 24rpx calc(40rpx + var(--gb-safe-area-bottom, 0px));
}

.todo-page__summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 52rpx;
  margin-bottom: 12rpx;
  color: var(--gb-color-text-muted, #8490a3);
  font-size: 24rpx;
}

.todo-page__reset {
  min-width: 112rpx;
  min-height: 52rpx;
  color: var(--gb-color-primary, #015cbb);
  font-size: 24rpx;
  line-height: 52rpx;
}

.todo-page__list {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.todo-page__state {
  display: flex;
  min-height: 58vh;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48rpx;
  color: var(--gb-color-text-muted, #8490a3);
  text-align: center;
}

.todo-page__spinner {
  width: 48rpx;
  height: 48rpx;
  margin-bottom: 24rpx;
  border: 5rpx solid rgba(1, 92, 187, 0.16);
  border-top-color: var(--gb-color-primary, #015cbb);
  border-radius: 50%;
  animation: todo-spin 800ms linear infinite;
}

.todo-page__empty-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 108rpx;
  height: 108rpx;
  margin-bottom: 28rpx;
  border-radius: 50%;
  background: rgba(1, 92, 187, 0.08);
  color: var(--gb-color-primary, #015cbb);
  font-size: 50rpx;
}

.todo-page__state-title {
  color: var(--gb-color-text-primary, #172033);
  font-size: 30rpx;
  font-weight: 600;
}

.todo-page__state-text {
  margin-top: 14rpx;
  font-size: 25rpx;
  line-height: 1.6;
}

.todo-page__retry {
  min-width: 180rpx;
  min-height: 72rpx;
  margin-top: 28rpx;
  border: 1rpx solid var(--gb-color-primary, #015cbb);
  border-radius: var(--gb-radius-sm, 12rpx);
  color: var(--gb-color-primary, #015cbb);
  font-size: 26rpx;
  line-height: 70rpx;
}

.todo-page__footer-state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 104rpx;
  color: var(--gb-color-text-muted, #8490a3);
  font-size: 24rpx;
}

.todo-page__footer-retry {
  min-width: 240rpx;
  min-height: 72rpx;
  color: var(--gb-color-danger, #cf1322);
  font-size: 24rpx;
  line-height: 72rpx;
}

@keyframes todo-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
