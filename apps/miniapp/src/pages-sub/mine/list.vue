<script setup lang="ts">
import { onLoad, onPullDownRefresh, onReachBottom, onShow, onUnload } from "@dcloudio/uni-app";
import MineIssueCard from "@/components/mine/MineIssueCard.vue";
import { useBusinessToday } from "@/composables/useBusinessToday";
import {
  normalizeMineScope,
  useMineIssueList,
} from "@/composables/mine/useMineIssueList";

interface MineListRouteQuery {
  scope?: string;
}

const listState = useMineIssueList();
const today = useBusinessToday();
let showCount = 0;

function openDetail(id: number): void {
  const source = encodeURIComponent(listState.scope.value);
  uni.navigateTo({ url: `/pages-sub/issue/detail?id=${id}&scope=${source}` });
}

function previewImages(urls: string[], current: string): void {
  if (!urls.length) return;
  uni.previewImage({ current, urls, showmenu: false });
}

onLoad((query?: MineListRouteQuery) => {
  const scope = normalizeMineScope(query?.scope);
  listState.setScope(scope);
  uni.setNavigationBarTitle({ title: listState.scopeMeta.value.title });
  void listState.loadFirstPage();
});

onPullDownRefresh(() => {
  void listState.loadFirstPage("refresh");
});

onReachBottom(() => {
  void listState.loadMore();
});

// 返回清单时重取首屏，清除已完成整改的旧卡片，保留当前清单分类。
onShow(() => {
  showCount += 1;
  if (showCount > 1) void listState.loadFirstPage("refresh");
});
onUnload(listState.invalidate);
</script>

<template>
  <view class="mine-list-page">
    <view v-if="listState.initialLoading.value" class="mine-list-state">
      <view class="mine-list-state__spinner" aria-hidden="true" />
      <text>正在加载{{ listState.scopeMeta.value.title }}…</text>
    </view>

    <view
      v-else-if="listState.errorMessage.value && !listState.items.value.length"
      class="mine-list-state"
    >
      <text class="mine-list-state__mark" aria-hidden="true">!</text>
      <text class="mine-list-state__title">加载失败</text>
      <text class="mine-list-state__message">{{ listState.errorMessage.value }}</text>
      <button class="mine-list-state__button" @tap="listState.retry()">
        重新加载
      </button>
    </view>

    <view v-else-if="listState.isEmpty.value" class="mine-list-state">
      <text class="mine-list-state__empty-mark" aria-hidden="true">□</text>
      <text class="mine-list-state__title">{{ listState.scopeMeta.value.empty }}</text>
      <text class="mine-list-state__message">下拉页面可重新获取数据</text>
    </view>

    <view v-else class="mine-list-page__content">
      <view class="mine-list-page__summary">
        <text>{{ listState.scopeMeta.value.title }}</text>
        <text>共 {{ listState.total.value }} 条</text>
      </view>
      <view v-if="listState.isStale.value" class="mine-list-page__stale" role="alert">
        刷新失败，当前显示上次加载的数据和总数。{{ listState.errorMessage.value }}
      </view>

      <view class="mine-list-page__cards">
        <MineIssueCard
          v-for="item in listState.items.value"
          :key="item.id"
          :issue="item"
          :today="today"
          @open="openDetail"
          @preview="previewImages"
        />
      </view>

      <view class="mine-list-page__footer">
        <text v-if="listState.refreshing.value">正在刷新…</text>
        <text v-else-if="listState.loadingMore.value">正在加载更多…</text>
        <button
          v-else-if="listState.errorMessage.value"
          class="mine-list-page__retry"
          @tap="listState.retry()"
        >
          {{ listState.isStale.value ? '刷新失败' : listState.errorMessage.value }}，点击重试
        </button>
        <text v-else-if="!listState.hasMore.value">没有更多了</text>
        <text v-else>上拉加载更多</text>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.mine-list-page__stale {
  margin-bottom: 12px;
  padding: 12px;
  border-radius: 6px;
  background: #fff3e0;
  color: #8c4c00;
  font-size: 13px;
  line-height: 1.6;
}

.mine-list-page {
  min-height: 100vh;
  background: var(--gbnt-bg, #eef3f8);
  color: var(--gbnt-text, #152033);
}

.mine-list-page__content {
  padding: 12px 14px calc(24px + env(safe-area-inset-bottom));
}

.mine-list-page__summary {
  display: flex;
  min-height: 44px;
  align-items: center;
  justify-content: space-between;
  color: var(--gbnt-text-secondary, #526277);
  font-size: 13px;
}

.mine-list-page__cards {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.mine-list-page__footer {
  display: flex;
  min-height: 52px;
  align-items: center;
  justify-content: center;
  color: #7b8798;
  font-size: 13px;
}

.mine-list-page__retry {
  min-height: 44px;
  margin: 0;
  padding: 0 18px;
  border: 0;
  background: transparent;
  color: var(--gbnt-primary, #015cbb);
  font-size: 13px;
  line-height: 44px;
}

.mine-list-page__retry::after {
  border: 0;
}

.mine-list-state {
  display: flex;
  min-height: 72vh;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 36px 28px;
  color: var(--gbnt-text-secondary, #526277);
  text-align: center;
  box-sizing: border-box;
}

.mine-list-state__spinner {
  width: 28px;
  height: 28px;
  margin-bottom: 14px;
  border: 3px solid #dbe7f3;
  border-top-color: var(--gbnt-primary, #015cbb);
  border-radius: 50%;
}

.mine-list-state__mark,
.mine-list-state__empty-mark {
  display: flex;
  width: 54px;
  height: 54px;
  align-items: center;
  justify-content: center;
  margin-bottom: 14px;
  border-radius: 50%;
  background: #ffffff;
  color: var(--gbnt-danger, #b42318);
  font-size: 26px;
  font-weight: 600;
}

.mine-list-state__empty-mark {
  color: #8ca0b8;
}

.mine-list-state__title {
  color: var(--gbnt-text, #152033);
  font-size: 16px;
  font-weight: 600;
}

.mine-list-state__message {
  margin-top: 8px;
  font-size: 13px;
  line-height: 1.6;
}

.mine-list-state__button {
  min-width: 112px;
  height: 44px;
  margin-top: 18px;
  border-radius: 6px;
  background: var(--gbnt-primary, #015cbb);
  color: #ffffff;
  font-size: 14px;
  line-height: 44px;
}

.mine-list-state__button::after {
  border: 0;
}
</style>
