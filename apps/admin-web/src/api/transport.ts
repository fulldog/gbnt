import axios from "axios";
import type { AxiosInstance } from "axios";
import type {
  ApiTransport,
  RequestHeaders,
  TransportRequest,
  TransportResponse,
} from "@gbnt/api-client";

export interface AxiosTransportOptions {
  instance?: AxiosInstance;
  timeoutMs?: number;
}

function normalizeHeaders(headers: Record<string, unknown>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === null || value === undefined) {
      continue;
    }
    normalized[key] = Array.isArray(value) ? value.join(", ") : String(value);
  }
  return normalized;
}

async function normalizeErrorData(
  data: unknown,
  status: number,
  headers: RequestHeaders,
): Promise<unknown> {
  const contentType = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === "content-type",
  )?.[1];

  if (
    status >= 400 &&
    typeof Blob !== "undefined" &&
    data instanceof Blob &&
    contentType?.includes("application/json")
  ) {
    try {
      return JSON.parse(await data.text()) as unknown;
    } catch {
      return data;
    }
  }
  return data;
}

export function createAxiosTransport(options: AxiosTransportOptions = {}): {
  instance: AxiosInstance;
  transport: ApiTransport;
} {
  const instance = options.instance ?? axios.create();

  const transport: ApiTransport = {
    async request<TData, TBody>(
      request: TransportRequest<TBody>,
    ): Promise<TransportResponse<TData>> {
      const response = await instance.request<TData>({
        url: request.url,
        method: request.method,
        headers: request.headers,
        data: request.body as TBody,
        responseType: request.responseType,
        timeout: request.timeoutMs ?? options.timeoutMs,
        validateStatus: () => true,
      });
      const headers = normalizeHeaders(response.headers as Record<string, unknown>);

      return {
        status: response.status,
        data: (await normalizeErrorData(
          response.data,
          response.status,
          headers,
        )) as TData,
        headers,
      };
    },
  };

  return { instance, transport };
}
