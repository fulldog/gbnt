<script setup lang="ts">
import PageTopInset from "@/components/common/PageTopInset.vue";
import type { MineScope, MineStats } from "@gbnt/api-client";
import { computed, shallowRef, watch } from "vue";
import { onPullDownRefresh, onShow } from "@dcloudio/uni-app";
import { miniappApi } from "@/api/runtime";
import { useAuthStore } from "@/stores/auth";

const authStore = useAuthStore();
const stats = shallowRef<MineStats | null>(null);
const loading = shallowRef(false);
const loggingOut = shallowRef(false);
const errorMessage = shallowRef("");

const avatarText = computed(() => {
  const text = authStore.user?.name || authStore.user?.username || "用户";
  return text.slice(0, 1);
});

const roleText = computed(() => {
  if (!authStore.user) return "";
  if (authStore.user.is_super_admin) return "超级管理员";
  return authStore.user.role_name || (authStore.user.role_id ? "角色信息不可用" : "未分配角色");
});

const orgText = computed(() => {
  const user = authStore.user;
  if (!user) return "个人信息未加载，请下拉刷新";
  return user.org_path || user.org_name || (user.org_id ? "所属组织信息不可用，请下拉刷新" : "未分配组织");
});

watch(() => authStore.token, () => {
  // 防止同设备切换账号后短暂展示上一位用户的统计。
  stats.value = null;
  errorMessage.value = "";
});

function errorText(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "个人数据加载失败";
}

function openMineList(scope: MineScope): void {
  uni.navigateTo({ url: `/pages-sub/mine/list?scope=${scope}` });
}

function openPage(path: string): void {
  uni.navigateTo({ url: path });
}

async function loadMineData(): Promise<void> {
  if (loading.value) return;
  loading.value = true;
  errorMessage.value = "";
  let sessionToken: string | null = null;
  try {
    await authStore.restore();
    if (!authStore.token) {
      uni.reLaunch({ url: "/pages/login/index" });
      return;
    }

    sessionToken = authStore.token;
    const [nextStats] = await Promise.all([
      miniappApi.mine.getStats(),
      authStore.refreshUser(),
    ]);
    if (sessionToken === authStore.token) stats.value = nextStats;
  } catch (error) {
    if (sessionToken === authStore.token) errorMessage.value = errorText(error);
  } finally {
    loading.value = false;
    uni.stopPullDownRefresh();
  }
}

function confirmLogout(): Promise<boolean> {
  return new Promise((resolve) => {
    uni.showModal({
      title: "确认退出",
      content: "退出后需要重新输入账号和密码登录。",
      confirmText: "退出",
      confirmColor: "#b42318",
      success: (result) => resolve(Boolean(result.confirm)),
      fail: () => resolve(false),
    });
  });
}

async function logout(): Promise<void> {
  if (loggingOut.value || !(await confirmLogout())) return;
  loggingOut.value = true;
  try {
    await authStore.signOut();
  } finally {
    loggingOut.value = false;
    uni.reLaunch({ url: "/pages/login/index" });
  }
}

onShow(() => {
  void loadMineData();
});

onPullDownRefresh(() => {
  void loadMineData();
});
</script>

<template>
  <view class="mine-page">
    <PageTopInset />
    <view class="mine-page__hero">
      <view class="mine-page__profile">
        <view class="mine-page__avatar" aria-hidden="true">{{ avatarText }}</view>
        <view class="mine-page__identity">
          <view class="mine-page__name-row">
            <text class="mine-page__name">
              {{ authStore.user?.name || authStore.user?.username || "用户" }}
            </text>
            <text v-if="roleText" class="mine-page__role">{{ roleText }}</text>
          </view>
          <text v-if="authStore.user?.phone" class="mine-page__meta">{{ authStore.user.phone }}</text>
          <text class="mine-page__meta">{{ orgText }}</text>
        </view>
      </view>
    </view>

    <view class="mine-page__body">
      <view v-if="errorMessage" class="mine-error" role="alert">
        <view class="mine-error__content">
          <text class="mine-error__title">数据加载失败</text>
          <text class="mine-error__message">{{ errorMessage }}</text>
          <text v-if="stats" class="mine-error__message">当前显示上次成功加载的统计，下拉刷新或点击重试更新。</text>
        </view>
        <button class="mine-error__retry" @tap="loadMineData">重试</button>
      </view>

      <view class="mine-section">
        <view class="mine-stats" :class="{ 'mine-stats--loading': loading && !stats }">
          <button class="mine-stat" @tap="openMineList('reported')">
            <text class="mine-stat__number">{{ stats?.reported ?? "—" }}</text>
            <text class="mine-stat__label">我上报</text>
          </button>
          <button class="mine-stat" @tap="openMineList('pending')">
            <text class="mine-stat__number">{{ stats?.pending ?? "—" }}</text>
            <text class="mine-stat__label">待整改</text>
          </button>
          <button class="mine-stat" @tap="openMineList('done')">
            <text class="mine-stat__number">{{ stats?.done ?? "—" }}</text>
            <text class="mine-stat__label">已整改</text>
          </button>
        </view>
      </view>

      <view class="mine-section mine-section--menu">
        <button
          class="mine-menu-row"
          @tap="openPage('/pages-sub/account/change-password')"
        >
          <image class="mine-menu-row__icon" src="/static/icons/lock-primary.png" mode="aspectFit" aria-hidden="true" />
          <text class="mine-menu-row__label">修改密码</text>
          <image class="mine-menu-row__caret" src="/static/icons/chevron-right-muted.svg" mode="aspectFit" aria-hidden="true" />
        </button>
      </view>

      <view class="mine-section mine-section--menu">
        <button
          class="mine-menu-row"
          @tap="openPage('/pages-sub/legal/agreement')"
        >
          <image class="mine-menu-row__icon" src="/static/icons/ledger-primary.png" mode="aspectFit" aria-hidden="true" />
          <text class="mine-menu-row__label">用户协议</text>
          <image class="mine-menu-row__caret" src="/static/icons/chevron-right-muted.svg" mode="aspectFit" aria-hidden="true" />
        </button>
        <button
          class="mine-menu-row"
          @tap="openPage('/pages-sub/legal/privacy')"
        >
          <image class="mine-menu-row__icon" src="/static/icons/shield-primary.png" mode="aspectFit" aria-hidden="true" />
          <text class="mine-menu-row__label">隐私政策</text>
          <image class="mine-menu-row__caret" src="/static/icons/chevron-right-muted.svg" mode="aspectFit" aria-hidden="true" />
        </button>
      </view>

      <button
        class="mine-page__logout"
        :disabled="loggingOut"
        @tap="logout"
      >
        {{ loggingOut ? "正在退出" : "退出登录" }}
      </button>
    </view>
  </view>
