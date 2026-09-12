<script setup lang="ts">
import {
  ArrowDown,
  Expand,
  Fold,
  Key,
  Menu as MenuIcon,
  FullScreen,
  Refresh,
  SwitchButton,
} from "@element-plus/icons-vue";
import { ElMessageBox } from "element-plus";
import { computed, onMounted, shallowRef, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import appLogoUrl from "@/assets/app-logo.png";
import { useAuthStore } from "@/stores/auth";
import { usePermissionStore } from "@/stores/permission";
import ChangePasswordDialog from "./ChangePasswordDialog.vue";
import RouteTabs from "./RouteTabs.vue";
import NavigationSearch from "./NavigationSearch.vue";
import { useFullscreen } from "@/composables/useFullscreen";
import { navigation } from "./navigation";
import type { NavigationItem } from "./navigation";

const auth = useAuthStore();
const permission = usePermissionStore();
const route = useRoute();
const router = useRouter();
const collapsed = shallowRef(localStorage.getItem("gbnt.admin.sidebar-collapsed") === "1");
const mobileOpen = shallowRef(false);
const passwordVisible = shallowRef(false);
const refreshVersion = shallowRef(0);
const { fullscreen, toggle: toggleFullscreen } = useFullscreen(() => document.documentElement);
const year = new Date().getFullYear();

// 所有后台入口保持可见；没有查看权限的菜单由 Element Plus 置灰且不可点击。
const visibleNavigation = computed<readonly NavigationItem[]>(() => navigation);

const breadcrumbs = computed(() =>
  route.matched.filter((item) => item.meta.title !== "管理后台").map((item) => item.meta.title),
);
const pages = computed(() => visibleNavigation.value.flatMap((item) => item.children ?? [item])
  .flatMap((item) => item.path && (!item.module || permission.can(item.module)) ? [{ title: item.title, path: item.path }] : []));

function toggleCollapsed(): void {
  collapsed.value = !collapsed.value;
  localStorage.setItem("gbnt.admin.sidebar-collapsed", collapsed.value ? "1" : "0");
}

async function logout(): Promise<void> {
  try {
    await ElMessageBox.confirm("确定退出当前账号吗？", "退出登录", {
      confirmButtonText: "退出",
      cancelButtonText: "取消",
      type: "warning",
    });
  } catch (error) {
    if (error === "cancel" || error === "close") return;
    throw error;
  }

  await auth.signOut().catch(() => undefined);
  permission.reset();
  await router.replace("/login");
}

watch(
  () => route.fullPath,
  () => {
    mobileOpen.value = false;
  },
);

onMounted(() => {
  void permission.loadCatalog();
});
</script>

<template>
  <div class="admin-layout flex h-full min-w-0 bg-[var(--gbnt-bg)]">
    <button
      v-if="mobileOpen"
      class="fixed inset-0 z-30 bg-slate-950/45 lg:hidden"
      aria-label="关闭导航"
      @click="mobileOpen = false"
    />

    <aside
      class="fixed inset-y-0 left-0 z-40 flex shrink-0 flex-col border-r border-slate-200 bg-white transition-transform duration-200 lg:static lg:translate-x-0"
      :class="[
        mobileOpen ? 'translate-x-0' : '-translate-x-full',
        collapsed
          ? 'w-[var(--gbnt-sidebar-width)] lg:w-[var(--gbnt-sidebar-collapsed-width)]'
          : 'w-[var(--gbnt-sidebar-width)]',
      ]"
    >
      <div class="sidebar-brand">
        <img :src="appLogoUrl" alt="高标准农田专项整治平台" />
      </div>

      <ElMenu
        :default-active="route.path"
        :collapse="collapsed && !mobileOpen"
        :collapse-transition="false"
        :default-openeds="['汇总管理', '系统配置']"
        router
        class="admin-menu min-h-0 flex-1 !border-r-0 py-2"
      >
        <template v-for="item in visibleNavigation" :key="item.title">
          <ElSubMenu v-if="item.children" :index="item.title">
            <template #title>
              <ElIcon><component :is="item.icon" /></ElIcon>
              <span>{{ item.title }}</span>
            </template>
            <ElMenuItem
              v-for="child in item.children"
              :key="child.path"
              :index="child.path ?? child.title"
              :disabled="Boolean(child.module && !permission.can(child.module))"
            >
              <ElIcon><component :is="child.icon" /></ElIcon>
              <span>{{ child.title }}</span>
            </ElMenuItem>
          </ElSubMenu>
          <ElMenuItem v-else :index="item.path ?? item.title" :disabled="Boolean(item.module && !permission.can(item.module))">
            <ElIcon><component :is="item.icon" /></ElIcon>
            <template #title>{{ item.title }}</template>
          </ElMenuItem>
        </template>
      </ElMenu>

    </aside>

    <div class="flex min-w-0 flex-1 flex-col">
      <header class="flex h-[var(--gbnt-header-height)] shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4">
        <div class="header-navigation flex min-w-0 items-center gap-2">
          <ElButton class="lg:!hidden" text circle :icon="MenuIcon" @click="mobileOpen = true">
            <span class="sr-only">打开导航</span>
          </ElButton>
          <ElButton class="!hidden lg:!inline-flex" text circle :icon="collapsed ? Expand : Fold" @click="toggleCollapsed"  v-bind="{ 'aria-label': collapsed ? '展开侧栏' : '收起侧栏' }" />
          <ElButton text circle :icon="Refresh" @click="refreshVersion++"  v-bind="{ 'aria-label': '刷新当前页面', 'title': '刷新当前页面' }" />
          <ElBreadcrumb separator="›" class="min-w-0">
            <ElBreadcrumbItem>首页</ElBreadcrumbItem>
            <ElBreadcrumbItem v-for="item in breadcrumbs" :key="item">{{ item }}</ElBreadcrumbItem>
          </ElBreadcrumb>
        </div>

        <div class="flex items-center gap-3">
        <NavigationSearch :items="pages" />
        <ElButton text circle :icon="FullScreen" @click="toggleFullscreen"  v-bind="{ 'aria-label': fullscreen ? '退出全屏' : '全屏' }" />
        <ElDropdown trigger="click">
          <button class="flex min-h-10 items-center gap-2 rounded-md px-2 text-sm text-slate-700 hover:bg-slate-50">
            <span class="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 font-semibold text-[var(--gbnt-primary)]">
              {{ auth.user?.name?.slice(0, 1) || auth.user?.username?.slice(0, 1) || "管" }}
            </span>
            <span class="hidden max-w-28 truncate sm:inline">{{ auth.user?.name || auth.user?.username }}</span>
            <ElIcon><ArrowDown /></ElIcon>
          </button>
          <template #dropdown>
            <ElDropdownMenu>
              <ElDropdownItem :icon="Key" @click="passwordVisible = true">修改密码</ElDropdownItem>
              <ElDropdownItem :icon="SwitchButton" divided @click="logout">退出登录</ElDropdownItem>
            </ElDropdownMenu>
          </template>
        </ElDropdown>
        </div>
      </header>

      <RouteTabs :items="pages" />

      <main id="main-content" class="admin-main" tabindex="-1">
        <RouterView :key="`${route.path}:${refreshVersion}`" />
      </main>
      <footer class="admin-footer">Copyright © {{ year }} 聊城经济技术开发区管委会</footer>
    </div>

    <ChangePasswordDialog v-model="passwordVisible" />
  </div>
