import type {
  ApiClient,
  ApiClientConfig,
  ApiEnvelope,
  ApiLifecycleHooks,
  ApiRequestOptions,
  QueryParams,
  QueryPrimitive,
  TransportRequest,
  TransportResponse,
  UnauthorizedContext,
} from "./types";

interface ApiErrorOptions {
  status: number;
  code?: number | null;
  traceId?: string | null;
  cause?: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: number | null;
  readonly traceId: string | null;

  constructor(message: string, options: ApiErrorOptions) {
    super(message, { cause: options.cause });
    this.name = "ApiError";
    this.status = options.status;
    this.code = options.code ?? null;
    this.traceId = options.traceId ?? null;
  }
}

function encodeQueryValue(key: string, value: QueryPrimitive): string {
  return `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`;
}

function buildUrl(baseUrl: string, path: string, query?: QueryParams): string {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const parts: string[] = [];

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === null || value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => parts.push(encodeQueryValue(key, item)));
      continue;
    }

    parts.push(encodeQueryValue(key, value as QueryPrimitive));
  }

  return `${normalizedBaseUrl}${normalizedPath}${parts.length ? `?${parts.join("&")}` : ""}`;
}

export function getResponseHeader(
  headers: Readonly<Record<string, string>>,
  name: string,
): string | null {
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted) {
      return value;
    }
  }
  return null;
}

function isEnvelope(value: unknown): value is ApiEnvelope<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    typeof value.code === "number" &&
    "message" in value &&
    typeof value.message === "string"
  );
}

function notifyTokenRenewal(
  response: TransportResponse<unknown>,
  hooks: ApiLifecycleHooks,
): void {
  const token = getResponseHeader(response.headers, "X-New-Token");
  if (token) {
    hooks.onTokenRenewed?.(
      token,
      getResponseHeader(response.headers, "X-Token-Expires-At"),
    );
  }
}

function notifyIfUnauthorized(error: ApiError, hooks: ApiLifecycleHooks): void {
  if (error.status !== 401 && error.code !== 401) {
    return;
  }

  const context: UnauthorizedContext = {
    status: error.status,
    code: error.code,
    message: error.message,
    traceId: error.traceId,
  };
  hooks.onUnauthorized?.(context);
}

/** 网关和未匹配路由可能没有 JSON 信封，按 HTTP 状态提供可诊断的消息。 */
function httpErrorMessage(status: number): string {
  switch (status) {
    case 401: return "未登录或凭证无效";
    case 403: return "无权限访问该接口";
    case 404: return "接口不存在，请检查请求路径或后端版本";
    case 502: return "服务网关异常，请稍后重试";
    case 503: return "服务暂不可用，请稍后重试";
    case 504: return "服务响应超时，请稍后重试";
    default: return `HTTP ${status}`;
  }
}

function responseTraceId(response: TransportResponse<unknown>): string | null {
  const traceId = isEnvelope(response.data) ? response.data.trace_id : null;
  return typeof traceId === "string" && traceId
    ? traceId
    : getResponseHeader(response.headers, "X-Request-Id");
}

function errorFromResponse(response: TransportResponse<unknown>): ApiError {
  const envelope = isEnvelope(response.data) ? response.data : null;
  return new ApiError(envelope?.message || httpErrorMessage(response.status), {
    status: response.status,
    code: envelope?.code,
    traceId: responseTraceId(response),
  });
}

export function handleRawResponse<TData>(
  response: TransportResponse<TData>,
  hooks: ApiLifecycleHooks = {},
): TransportResponse<TData> {
  notifyTokenRenewal(response, hooks);
  if (response.status >= 200 && response.status < 300) {
    return response;
  }

  const error = errorFromResponse(response);
  notifyIfUnauthorized(error, hooks);
  throw error;
}

export function handleApiResponse<TData>(
  response: TransportResponse<unknown>,
  hooks: ApiLifecycleHooks = {},
): TData {
  notifyTokenRenewal(response, hooks);

  // 先识别 HTTP 失败；404 文本或 502 HTML 不应被误报为成功响应的格式错误。
  if (response.status < 200 || response.status >= 300) {
    const error = errorFromResponse(response);
    notifyIfUnauthorized(error, hooks);
    throw error;
  }

  if (!isEnvelope(response.data)) {
    throw new ApiError("服务端响应不符合统一接口格式", {
      status: response.status,
      traceId: responseTraceId(response),
    });
  }

  if (response.data.code !== 0) {
    const error = errorFromResponse(response);
    notifyIfUnauthorized(error, hooks);
    throw error;
  }

  return response.data.data as TData;
}

function createHeaders<TBody>(
  config: ApiClientConfig,
  options: ApiRequestOptions<TBody>,
): Record<string, string> {
  const headers = { ...options.headers };
  const accessToken = options.auth === false ? null : config.getAccessToken?.();

  if (accessToken && !Object.keys(headers).some((key) => key.toLowerCase() === "authorization")) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  return headers;
}

export function createApiClient(config: ApiClientConfig): ApiClient {
  async function perform<TData, TBody>(
    path: string,
    options: ApiRequestOptions<TBody>,
  ): Promise<TransportResponse<TData>> {
    const request: TransportRequest<TBody> = {
      url: buildUrl(config.baseUrl, path, options.query),
      method: options.method ?? "GET",
      headers: createHeaders(config, options),
      body: options.body,
      responseType: options.responseType,
      timeoutMs: options.timeoutMs,
    };

    try {
      return await config.transport.request<TData, TBody>(request);
    } catch (cause) {
      if (cause instanceof ApiError) {
        throw cause;
      }
      throw new ApiError("网络请求失败", { status: 0, cause });
    }
  }

  async function request<TData, TBody = unknown>(
    path: string,
    options: ApiRequestOptions<TBody> = {},
  ): Promise<TData> {
    const response = await perform<unknown, TBody>(path, options);
    return handleApiResponse<TData>(response, config);
  }

  async function raw<TData, TBody = unknown>(
    path: string,
    options: ApiRequestOptions<TBody> = {},
  ): Promise<TransportResponse<TData>> {
    const response = await perform<TData, TBody>(path, options);
    return handleRawResponse(response, config);
  }

  return { request, raw };
}
