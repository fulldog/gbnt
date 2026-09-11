import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import Components from "unplugin-vue-components/vite";
import { ElementPlusResolver } from "unplugin-vue-components/resolvers";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

const defaultProxyTarget = "https://nt.kfqzhsq.cn:8443";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const proxyTarget = env.VITE_API_PROXY_TARGET?.trim() || defaultProxyTarget;
  const proxyOptions = {
    target: proxyTarget,
    changeOrigin: true,
  };

  return {
    plugins: [
      vue(),
      tailwindcss(),
      Components({
        dts: false,
        resolvers: [ElementPlusResolver({ importStyle: false })],
      }),
    ],
    resolve: {
      alias: {
        "@": new URL("./src", import.meta.url).pathname,
      },
    },
    server: {
      proxy: {
        "/api": proxyOptions,
        "/uploads": proxyOptions,
      },
    },
    build: {
      // echarts、element-plus 单包压缩后本就超过默认 500kB，抬高阈值只影响提示
      chunkSizeWarningLimit: 2000,
      rolldownOptions: {
        output: {
          // 保证跨分包模块先初始化再使用，避免循环依赖中的运行时辅助函数尚未赋值。
          strictExecutionOrder: true,
        },
      },
    },
    test: {
      environment: "jsdom",
      setupFiles: ["./tests/setup.ts"],
      // 让表单依赖经过 Vite 转换，避免 Node 直接加载 async-validator 时默认导出不兼容。
      server: { deps: { inline: ["element-plus"] } },
    },
  };
});
