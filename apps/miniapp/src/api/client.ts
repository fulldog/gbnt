import { createApiClient } from "@gbnt/api-client";
import type { ApiClientConfig } from "@gbnt/api-client";
import { createUniRequestTransport } from "./transport";
import type { UniRequest } from "./transport";

export interface MiniappApiClientConfig extends Omit<ApiClientConfig, "transport"> {
  request: UniRequest;
  timeoutMs?: number;
}

export function createMiniappApiClient(config: MiniappApiClientConfig) {
  const { request, timeoutMs, ...apiConfig } = config;
  const transport = createUniRequestTransport({ request, timeoutMs });
  return createApiClient({ ...apiConfig, transport });
}
