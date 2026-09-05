import uniPluginImport from "@dcloudio/vite-plugin-uni";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv } from "vite";

// DCloud 当前发布包是 CommonJS；在 Node ESM 下 default 可能被再包一层。
const uniPlugin =
  typeof uniPluginImport === "function"
    ? uniPluginImport
    : (uniPluginImport as unknown as { default: typeof uniPluginImport }).default;

function validateApiBaseUrl(value: string | undefined, mode: string): string {
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

  if (
    url.hostname === "example.com" ||
    url.hostname.endsWith(".example.com") ||
    url.hostname.endsWith(".invalid")
  ) {
    throw new Error("VITE_API_BASE_URL 仍是示例占位地址，请改为真实环境地址。");
  }
  if (mode === "production" && url.protocol !== "https:") {
    throw new Error("生产构建的 VITE_API_BASE_URL 必须使用 HTTPS。");
  }

  return url.origin;
}

export default defineConfig(({ mode }) => {
  const appRoot = fileURLToPath(new URL(".", import.meta.url));
  const env = loadEnv(mode, appRoot, "VITE_");
  validateApiBaseUrl(env.VITE_API_BASE_URL, mode);

  return {
    plugins: [uniPlugin()],
  };
});
