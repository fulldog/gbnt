import { resolveAssetUrl as resolveSharedAssetUrl } from "@gbnt/api-client";

export function resolveAssetUrl(url: string | null | undefined): string {
  const baseUrl = import.meta.env.VITE_API_BASE_URL?.trim() ?? "";
  const pageOrigin = typeof window === "undefined" ? "" : window.location.origin;
  return resolveSharedAssetUrl(url, baseUrl, pageOrigin);
}
