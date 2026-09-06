import uniPluginImport from "@dcloudio/vite-plugin-uni";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv } from "vite";
import { validateApiBaseUrl } from "./build/api-base-url";

// DCloud 当前发布包是 CommonJS；在 Node ESM 下 default 可能被再包一层。
const uniPlugin =
  typeof uniPluginImport === "function"
    ? uniPluginImport
    : (uniPluginImport as unknown as { default: typeof uniPluginImport }).default;

export default defineConfig(({ mode }) => {
  const appRoot = fileURLToPath(new URL(".", import.meta.url));
  const env = loadEnv(mode, appRoot, "VITE_");
  const apiBaseUrl = validateApiBaseUrl(env.VITE_API_BASE_URL, mode);

  return {
    // 使用校验后的 Origin，避免运行时仍拿到带空格或末尾斜杠的原始环境变量。
    define: {
      "import.meta.env.VITE_API_BASE_URL": JSON.stringify(apiBaseUrl),
    },
    plugins: [uniPlugin()],
  };
});
