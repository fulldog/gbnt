import { createMiniappAttachmentsApi } from "./attachments";
import type { UniUploadFile } from "./attachments";
import { createAuthApi } from "./auth";
import { createMiniappApiClient } from "./client";
import type { MiniappApiClientConfig } from "./client";
import { createIssuesApi } from "./issues";
import { createMineApi } from "./mine";
import { createRegionsApi } from "./regions";
import { createTodosApi } from "./todos";

export interface MiniappApiConfig extends MiniappApiClientConfig {
  uploadFile: UniUploadFile;
}

export function createMiniappApi(config: MiniappApiConfig) {
  const { uploadFile, ...clientConfig } = config;
  const client = createMiniappApiClient(clientConfig);

  return {
    client,
    auth: createAuthApi(client),
    attachments: createMiniappAttachmentsApi({
      baseUrl: config.baseUrl,
      uploadFile,
      timeoutMs: config.timeoutMs,
      getAccessToken: config.getAccessToken,
      onTokenRenewed: config.onTokenRenewed,
      onUnauthorized: config.onUnauthorized,
    }),
    todos: createTodosApi(client),
    regions: createRegionsApi(client),
    issues: createIssuesApi(client),
    mine: createMineApi(client),
  } as const;
}

export type MiniappApi = ReturnType<typeof createMiniappApi>;
export * from "@gbnt/api-client";
export * from "./attachments";
export * from "./auth";
export * from "./client";
export * from "./issues";
export * from "./mine";
export * from "./regions";
export * from "./todos";
export * from "./transport";