</template>

<style scoped>
.sidebar-brand { height: var(--gbnt-header-height); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.header-navigation :deep(.el-button + .el-button) { margin-left: 0; }
.sidebar-brand img { width: 36px; height: 36px; object-fit: contain; }
.admin-main { display: flex; flex: 1; flex-direction: column; min-height: 0; min-width: 0; padding: 16px; overflow: auto; }
.admin-footer { flex-shrink: 0; height: 32px; display: flex; align-items: center; justify-content: center; color: #8a94a5; font-size: 12px; }
.admin-menu { --el-menu-item-height: 40px; --el-menu-sub-item-height: 40px; overflow-y: auto; }
.admin-menu :deep(.el-menu-item), .admin-menu :deep(.el-sub-menu__title) { height: 40px; margin: 4px 12px; padding-left: 12px !important; border-radius: 8px; font-weight: 600; color: var(--gbnt-text); }
.admin-menu :deep(.el-menu .el-menu-item) { padding-left: 40px !important; }
.admin-menu :deep(.el-menu-item.is-active) { color: var(--gbnt-primary); background: var(--gbnt-primary-soft); }
.admin-menu :deep(.el-sub-menu__title:hover), .admin-menu :deep(.el-menu-item:hover) { background: #f3f4f6; }
.admin-menu :deep(.el-menu-item.is-active:hover) { background: var(--gbnt-primary-soft); }
.admin-menu :deep(.el-icon) { font-size: 19px; color: #646a73; }
.admin-menu :deep(.is-active > .el-icon) { color: var(--gbnt-primary); }
.admin-menu :deep(.el-menu-item.is-disabled) { color: #a8b0bc; cursor: not-allowed; opacity: 0.7; }
.admin-menu :deep(.el-menu-item.is-disabled .el-icon) { color: #b7bec8; }
.admin-menu.el-menu--collapse :deep(.el-menu-item), .admin-menu.el-menu--collapse :deep(.el-sub-menu__title) { margin-right: 6px; margin-left: 6px; padding-left: 14px !important; }
@media (max-width: 767px) { .admin-main { padding: 12px; } .admin-footer { display: none; } }
</style>
