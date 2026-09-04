import type { FileItem } from "../types";

export interface UploadImagesInput<TFile> {
  files: readonly TFile[];
  watermark?: boolean;
  lat?: string;
  lng?: string;
  address?: string;
}

export interface UploadImagesResult {
  list: FileItem[];
}

export type UploadImagesHandler<TFile> = (
  input: UploadImagesInput<TFile>,
) => Promise<UploadImagesResult>;

export function createAttachmentsApi<TFile>(uploadImages: UploadImagesHandler<TFile>) {
  return {
    uploadImages(input: UploadImagesInput<TFile>): Promise<UploadImagesResult> {
      if (input.files.length === 0) {
        return Promise.reject(new Error("请至少选择一个上传文件"));
      }
      return uploadImages(input);
    },
  } as const;
}

export type AttachmentsApi<TFile> = ReturnType<typeof createAttachmentsApi<TFile>>;
