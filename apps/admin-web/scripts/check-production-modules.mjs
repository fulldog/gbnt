import { spawn } from "node:child_process";
import { availableParallelism } from "node:os";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

// 直接检查已生成的 ESM，不启动 Vite、不转换源码、不重新构建或改写产物。
// 入口挂载、真实路由和接口联调另由浏览器验收；每个非入口 chunk 冷启动独立进程。
const scriptDir = dirname(fileURLToPath(import.meta.url));
const timeoutMs = 10_000;
const successMarker = "GBNT_PRODUCTION_MODULE_INITIALIZED";
const workerPath = resolve(scriptDir, "production-module-worker.mjs");

async function listModules(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const modules = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) modules.push(...await listModules(path));
    else if (entry.isFile() && /\.(?:m?js)$/.test(entry.name)) modules.push(path);
  }
  return modules.sort();
}

async function entryModules(distDir) {
  const html = await readFile(resolve(distDir, "index.html"), "utf8").catch((error) => {
    if (error.code === "ENOENT") throw new Error(`未找到 ${resolve(distDir, "index.html")}，请先构建管理后台`);
    throw error;
  });
  const dom = new JSDOM(html, { url: "https://gbnt-build.invalid/" });
  try {
    const scripts = [...dom.window.document.querySelectorAll('script[type="module"][src]')];
    if (!scripts.length) throw new Error("index.html 中没有生产 ESM 入口，请先构建管理后台");
    const entries = new Set();
    for (const script of scripts) {
      const url = new URL(script.getAttribute("src"), dom.window.location.href);
      if (url.origin !== dom.window.location.origin) throw new Error("生产入口必须是 dist 中的本地文件，不能检查远程脚本");
      const path = resolve(distDir, `.${decodeURIComponent(url.pathname)}`);
      const relativePath = relative(distDir, path);
      if (relativePath.startsWith("..") || isAbsolute(relativePath) || !/\.(?:m?js)$/.test(path)) {
        throw new Error(`生产入口路径不合法：${url.pathname}`);
      }
      if (!(await stat(path)).isFile()) throw new Error(`生产入口不存在：${relativePath}`);
      entries.add(path);
    }
    return entries;
  } finally {
    dom.window.close();
  }
}

function checkModule(path, distDir) {
  return new Promise((resolveResult) => {
    const child = spawn(process.execPath, [workerPath, path], {
      // 不继承额外 loader/preload，防止开发转换或缓存掩盖真实产物错误。
      env: { ...process.env, NODE_OPTIONS: "" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    let timedOut = false;
    let settled = false;
    const capture = (chunk) => { output = `${output}${chunk}`.slice(-24_000); };
    child.stdout.on("data", capture);
    child.stderr.on("data", capture);
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, timeoutMs);
    const finish = (failure) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveResult(failure);
    };
    child.once("error", (error) => finish(`${relative(distDir, path)}：无法启动检查进程\n${error.message}`));
    child.once("close", (code, signal) => {
      if (timedOut) finish(`${relative(distDir, path)}：初始化超过 ${timeoutMs}ms，已终止`);
      else if (code !== 0) finish(`${relative(distDir, path)}：初始化失败（退出 ${code ?? signal}）\n${output.trim()}`);
      else if (!output.includes(successMarker)) finish(`${relative(distDir, path)}：进程提前退出，未确认模块初始化完成`);
      else finish(null);
    });
  });
}

async function main() {
  if (process.argv.length > 3) throw new Error("用法：node scripts/check-production-modules.mjs [dist 目录]");
  const distDir = process.argv[2] ? resolve(process.argv[2]) : resolve(scriptDir, "../dist");
  const entries = await entryModules(distDir);
  const modules = (await listModules(distDir)).filter((path) => !entries.has(path));
  if (!modules.length) throw new Error("没有可检查的非入口 JS chunks；请先构建，单文件入口需要单独的浏览器冒烟");
  console.log(`生产 ESM 初始化检查：${modules.length} 个非入口 chunks，每个独立进程，禁用网络。`);
  const failures = [];
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(4, availableParallelism(), modules.length) }, async () => {
    while (nextIndex < modules.length) {
      const path = modules[nextIndex++];
      const failure = await checkModule(path, distDir);
      if (failure) failures.push(failure);
    }
  }));
  if (failures.length) throw new Error(`${failures.length}/${modules.length} 个生产 chunks 初始化失败：\n${failures.join("\n\n")}`);
  console.log(`通过：${modules.length}/${modules.length} 个生产 chunks 原生 ESM 初始化成功。`);
  console.log("边界：只验证模块导入及立即调度任务，不主动调用导出的初始化函数，不直接执行 HTML 挂载入口；页面渲染与真实接口仍须浏览器生产预览验收。");
}

main().catch((error) => {
  console.error(`生产 ESM 检查失败：${error.message}`);
  process.exitCode = 1;
});
