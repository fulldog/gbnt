import type { AuthUser, SysApi } from "@gbnt/api-client";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminApi } from "@/api/runtime";
import { useAuthStore } from "@/stores/auth";
import { usePermissionStore } from "@/stores/permission";

const user: AuthUser = {
  id: 8,
  username: "operator",
  name: "操作员",
  phone: "",
  org_id: 3,
  role_id: 2,
  is_super_admin: false,
  apis: [101],
};

const catalog: SysApi[] = [
  {
    id: 101,
    method: "GET",
    path: "/api/issues",
    name: "问题列表",
    module: "web.rectify",
    action: "view",
    sort: 1,
    enabled: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    created_id: 1,
    updated_id: 1,
    is_delete: 0,
  },
  {
    id: 102,
    method: "POST",
    path: "/api/issues",
    name: "新增问题",
    module: "web.rectify",
    action: "create",
    sort: 2,
    enabled: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    created_id: 1,
    updated_id: 1,
    is_delete: 0,
  },
];

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  vi.restoreAllMocks();
});

describe("前端权限收敛", () => {
  it("用后端 API 数字 ID 映射 module/action", async () => {
    const auth = useAuthStore();
    auth.applyUser(user);
    vi.spyOn(adminApi.roles, "listApis").mockResolvedValue(catalog);

    const permission = usePermissionStore();
    await permission.loadCatalog();

    expect(permission.can("web.rectify", "view")).toBe(true);
    expect(permission.can("web.rectify", "create")).toBe(false);
  });

  it("超级管理员固定拥有全部界面权限", () => {
    const auth = useAuthStore();
    auth.applyUser({ ...user, is_super_admin: true, apis: "*" });

    expect(usePermissionStore().can("web.sys-roles", "delete")).toBe(true);
  });

  it("目录接口不可用时不在前端误判拒绝", async () => {
    const auth = useAuthStore();
    auth.applyUser(user);
    vi.spyOn(adminApi.roles, "listApis").mockRejectedValue(new Error("forbidden"));

    const permission = usePermissionStore();
    await permission.loadCatalog();

    expect(permission.catalogAvailable).toBe(false);
    expect(permission.can("web.rectify", "create")).toBe(true);
  });
});
