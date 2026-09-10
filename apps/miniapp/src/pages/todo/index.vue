<script setup lang="ts">
import PageTopInset from "@/components/common/PageTopInset.vue";
import type { IssueStatus, IssueType } from "@gbnt/api-client";
import {
  onLoad,
  onShareAppMessage,
  onShareTimeline,
  onShow,
  onUnload,
} from "@dcloudio/uni-app";
import { computed, shallowRef, watch } from "vue";
import { miniappApi } from "@/api/runtime";
import IssueCard from "@/components/issue/IssueCard.vue";
import RegionPicker from "@/components/region/RegionPicker.vue";
import { usePagedIssues } from "@/composables/usePagedIssues";
import { useBusinessNow } from "@/composables/useBusinessNow";
import { useAuthStore } from "@/stores/auth";
import { useTodoRegion } from "@/composables/useTodoRegion";
import type { TodoIssueFilters } from "@/composables/usePagedIssues";
import { businessToday } from "@/utils/business-date";
import {
  ISSUE_FILTER_TYPE_OPTIONS,
  ISSUE_STATUS_OPTIONS,
} from "@/utils/issue-display";

interface PickerChangeEvent {
  detail: { value: string | number };
}

const auth = useAuthStore();
const region = useTodoRegion(() => auth.user);
const { tree: regionTree, loading: regionLoading, error: regionError, ready: regionReady } = region;
const paged = usePagedIssues((query) => {
  if (!region.ready.value || query.org_id !== region.selectedId.value) return Promise.reject(new Error("请选择具体村／社区"));
  return miniappApi.todos.list(query);
});
const {
  items,
  filters,
  total,
  clockOffset,
  error,
  hasMore,
  isRefreshing,
  isLoadingMore,
  isStale,
  loadMore: loadNext,
  retry,
  invalidate,
} = paged;

const searchKeyword = shallowRef("");
const now = useBusinessNow(() => clockOffset.value);
watch(() => businessToday(now.value), () => { void reload(); });
const refresherTriggered = shallowRef(false);
let showCount = 0;
let active = true;

const typeIndex = computed(() =>
  Math.max(0, ISSUE_FILTER_TYPE_OPTIONS.findIndex((option) => option.value === filters.value.type)),
);
const statusIndex = computed(() =>
  Math.max(0, ISSUE_STATUS_OPTIONS.findIndex((option) => option.value === filters.value.status)),
);
const isInitialLoading = computed(() => isRefreshing.value && items.value.length === 0);
const hasActiveFilters = computed(
  () =>
    filters.value.type !== "all" ||
    filters.value.status !== "all" ||
    filters.value.keyword !== "",
);

function reload(patch?: Partial<TodoIssueFilters>): Promise<boolean> {
  if (!active || !region.ready.value) return Promise.resolve(false);
  return paged.reload(patch || filters.value.orgId !== region.selectedId.value ? { ...patch, orgId: region.selectedId.value } : undefined);
}

function loadMore(): Promise<boolean> {
  return regionLoading.value || !regionReady.value || refresherTriggered.value ? Promise.resolve(false) : loadNext();
}

