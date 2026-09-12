import { getResponseHeader } from "@gbnt/api-client";
import type {
  ApiClient,
  CreateUserInput,
  DownloadResult,
  ImportResult,
  SysRole,
  SysUser,
  UpdateUserInput,
  UpdateUserStatusInput,
  UserListQuery,
  UserListResult,
} from "@gbnt/api-client";
import type { AdminUser, AdminUserListResult } from "./types";
import { checkDisplayFields, checkOptionalBoolean, responseArray, responseInteger, responseRecord } from "./response";

export type ExportUsersQuery = Pick<UserListQuery, "org_id" | "keyword">;

export interface ImportUsersInput {
  /** 人员xlsx；排序列缺失或空值默认100；英文角色ID优先，兼容旧文件的数字主键或唯一角色名称。 */
  file: Blob;
}

function filenameOf(file: Blob): string {
  if ("name" in file && typeof file.name === "string" && file.name) {
    return file.name;
  }
  return "users.xlsx";
}

function downloadFilename(headers: Readonly<Record<string, string>>): string | null {
  const contentDisposition = getResponseHeader(headers, "Content-Disposition");
  if (!contentDisposition) {
    return null;
  }

  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(contentDisposition)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return encoded;
    }
  }
  return /filename="?([^";]+)"?/i.exec(contentDisposition)?.[1] ?? null;
}

export function createUsersApi(client: ApiClient) {
  return {
    async list(query: UserListQuery = {}): Promise<AdminUserListResult> {
      const value = await client.request<unknown>("/api/sys/users", {
        query: { ...query, keyword: query.keyword?.trim() || undefined },
      });
      const result = responseRecord(value, "工作人员");
      return {
        list: responseArray(result.list, "工作人员").map((item): AdminUser => {
          const row = responseRecord(item, "工作人员");
          responseInteger(row.id, "人员 ID", 1);
          if (result.sort_supported === true) responseInteger(row.sort, "人员排序", -2147483648);
          checkDisplayFields(row, ["org_name", "org_path", "role_name"]);
          checkOptionalBoolean(row, "within_org_scope", "人员组织权限范围");
          checkOptionalBoolean(row, "within_role_scope", "人员角色权限范围");
          return row as unknown as AdminUser;
        }),
        total: responseInteger(result.total, "人员总数"),
        sort_supported: result.sort_supported === true,
        // 旧服务未返回分页元数据，仅在键缺失时沿用本次请求的有效值。
        page: responseInteger(result.page === undefined ? (query.page && query.page > 0 ? query.page : 1) : result.page, "页码", 1),
        size: responseInteger(result.size === undefined ? (query.size && query.size > 0 ? query.size : 20) : result.size, "每页数量", 1),
      };
    },

    /** 工作人员页面可分配角色，不依赖角色权限管理模块。 */
    listAssignableRoles(): Promise<SysRole[]> {
      return client.request<SysRole[]>("/api/sys/users/options/roles");
    },

    /** 后端已提供该路由，当前 OpenAPI 尚未收录。 */
    listByOrg(orgId: number): Promise<UserListResult> {
      return client.request<UserListResult>("/api/sys/users/by-org", {
        query: { org_id: orgId },
      });
    },

    /** sort 为可选整数，默认100；排序越小越靠前，同值按id倒序。 */
    create(input: CreateUserInput): Promise<SysUser> {
      return client.request<SysUser, CreateUserInput>("/api/sys/users", {
        method: "POST",
        body: input,
      });
    },

    /** sort/status 未传时保持原值；编辑人员资料不隐式改变账号状态。 */
    update(id: number, input: UpdateUserInput): Promise<SysUser> {
      return client.request<SysUser, UpdateUserInput>(`/api/sys/users/${id}`, {
        method: "PUT",
        body: input,
      });
    },

    /** 仅更新账号状态；与编辑人员共用 web.sys-staff/edit 权限。 */
    updateStatus(id: number, input: UpdateUserStatusInput): Promise<null> {
      return client.request<null, UpdateUserStatusInput>(`/api/sys/users/${id}/status`, {
        method: "PUT",
        body: input,
      });
    },

    remove(id: number): Promise<null> {
      return client.request<null>(`/api/sys/users/${id}`, { method: "DELETE" });
    },

    resetPassword(id: number): Promise<null> {
      return client.request<null>(`/api/sys/users/${id}/reset-password`, {
        method: "POST",
      });
    },

    /** 导出包含排序、英文角色ID和角色名称；顺序与人员列表一致，关联仍使用内部数字role_id。 */
    async exportFile(query: ExportUsersQuery = {}): Promise<DownloadResult<Blob>> {
      const response = await client.raw<Blob>("/api/sys/users/export", {
        query: { ...query },
        responseType: "blob",
      });
      return {
        blob: response.data,
        filename: downloadFilename(response.headers),
      };
    },

    importFile(input: ImportUsersInput): Promise<ImportResult> {
      const formData = new FormData();
      formData.append("file", input.file, filenameOf(input.file));
      return client.request<ImportResult, FormData>("/api/sys/users/import", {
        method: "POST",
        body: formData,
      });
    },
  } as const;
}

export type UsersApi = ReturnType<typeof createUsersApi>;
