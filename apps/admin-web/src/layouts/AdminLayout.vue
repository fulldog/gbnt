<script setup lang="ts">
import {
  ArrowDown,
  Expand,
  Fold,
  Key,
  Menu as MenuIcon,
  SwitchButton,
} from "@element-plus/icons-vue";
import { ElMessageBox } from "element-plus";
import { computed, onMounted, shallowRef, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import appLogoUrl from "@/assets/app-logo.png";
import { useAuthStore } from "@/stores/auth";
import { usePermissionStore } from "@/stores/permission";
import ChangePasswordDialog from "./ChangePasswordDialog.vue";
import { navigation } from "./navigation";
import type { NavigationItem } from "./navigation";

const auth = useAuthStore();
const permission = usePermissionStore();
const route = useRoute();
const router = useRouter();
const collapsed = shallowRef(localStorage.getItem("gbnt.admin.sidebar-collapsed") === "1");
const mobileOpen = shallowRef(false);
const passwordVisible = shallowRef(false);

const visibleNavigation = computed(() => {
  const filterItem = (item: NavigationItem): NavigationItem | null => {
    if (item.children) {
      const children = item.children.map(filterItem).filter((child): child is NavigationItem => child !== null);
      return children.length ? { ...item, children } : null;
    }
    return item.module && !permission.can(item.module) ? null : item;
  };
  return navigation.map(filterItem).filter((item): item is NavigationItem => item !== null);
});

const breadcrumbs = computed(() =>
  route.matched.filter((item) => item.meta.title !== "管理后台").map((item) => item.meta.title),
);

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
  <div class="flex h-full min-w-0 bg-[var(--gbnt-bg)]">
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
      <div class="flex h-[var(--gbnt-header-height)] items-center gap-3 border-b border-slate-200 px-4">
        <img :src="appLogoUrl" alt="" class="h-8 w-8 shrink-0 object-contain" />
        <strong v-if="!collapsed || mobileOpen" class="truncate text-sm font-semibold text-slate-900">高标农田整治平台</strong>
      </div>

      <ElMenu
        :default-active="route.path"
        :collapse="collapsed && !mobileOpen"
        :collapse-transition="false"
        router
        class="min-h-0 flex-1 !border-r-0 py-2"
      >
        <template v-for="item in visibleNavigation" :key="item.title">
          <ElSubMenu v-if="item.children" :index="item.title">
            <template #title>
              <ElIcon><component :is="item.icon" /></ElIcon>
              <span>{{ item.title }}</span>
            </template>
            <ElMenuItem v-for="child in item.children" :key="child.path" :index="child.path ?? child.title">
              <ElIcon><component :is="child.icon" /></ElIcon>
              <span>{{ child.title }}</span>
            </ElMenuItem>
          </ElSubMenu>
          <ElMenuItem v-else :index="item.path ?? item.title">
            <ElIcon><component :is="item.icon" /></ElIcon>
            <template #title>{{ item.title }}</template>
          </ElMenuItem>
        </template>
      </ElMenu>

      <button
        class="hidden h-12 items-center justify-center border-t border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-[var(--gbnt-primary)] lg:flex"
        :aria-label="collapsed ? '展开侧栏' : '收起侧栏'"
        @click="toggleCollapsed"
      >
        <ElIcon :size="18"><component :is="collapsed ? Expand : Fold" /></ElIcon>
      </button>
    </aside>

    <div class="flex min-w-0 flex-1 flex-col">
      <header class="flex h-[var(--gbnt-header-height)] shrink-0 items-center justify-between border-b border-slate-200 bg-white px-3 sm:px-5">
        <div class="flex min-w-0 items-center gap-3">
          <ElButton class="lg:!hidden" text circle :icon="MenuIcon" @click="mobileOpen = true">
            <span class="sr-only">打开导航</span>
          </ElButton>
          <ElBreadcrumb separator="/" class="min-w-0">
            <ElBreadcrumbItem>管理后台</ElBreadcrumbItem>
            <ElBreadcrumbItem v-for="item in breadcrumbs" :key="item">{{ item }}</ElBreadcrumbItem>
          </ElBreadcrumb>
        </div>

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
      </header>

      <main id="main-content" class="min-h-0 flex-1 overflow-auto p-4 sm:p-5 lg:p-6" tabindex="-1">
        <RouterView />
      </main>
    </div>

    <ChangePasswordDialog v-model="passwordVisible" />
  </div>
</template>