</template>

<style scoped lang="scss">
.mine-page {
  min-height: 100vh;
  background: #fff;
  color: var(--gbnt-text);
}

.mine-page__hero {
  padding: 24px 16px 20px;
  color: var(--gbnt-text);
}

.mine-page__profile {
  display: flex;
  align-items: center;
  gap: 14px;
}

.mine-page__avatar {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border: 0;
  border-radius: 50%;
  background: var(--gbnt-primary);
  color: #fff;
  font-size: 22px;
  font-weight: 600;
}

.mine-page__identity {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
}

.mine-page__name-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.mine-page__name {
  font-size: 22px;
  font-weight: 600;
  word-break: break-all;
}

.mine-page__role {
  max-width: 100%;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--gbnt-primary-soft);
  color: var(--gbnt-primary);
  font-size: 12px;
  line-height: 16px;
}

.mine-page__meta {
  margin-top: 4px;
  color: var(--gbnt-text-secondary);
  font-size: 14px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.mine-page__body {
  padding: 0 16px 28px;
}

.mine-section {
  margin-bottom: 16px;
  background: #fff;
}

.mine-section__heading {
  display: flex;
  min-height: 48px;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
  border-bottom: 1px solid #eef2f6;
}

.mine-section__title {
  font-size: 15px;
  font-weight: 600;
}

.mine-section__hint {
  color: #7b8798;
  font-size: 12px;
}

.mine-stats {
  display: flex;
  padding: 14px 0;
  border-radius: 8px;
  background: #f0f4f8;
}

.mine-stats--loading {
  opacity: 0.6;
}

.mine-stat {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  line-height: 1.2;
}

.mine-stat + .mine-stat {
  border-left: 1px solid #e5ebf2;
}

.mine-stat::after,
.mine-menu-row::after {
  border: 0;
}

.mine-stat__number {
  color: var(--gbnt-primary);
  font-size: 22px;
  font-weight: 600;
}

.mine-stat__label {
  margin-top: 6px;
  color: var(--gbnt-text-secondary);
  font-size: 12px;
}

.mine-section--menu {
  padding: 0;
  margin-bottom: 0;
}

.mine-section__title--menu {
  display: flex;
  min-height: 44px;
  align-items: center;
  border-bottom: 1px solid #eef2f6;
}

.mine-menu-row {
  display: flex;
  width: 100%;
  min-height: 48px;
  align-items: center;
  gap: 10px;
  margin: 0;
  padding: 10px 0;
  border: 0;
  border-bottom: 1px solid #eef2f6;
  border-radius: 0;
  background: #fff;
  color: var(--gbnt-text);
  text-align: left;
  line-height: 1.4;
}



.mine-menu-row:active {
  background: #f8fafc;
}

.mine-menu-row__icon {
  flex: none;
  width: 20px;
  height: 20px;
  filter: grayscale(1) brightness(.25);
}

.mine-menu-row__label {
  flex: 1;
}

.mine-menu-row__tag {
  color: #a45b00;
  font-size: 11px;
}

.mine-menu-row__caret {
  flex: none;
  width: 16px;
  height: 16px;
}

.mine-page__logout {
  display: flex;
  width: 100%;
  min-height: 48px;
  align-items: center;
  justify-content: center;
  margin: 8px 0 0;
  padding: 10px 0;
  border: 0;
  border-radius: 0;
  background: #fff;
  color: var(--gbnt-danger);
  font-size: 14px;
  line-height: 1.4;
}

.mine-page__logout::after {
  border: 0;
}

.mine-error {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  padding: 12px 14px;
  border: 1px solid #f3b7b3;
  border-radius: 8px;
  background: #fff4f3;
}

.mine-error__content {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
}

.mine-error__title {
  color: var(--gbnt-danger, #b42318);
  font-size: 14px;
  font-weight: 600;
}

.mine-error__message {
  margin-top: 3px;
  color: #7b3b36;
  font-size: 12px;
}

.mine-error__retry {
  width: 64px;
  min-width: 64px;
  height: 44px;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--gbnt-primary, #015cbb);
  font-size: 13px;
  line-height: 44px;
}

.mine-error__retry::after {
  border: 0;
}
</style>
