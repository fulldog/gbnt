import { getResponseHeader } from "@gbnt/api-client";
import type {
  ApiClient,
  CreateUserInput,
  DownloadResult,
  ImportResult,
  SysUser,
  UpdateUserInput,
  UserListQuery,
  UserListResult,
} from "@gbnt/api-client";

export type ExportUsersQuery = Pick<UserListQuery, "org_id" | "keyword">;

export interface ImportUsersInput {
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
    list(query: UserListQuery = {}): Promise<UserListResult> {
      return client.request<UserListResult>("/api/sys/users", {
        query: { ...query },
      });
    },

    /** 后端已提供该路由，当前 OpenAPI 尚未收录。 */
    listByOrg(orgId: number): Promise<UserListResult> {
      return client.request<UserListResult>("/api/sys/users/by-org", {
        query: { org_id: orgId },
      });
    },

    create(input: CreateUserInput): Promise<SysUser> {
      return client.request<SysUser, CreateUserInput>("/api/sys/users", {
        method: "POST",
        body: input,
      });
    },

    update(id: number, input: UpdateUserInput): Promise<SysUser> {
      return client.request<SysUser, UpdateUserInput>(`/api/sys/users/${id}`, {
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
