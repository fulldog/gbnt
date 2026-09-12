import type {
  ApiClient,
  CreateRoleInput,
  RoleInput,
  RolePermissionResult,
  SysApi,
  SysRole,
  UpdateRolePermissionInput,
  UpdateRoleInput,
} from "@gbnt/api-client";

export function createRolesApi(client: ApiClient) {
  return {
    list(): Promise<SysRole[]> {
      return client.request<SysRole[]>("/api/sys/roles");
    },

    /** 提交备注和权限并自动命名；英文标识由服务端生成。 */
    create(input: CreateRoleInput | RoleInput): Promise<SysRole> {
      return client.request<SysRole, CreateRoleInput | RoleInput>("/api/sys/roles", {
        method: "POST",
        body: input,
      });
    },

    /** 路径仍使用内部数字id；备注及api_ids在同一事务内保存，忽略改号。 */
    update(id: number, input: UpdateRoleInput): Promise<SysRole> {
      return client.request<SysRole, UpdateRoleInput>(`/api/sys/roles/${id}`, {
        method: "PUT",
        body: input,
      });
    },

    remove(id: number): Promise<null> {
      return client.request<null>(`/api/sys/roles/${id}`, { method: "DELETE" });
    },

    getPermissions(id: number): Promise<RolePermissionResult> {
      return client.request<RolePermissionResult>(`/api/sys/roles/${id}/apis`);
    },

    updatePermissions(
      id: number,
      input: UpdateRolePermissionInput,
    ): Promise<null> {
      return client.request<null, UpdateRolePermissionInput>(
        `/api/sys/roles/${id}/apis`,
        {
          method: "PUT",
          body: input,
        },
      );
    },

    listApis(): Promise<SysApi[]> {
      return client.request<SysApi[]>("/api/sys/apis");
    },
  } as const;
}

export type RolesApi = ReturnType<typeof createRolesApi>;