async function loadRegions(): Promise<void> {
  await region.load();
  if (!active) return;
  if (region.ready.value) await reload();
  else paged.clear();
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

function changeRegion(option: { id: number | null; label: string }): void {
  if (region.select(option.id)) void reload();
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
  region.reset();
  void reload({ keyword: "", type: "all", status: "all", projectYear: undefined });
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

async function refreshList(): Promise<void> {
  if (refresherTriggered.value) return;
  refresherTriggered.value = true;
  try {
    await loadRegions();
  } finally {
    refresherTriggered.value = false;
  }
}

onShareAppMessage(() => ({
  title: "农田专项整治 · 待办任务",
  path: "/pages/todo/index",
}));

onShareTimeline(() => ({
  title: "农田专项整治 · 待办任务",
  query: "",
}));

onLoad(() => {
  void loadRegions();
});

onShow(() => {
  showCount += 1;
  if (showCount > 1) void reload();
});

onUnload(() => {
  active = false;
  region.invalidate();
  refresherTriggered.value = false;
  invalidate();
});
</script>

<template>
  <view class="todo-page">
    <PageTopInset title="农田专项整治" />
    <view class="todo-page__toolbar">
      <view class="todo-page__search">
        <button class="todo-page__search-icon" aria-label="搜索" @tap="applySearch"><view class="todo-page__magnifier" /></button>
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
          <image class="todo-page__clear-search-icon" src="/static/icons/close-muted.svg" mode="aspectFit" aria-hidden="true" />
        </button>
      </view>

      <view class="todo-page__filters">
        <picker
          class="todo-page__filter-picker"
          mode="selector"
          :range="ISSUE_FILTER_TYPE_OPTIONS"
          range-key="label"
          :value="typeIndex"
          @change="changeType"
        >
          <view class="todo-page__filter">
            <text class="todo-page__filter-label">{{ ISSUE_FILTER_TYPE_OPTIONS[typeIndex]?.label }}</text>
            <image class="todo-page__chevron" src="/static/icons/chevron-down.svg" mode="aspectFit" aria-hidden="true" />
          </view>
        </picker>
        <view class="todo-page__region-filter">
          <RegionPicker
            mode="village"
            start-level="street"
            :tree="regionTree"
            :value="region.selectedId.value ?? null"
            :loading="regionLoading"
            :error="regionError"
            :show-inline-error="false"
            @select="changeRegion"
            @retry="loadRegions"
          />
        </view>
        <picker
          class="todo-page__filter-picker"
          mode="selector"
          :range="ISSUE_STATUS_OPTIONS"
          range-key="label"
          :value="statusIndex"
          @change="changeStatus"
        >
          <view class="todo-page__filter">
            <text class="todo-page__filter-label">{{ ISSUE_STATUS_OPTIONS[statusIndex]?.label }}</text>
            <image class="todo-page__chevron" src="/static/icons/chevron-down.svg" mode="aspectFit" aria-hidden="true" />
          </view>
        </picker>
      </view>
    </view>

    <scroll-view
      class="todo-page__scroll"
      scroll-y
      enhanced
      :show-scrollbar="false"
      refresher-enabled
      refresher-background="transparent"
      :refresher-triggered="refresherTriggered"
      :lower-threshold="80"
      @refresherrefresh="refreshList"
      @scrolltolower="loadMore()"
    >
      <view class="todo-page__content">
        <view v-if="items.length && hasActiveFilters" class="todo-page__summary">
          <text>共 {{ total }} 条记录</text>
          <button v-if="hasActiveFilters" class="todo-page__reset" @tap="clearAllFilters">
            清除筛选
          </button>
        </view>
        <view v-if="isStale" class="todo-page__stale" role="alert">
          刷新失败，当前显示上次加载的数据和总数。{{ error }}
        </view>

        <view v-if="!regionReady" class="todo-page__state">
          <text class="todo-page__state-title">{{ regionLoading ? '正在加载行政区划…' : regionError ? '行政区划加载失败' : '请选择具体村／社区' }}</text>
          <text class="todo-page__state-text">{{ regionError || '选择行政区划后查看该村／社区的待办记录。' }}</text>
          <button v-if="regionError" class="todo-page__retry" @tap="loadRegions">重新加载</button>
        </view>
        <view v-else-if="isInitialLoading" class="todo-page__state">
          <view class="todo-page__spinner" />
          <text>正在加载待办…</text>
        </view>

        <view v-else-if="!items.length && error" class="todo-page__state">
          <text class="todo-page__state-title">待办加载失败</text>
          <text class="todo-page__state-text">{{ error }}</text>
          <button class="todo-page__retry" @tap="retry()">重新加载</button>
        </view>

        <view v-else-if="!items.length" class="todo-page__state">
          <view class="todo-page__empty-icon" aria-hidden="true">
            <image class="todo-page__empty-check" src="/static/icons/check-primary.svg" mode="aspectFit" />
          </view>
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
            :now="now"
            @open="openDetail"
            @map="openMap"
            @preview="previewImages"
          />
        </view>

        <view v-if="items.length" class="todo-page__footer-state">
          <text>共 {{ total }} 条记录 · </text>
          <text v-if="isRefreshing">正在刷新…</text>
          <text v-else-if="isLoadingMore">正在加载更多…</text>
          <button v-else-if="error" class="todo-page__footer-retry" @tap="retry()">
            {{ isStale ? '刷新失败' : error }}，点击重试
          </button>
          <text v-else-if="!hasMore">已经到底了</text>
          <text v-else>上拉加载更多</text>
        </view>
      </view>
    </scroll-view>
  </view>
</template>

<style scoped lang="scss">
.todo-page__stale {
  margin-bottom: 20rpx;
  padding: 20rpx;
  border-radius: 12rpx;
  background: #fff3e0;
  color: #8c4c00;
  font-size: 26rpx;
  line-height: 1.6;
}

.todo-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: linear-gradient(180deg, #e8f1fb 0, #f4f7fb 42%, #f4f7fb 100%);
}

.todo-page__toolbar {
  position: relative;
  z-index: 10;
  flex: none;
  padding: 16px 16px 10px;
}

.todo-page__search {
  display: flex;
  align-items: center;
  height: 40px;
  overflow: hidden;
  border: 0;
  border-radius: 6px;
  background: #fff;
}

.todo-page__search-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 40px;
  height: 40px;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: #8a94a3;
}

.todo-page__search-input {
  flex: 1;
  min-width: 0;
  height: 40px;
  padding-right: 12px;
  color: var(--gb-color-text-primary);
  font-size: 14px;
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
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 56rpx;
  height: 56rpx;
}

.todo-page__clear-search-icon {
  flex: none;
  width: 20px;
  height: 20px;
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
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 10px;
}

.todo-page__filter {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  height: 36px;
  min-width: 0;
  padding: 0 8px 0 10px;
  border-radius: 6px;
  background: #fff;
  color: var(--gb-color-text-primary);
  font-size: 12px;
}

.todo-page__filter-picker,
.todo-page__region-filter {
  min-width: 0;
  width: 100%;
}

.todo-page__chevron {
  flex: 0 0 14px;
  width: 14px;
  height: 14px;
}

.todo-page__scroll {
  flex: 1;
  min-height: 0;
  height: 0;
  width: 100%;
}

.todo-page__content {
  padding: 0 16px 24px;
}

.todo-page__summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 24px;
  margin-bottom: 6px;
  color: var(--gb-color-text-muted);
  font-size: 12px;
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
  gap: 10px;
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
}

.todo-page__empty-check {
  flex: none;
  width: 26px;
  height: 26px;
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
.todo-page__magnifier {
  position: relative;
  width: 13px;
  height: 13px;
  margin: -3px 3px 0 0;
  border: 1.5px solid currentColor;
  border-radius: 50%;
}
.todo-page__magnifier::after {
  position: absolute;
  right: -4px;
  bottom: -3px;
  width: 6px;
  height: 1.5px;
  background: currentColor;
  transform: rotate(45deg);
  content: '';
}
.todo-page__filter-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
</style>
