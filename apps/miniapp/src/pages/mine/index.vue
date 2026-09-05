<script setup lang="ts">
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
        <view class="mine-section__heading">
          <text class="mine-section__title">工作概览</text>
          <text v-if="loading" class="mine-section__hint">正在更新…</text>
          <text v-else class="mine-section__hint">点击数字查看清单</text>
        </view>
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
        <text class="mine-section__title mine-section__title--menu">账号与安全</text>
        <button
          class="mine-menu-row"
          @tap="openPage('/pages-sub/account/change-password')"
        >
          <image class="mine-menu-row__icon" src="/static/icons/lock-primary.png" mode="aspectFit" aria-hidden="true" />
          <text class="mine-menu-row__label">修改密码</text>
          <text class="mine-menu-row__caret" aria-hidden="true">›</text>
        </button>
      </view>

      <view class="mine-section mine-section--menu">
        <text class="mine-section__title mine-section__title--menu">关于与帮助</text>
        <button
          class="mine-menu-row"
          @tap="openPage('/pages-sub/legal/agreement')"
        >
          <image class="mine-menu-row__icon" src="/static/icons/ledger-primary.png" mode="aspectFit" aria-hidden="true" />
          <text class="mine-menu-row__label">用户协议</text>
          <text class="mine-menu-row__tag">开发占位</text>
          <text class="mine-menu-row__caret" aria-hidden="true">›</text>
        </button>
        <button
          class="mine-menu-row"
          @tap="openPage('/pages-sub/legal/privacy')"
        >
          <image class="mine-menu-row__icon" src="/static/icons/shield-primary.png" mode="aspectFit" aria-hidden="true" />
          <text class="mine-menu-row__label">隐私政策</text>
          <text class="mine-menu-row__tag">开发占位</text>
          <text class="mine-menu-row__caret" aria-hidden="true">›</text>
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
  background: var(--gbnt-bg, #eef3f8);
  color: var(--gbnt-text, #152033);
}

.mine-page__hero {
  padding: calc(28px + env(safe-area-inset-top)) 20px 46px;
  background: linear-gradient(145deg, #0163c9 0%, #014a96 72%, #197447 150%);
  color: #ffffff;
}

.mine-page__profile {
  display: flex;
  min-height: 72px;
  align-items: center;
  gap: 14px;
}

.mine-page__avatar {
  display: flex;
  width: 62px;
  height: 62px;
  flex: none;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.55);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.16);
  font-size: 24px;
  font-weight: 700;
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
  font-size: 21px;
  font-weight: 700;
  word-break: break-all;
}

.mine-page__role {
  max-width: 100%;
  padding: 3px 7px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.18);
  font-size: 12px;
}

.mine-page__meta {
  margin-top: 5px;
  color: rgba(255, 255, 255, 0.9);
  font-size: 13px;
  word-break: break-all;
}

.mine-page__body {
  position: relative;
  margin-top: -24px;
  padding: 0 14px calc(28px + env(safe-area-inset-bottom));
}

.mine-section {
  overflow: hidden;
  margin-bottom: 12px;
  border: 1px solid var(--gbnt-border, #dce4ee);
  border-radius: 8px;
  background: #ffffff;
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
  padding: 16px 0;
}

.mine-stats--loading {
  opacity: 0.6;
}

.mine-stat {
  display: flex;
  min-width: 0;
  min-height: 62px;
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
  color: var(--gbnt-primary, #015cbb);
  font-size: 24px;
  font-weight: 700;
}

.mine-stat__label {
  margin-top: 7px;
  color: var(--gbnt-text-secondary, #526277);
  font-size: 12px;
}

.mine-section--menu {
  padding: 0 14px;
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
  min-height: 54px;
  align-items: center;
  gap: 10px;
  margin: 0;
  padding: 0;
  border: 0;
  border-bottom: 1px solid #eef2f6;
  border-radius: 0;
  background: transparent;
  color: inherit;
  font-size: 14px;
  line-height: 1.4;
  text-align: left;
}

.mine-menu-row:last-child {
  border-bottom: 0;
}

.mine-menu-row:active {
  background: #f8fafc;
}

.mine-menu-row__icon {
  display: block;
  flex: none;
  width: 30px;
  height: 30px;
  padding: 5px;
  border-radius: 5px;
  background: var(--gbnt-primary-soft, #e8f1fb);
}

.mine-menu-row__label {
  flex: 1;
}

.mine-menu-row__tag {
  color: #a45b00;
  font-size: 11px;
}

.mine-menu-row__caret {
  color: #a8b2c0;
  font-size: 24px;
}

.mine-page__logout {
  display: flex;
  width: 100%;
  height: 48px;
  align-items: center;
  justify-content: center;
  margin-top: 16px;
  border: 1px solid #f3b7b3;
  border-radius: 8px;
  background: #ffffff;
  color: var(--gbnt-danger, #b42318);
  font-size: 15px;
  line-height: 48px;
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
