import { createApiClient } from "@gbnt/api-client";
import type { ApiClientConfig } from "@gbnt/api-client";
import type { AxiosInstance } from "axios";
import { createAxiosTransport } from "./transport";

export interface AdminApiClientConfig extends Omit<ApiClientConfig, "transport"> {
  axiosInstance?: AxiosInstance;
  timeoutMs?: number;
}

export function createAdminApiClient(config: AdminApiClientConfig) {
  const { axiosInstance, timeoutMs, ...apiConfig } = config;
  const { transport } = createAxiosTransport({
    instance: axiosInstance,
    timeoutMs,
  });
  return createApiClient({ ...apiConfig, transport });
}
