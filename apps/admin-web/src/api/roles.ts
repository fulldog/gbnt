import type {
  ApiClient,
  RoleInput,
  RolePermissionResult,
  SysApi,
  SysRole,
  UpdateRolePermissionInput,
} from "@gbnt/api-client";

export function createRolesApi(client: ApiClient) {
  return {
    list(): Promise<SysRole[]> {
      return client.request<SysRole[]>("/api/sys/roles");
    },

    create(input: RoleInput): Promise<SysRole> {
      return client.request<SysRole, RoleInput>("/api/sys/roles", {
        method: "POST",
        body: input,
      });
    },

    update(id: number, input: RoleInput): Promise<SysRole> {
      return client.request<SysRole, RoleInput>(`/api/sys/roles/${id}`, {
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
