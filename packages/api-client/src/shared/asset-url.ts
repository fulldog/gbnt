interface HttpAddress {
  protocol: "http" | "https";
  host: string;
  port: string;
  origin: string;
  suffix: string;
}

// 使用字符串解析，不依赖浏览器 URL/DOM，微信小程序也可直接复用。
function httpAddress(value: string): HttpAddress | null {
  const match = /^(https?):\/\/(\[[^\]\s]+\]|[^/:?#\s\\@]+)(?::(\d+))?([/?#][\s\S]*)?$/i.exec(value);
  if (!match) return null;
  const protocol = match[1]!.toLowerCase() as HttpAddress["protocol"];
  const host = match[2]!.toLowerCase().replace(/\.+$/, "");
  const rawPort = match[3] ?? "";
  const port = rawPort === (protocol === "https" ? "443" : "80") ? "" : rawPort;
  return {
    protocol, host, port,
    origin: `${protocol}://${host}${port ? `:${port}` : ""}`,
    suffix: match[4] ?? "",
  };
}

/**
 * 补全附件地址，并将当前 HTTPS 服务同主机的历史 HTTP 地址升级。
 * 外域地址及 data/blob/wxfile/file 等本地资源保持原样；不改写图片签名参数。
 * pageOrigin 由浏览器应用注入；共享层不读取 window，也不硬编码服务域名。
 */
export function resolveAssetUrl(
  path: string | null | undefined,
  baseUrl = "",
  pageOrigin = "",
): string {
  let value = path?.trim() ?? "";
  if (!value) return "";
  const base = baseUrl.trim().replace(/\/+$/, "");
  const context = httpAddress(base || pageOrigin.trim());

  // 小程序没有页面协议，协议相对地址需显式补齐；未知上下文保守使用 HTTPS。
  if (value.startsWith("//")) value = `${context?.protocol ?? "https"}:${value}`;

  if (/^https?:\/\//i.test(value)) {
    const address = httpAddress(value);
    if (address?.protocol === "http" && context?.protocol === "https" &&
      address.host === context.host && address.port === context.port) {
      return `${context.origin}${address.suffix}`;
    }
    return value;
  }
  // 包含微信 http://tmp/... 的绝对资源已在上面保留；这些协议也不得拼接 API 前缀。
  if (/^[a-z][a-z\d+.-]*:/i.test(value)) return value;
  return `${base}${value.startsWith("/") ? value : `/${value}`}`;
}
