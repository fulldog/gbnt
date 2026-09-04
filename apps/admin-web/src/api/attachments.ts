import { createAttachmentsApi } from "@gbnt/api-client";
import type {
  ApiClient,
  UploadImagesInput,
  UploadImagesResult,
} from "@gbnt/api-client";

export type AdminUploadImagesInput = UploadImagesInput<Blob>;

function filenameOf(file: Blob, index: number): string {
  if ("name" in file && typeof file.name === "string" && file.name) {
    return file.name;
  }
  return `upload-${index + 1}`;
}

export function createAdminAttachmentsApi(client: ApiClient) {
  return createAttachmentsApi<Blob>((input) => {
    const formData = new FormData();
    input.files.forEach((file, index) => {
      formData.append("files", file, filenameOf(file, index));
    });

    if (input.watermark !== undefined) {
      formData.append("watermark", String(input.watermark));
    }
    if (input.lat !== undefined) {
      formData.append("lat", input.lat);
    }
    if (input.lng !== undefined) {
      formData.append("lng", input.lng);
    }
    if (input.address !== undefined) {
      formData.append("address", input.address);
    }

    return client.request<UploadImagesResult, FormData>(
      "/api/attachments/images",
      {
        method: "POST",
        body: formData,
      },
    );
  });
}

export type AdminAttachmentsApi = ReturnType<typeof createAdminAttachmentsApi>;
