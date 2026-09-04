import type { SysApi } from "@gbnt/api-client";
import { defineStore } from "pinia";
import { shallowRef } from "vue";
import { adminApi } from "@/api/runtime";
import { useAuthStore } from "./auth";

export const usePermissionStore = defineStore("permission", () => {
  const catalog = shallowRef<SysApi[]>([]);
  const catalogAvailable = shallowRef(false);
  const loading = shallowRef(false);

  async function loadCatalog(): Promise<void> {
    const auth = useAuthStore();
    if (!auth.user || loading.value || catalogAvailable.value) return;

    loading.value = true;
    try {
      catalog.value = await adminApi.roles.listApis();
      catalogAvailable.value = true;
    } catch {
      // 普通角色可能没有 API 目录权限。此时不在前端误判拒绝，最终以后端 RBAC 为准。
      catalog.value = [];
      catalogAvailable.value = false;
    } finally {
      loading.value = false;
    }
  }

  function can(module: string, action = "view"): boolean {
    const auth = useAuthStore();
    const permissions = auth.user?.apis;
    if (!auth.user || !permissions) return false;
    if (permissions === "*") return true;
    if (!catalogAvailable.value) return true;

    const matchingIds = catalog.value
      .filter((item) => item.module === module && item.action === action)
      .map((item) => item.id);
    return matchingIds.some((id) => permissions.includes(id));
  }

  function reset(): void {
    catalog.value = [];
    catalogAvailable.value = false;
  }

  return { can, catalog, catalogAvailable, loadCatalog, loading, reset };
});
