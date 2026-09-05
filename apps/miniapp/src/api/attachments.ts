import {
  createAttachmentsApi,
  handleApiResponse,
} from "@gbnt/api-client";
import type {
  ApiLifecycleHooks,
  RequestHeaders,
  TransportResponse,
  UploadImagesInput,
  UploadImagesResult,
} from "@gbnt/api-client";
import { normalizeUniHeaders } from "./transport";

export interface MiniappUploadFile {
  filePath: string;
  fileType?: "image" | "video" | "audio";
}

export interface UniUploadFileSuccess {
  data: string;
  statusCode: number | string;
  header?: Record<string, unknown>;
}

export interface UniUploadFileFailure {
  errMsg?: string;
}

export interface UniUploadFileOptions {
  url: string;
  filePath: string;
  name: string;
  fileType?: "image" | "video" | "audio";
  header?: RequestHeaders;
  formData?: Record<string, string>;
  timeout?: number;
  success: (response: UniUploadFileSuccess) => void;
  fail: (error: UniUploadFileFailure) => void;
}

export type UniUploadFile = (options: UniUploadFileOptions) => unknown;
export type MiniappUploadImagesInput = UploadImagesInput<MiniappUploadFile>;

export interface MiniappAttachmentsConfig extends ApiLifecycleHooks {
  baseUrl: string;
  uploadFile: UniUploadFile;
  timeoutMs?: number;
}

function endpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/api/attachments/images`;
}

function createHeaders(config: MiniappAttachmentsConfig): Record<string, string> {
  const token = config.getAccessToken?.();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function createFormData(
  input: MiniappUploadImagesInput,
): Record<string, string> {
  const formData: Record<string, string> = {};
  if (input.watermark !== undefined) {
    formData.watermark = String(input.watermark);
  }
  if (input.lat !== undefined) {
    formData.lat = input.lat;
  }
  if (input.lng !== undefined) {
    formData.lng = input.lng;
  }
  if (input.address !== undefined) {
    formData.address = input.address;
  }
  return formData;
}

function parseEnvelope(data: string): unknown {
  try {
    return JSON.parse(data) as unknown;
  } catch (cause) {
    throw new Error("上传接口响应不是有效的 JSON", { cause });
  }
}

function uploadOne(
  config: MiniappAttachmentsConfig,
  file: MiniappUploadFile,
  input: MiniappUploadImagesInput,
): Promise<UploadImagesResult> {
  return new Promise((resolve, reject) => {
    config.uploadFile({
      url: endpoint(config.baseUrl),
      filePath: file.filePath,
      fileType: file.fileType,
      name: "files",
      header: createHeaders(config),
      formData: createFormData(input),
      timeout: config.timeoutMs,
      success: (result) => {
        try {
          const response: TransportResponse<unknown> = {
            status: Number(result.statusCode),
            data: parseEnvelope(result.data),
            headers: normalizeUniHeaders(result.header),
          };
          const data = handleApiResponse<UploadImagesResult>(response, config);
          if (!data || !Array.isArray(data.list) || data.list.length !== 1 ||
              !data.list[0] || typeof data.list[0].file_id !== "string" || !data.list[0].file_id.trim() ||
              typeof data.list[0].url !== "string" || !data.list[0].url.trim()) {
            throw new Error("照片上传结果异常，请重试");
          }
          resolve(data);
        } catch (error) {
          reject(error);
        }
      },
      fail: (error) => {
        reject(new Error(error.errMsg || "uni.uploadFile 上传失败"));
      },
    });
  });
}

export function createMiniappAttachmentsApi(config: MiniappAttachmentsConfig) {
  return createAttachmentsApi<MiniappUploadFile>(async (input) => {
    const list: UploadImagesResult["list"] = [];
    for (const file of input.files) {
      const result = await uploadOne(config, file, input);
      list.push(...result.list);
    }
    return { list };
  });
}

export type MiniappAttachmentsApi = ReturnType<typeof createMiniappAttachmentsApi>;
