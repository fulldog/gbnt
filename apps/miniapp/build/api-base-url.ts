import { URL } from "node:url";

/** 判断归一化后的主机是否指向本机或未指定地址，防止调试产物被当作正式联调包。 */
function isLocalOnlyHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.+$/, "");
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  // WHATWG URL 已把短写、十六进制和整数 IPv4 归一为点分十进制。
  if (/^127(?:\.\d{1,3}){3}$/.test(host) || host === "0.0.0.0") return true;

  const ipv6 = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : "";
  if (ipv6 === "::" || ipv6 === "::1") return true;
  // URL 会把 ::ffff:127.0.0.1 转成 ::ffff:7f00:1，同时覆盖旧式 IPv4 兼容表示。
  const embeddedIPv4 = /^::(?:ffff:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(ipv6);
  if (!embeddedIPv4) return false;
  const high = Number.parseInt(embeddedIPv4[1]!, 16);
  const low = Number.parseInt(embeddedIPv4[2]!, 16);
  return (high >>> 8) === 127 || (high === 0 && low === 0);
}

/** 校验构建时注入的小程序 API 地址，只返回 Origin；错误信息不回显原始配置。 */
export function validateApiBaseUrl(value: string | undefined, mode: string): string {
  const rawValue = value?.trim() ?? "";
  if (!rawValue) {
    throw new Error(
      "缺少 VITE_API_BASE_URL：请在 apps/miniapp/.env.local 中配置完整 API Origin。",
    );
  }

  let url: URL;
  try {
    url = new URL(rawValue);
  } catch {
    throw new Error("VITE_API_BASE_URL 必须是有效的 http(s) Origin。");
  }

  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "VITE_API_BASE_URL 只能包含 http(s) 协议、主机和端口，不能包含路径、凭据、查询或片段。",
    );
  }

  const hostname = url.hostname.replace(/\.+$/, "");
  if (
    hostname === "example.com" ||
    hostname.endsWith(".example.com") ||
    hostname.endsWith(".invalid")
  ) {
    throw new Error("VITE_API_BASE_URL 仍是示例占位地址，请改为真实环境地址。");
  }
  if (mode === "production") {
    if (url.protocol !== "https:") {
      throw new Error("生产构建的 VITE_API_BASE_URL 必须使用 HTTPS。");
    }
    if (isLocalOnlyHost(url.hostname)) {
      throw new Error("生产构建的 VITE_API_BASE_URL 不能使用本机回环或未指定地址，请配置真实环境域名。");
    }
  }

  return url.origin;
}
