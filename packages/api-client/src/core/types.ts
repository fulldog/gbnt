export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type QueryPrimitive = string | number | boolean;
export type QueryValue = QueryPrimitive | readonly QueryPrimitive[] | null | undefined;
export type QueryParams = Readonly<Record<string, QueryValue>>;
export type ResponseType = "json" | "text" | "arraybuffer" | "blob";
export type RequestHeaders = Readonly<Record<string, string>>;

export interface ApiEnvelope<TData> {
  code: number;
  data: TData;
  message: string;
  cost_ms: number;
  trace_id: string;
}

export interface ApiRequestOptions<TBody = unknown> {
  method?: HttpMethod;
  query?: QueryParams;
  body?: TBody;
  headers?: RequestHeaders;
  auth?: boolean;
  responseType?: ResponseType;
  timeoutMs?: number;
}

export interface UnauthorizedContext {
  status: number;
  code: number | null;
  message: string;
  traceId: string | null;
}

export interface ApiLifecycleHooks {
  getAccessToken?: () => string | null | undefined;
  onTokenRenewed?: (token: string, expiresAt: string | null) => void;
  onUnauthorized?: (context: UnauthorizedContext) => void;
}

export interface TransportRequest<TBody = unknown> {
  url: string;
  method: HttpMethod;
  headers: RequestHeaders;
  body?: TBody;
  responseType?: ResponseType;
  timeoutMs?: number;
}

export interface TransportResponse<TData = unknown> {
  status: number;
  data: TData;
  headers: RequestHeaders;
}

export interface ApiTransport {
  request<TData = unknown, TBody = unknown>(
    request: TransportRequest<TBody>,
  ): Promise<TransportResponse<TData>>;
}

export interface ApiClientConfig extends ApiLifecycleHooks {
  /** API origin or proxy prefix. Use an empty string for a same-origin proxy. */
  baseUrl: string;
  transport: ApiTransport;
}

export interface DownloadResult<TBinary = unknown> {
  blob: TBinary;
  filename: string | null;
}

export interface ApiClient {
  request<TData, TBody = unknown>(
    path: string,
    options?: ApiRequestOptions<TBody>,
  ): Promise<TData>;
  raw<TData, TBody = unknown>(
    path: string,
    options?: ApiRequestOptions<TBody>,
  ): Promise<TransportResponse<TData>>;
}
