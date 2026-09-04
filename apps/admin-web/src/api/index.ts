import { createAdminAttachmentsApi } from "./attachments";
import { createAuthApi } from "./auth";
import { createAdminApiClient } from "./client";
import type { AdminApiClientConfig } from "./client";
import { createHealthApi } from "./health";
import { createIssuesApi } from "./issues";
import { createLedgerApi } from "./ledger";
import { createOpLogsApi } from "./op-logs";
import { createOrgsApi } from "./orgs";
import { createRolesApi } from "./roles";
import { createUsersApi } from "./users";
import { createWorkbenchApi } from "./workbench";

export function createAdminApi(config: AdminApiClientConfig) {
  const client = createAdminApiClient(config);

  return {
    client,
    health: createHealthApi(client),
    auth: createAuthApi(client),
    attachments: createAdminAttachmentsApi(client),
    workbench: createWorkbenchApi(client),
    issues: createIssuesApi(client),
    ledger: createLedgerApi(client),
    orgs: createOrgsApi(client),
    users: createUsersApi(client),
    roles: createRolesApi(client),
    opLogs: createOpLogsApi(client),
  } as const;
}

export type AdminApi = ReturnType<typeof createAdminApi>;
export type * from "@gbnt/api-client";
export * from "./attachments";
export * from "./auth";
export * from "./client";
export * from "./health";
export * from "./issues";
export * from "./ledger";
export * from "./op-logs";
export * from "./orgs";
export * from "./roles";
export * from "./users";
export * from "./workbench";
export * from "./transport";
