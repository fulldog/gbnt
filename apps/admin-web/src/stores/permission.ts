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
      // 旧服务未返回结构化权限时才依赖目录；目录也不可读则按未授权处理。
      catalog.value = [];
      catalogAvailable.value = false;
    } finally {
      loading.value = false;
    }
  }

  function can(module: string, action = "view"): boolean {
    const auth = useAuthStore();
    const modulePermissions = auth.user?.permissions;
    if (modulePermissions === "*") return true;
    if (modulePermissions) {
      const actions = modulePermissions[module] ?? [];
      if (actions.includes(action)) return true;
      return action === "view" && ["create", "edit", "delete", "import", "export"].some((candidate) => actions.includes(candidate));
    }
    const permissions = auth.user?.apis;
    if (!auth.user || !permissions) return false;
    if (permissions === "*") return true;
    if (!catalogAvailable.value) return false;

    const matchingIds = catalog.value
      // 与后端 actionSatisfies 一致：操作权限隐含同模块查看，但不隐含其他写权限。
      .filter((item) => item.enabled !== false && item.module === module &&
        (item.action === action || (action === "view" && ["create", "edit", "delete", "import", "export"].includes(item.action))))
      .map((item) => item.id);
    return matchingIds.some((id) => permissions.includes(id));
  }

  function reset(): void {
    catalog.value = [];
    catalogAvailable.value = false;
  }

  return { can, catalog, catalogAvailable, loadCatalog, loading, reset };
});
