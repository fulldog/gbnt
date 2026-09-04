import type {
  ApiTransport,
  HttpMethod,
  RequestHeaders,
  ResponseType,
  TransportRequest,
  TransportResponse,
} from "@gbnt/api-client";

export interface UniRequestSuccess {
  data: unknown;
  statusCode: number;
  header?: Record<string, unknown>;
}

export interface UniRequestFailure {
  errMsg?: string;
}

export interface UniRequestOptions {
  url: string;
  method: HttpMethod;
  data?: unknown;
  header?: RequestHeaders;
  timeout?: number;
  dataType?: "json" | "text";
  responseType?: "text" | "arraybuffer";
  success: (response: UniRequestSuccess) => void;
  fail: (error: UniRequestFailure) => void;
}

export type UniRequest = (options: UniRequestOptions) => unknown;

export interface UniRequestTransportOptions {
  request: UniRequest;
  timeoutMs?: number;
}

export function normalizeUniHeaders(
  headers: Record<string, unknown> | undefined,
): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (value === null || value === undefined) {
      continue;
    }
    normalized[key] = Array.isArray(value) ? value.join(", ") : String(value);
  }
  return normalized;
}

function uniResponseType(
  responseType: ResponseType | undefined,
): "text" | "arraybuffer" | undefined {
  if (responseType === "blob") {
    throw new Error("小程序请求不支持 blob 响应，请使用 uni.downloadFile");
  }
  if (responseType === "arraybuffer" || responseType === "text") {
    return responseType;
  }
  return undefined;
}

export function createUniRequestTransport(
  options: UniRequestTransportOptions,
): ApiTransport {
  return {
    request<TData, TBody>(
      request: TransportRequest<TBody>,
    ): Promise<TransportResponse<TData>> {
      return new Promise((resolve, reject) => {
        options.request({
          url: request.url,
          method: request.method,
          data: request.body as TBody,
          header: request.headers,
          timeout: request.timeoutMs ?? options.timeoutMs,
          dataType: request.responseType === "text" ? "text" : "json",
          responseType: uniResponseType(request.responseType),
          success: (response) => {
            resolve({
              status: Number(response.statusCode),
              data: response.data as TData,
              headers: normalizeUniHeaders(response.header),
            });
          },
          fail: (error) => {
            reject(new Error(error.errMsg || "uni.request 请求失败"));
          },
        });
      });
    },
  };
}
