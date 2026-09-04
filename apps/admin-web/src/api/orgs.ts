import type {
  ApiClient,
  CreateOrgInput,
  SysOrg,
  UpdateOrgInput,
} from "@gbnt/api-client";

export function createOrgsApi(client: ApiClient) {
  return {
    list(): Promise<SysOrg[]> {
      return client.request<SysOrg[]>("/api/sys/orgs");
    },

    create(input: CreateOrgInput): Promise<SysOrg> {
      return client.request<SysOrg, CreateOrgInput>("/api/sys/orgs", {
        method: "POST",
        body: input,
      });
    },

    update(id: number, input: UpdateOrgInput): Promise<SysOrg> {
      return client.request<SysOrg, UpdateOrgInput>(`/api/sys/orgs/${id}`, {
        method: "PUT",
        body: input,
      });
    },

    remove(id: number): Promise<null> {
      return client.request<null>(`/api/sys/orgs/${id}`, { method: "DELETE" });
    },
  } as const;
}

export type OrgsApi = ReturnType<typeof createOrgsApi>;
