import http from "node:http";
import https from "node:https";
import net from "node:net";
import http2 from "node:http2";
import { pathToFileURL } from "node:url";
import { JSDOM, VirtualConsole } from "jsdom";

// 此 worker 仅供父检查器使用，原生 import 的错误必须传回非零退出码。
const modulePath = process.argv[2];
if (!modulePath) throw new Error("缺少待检查的生产 JS 路径");
const failures = [];
const networkAttempts = new Set();
const describe = (error) => error?.stack || String(error);
const recordFailure = (error) => failures.push(describe(error));
function denyNetwork(channel) {
  return () => {
    networkAttempts.add(channel);
    throw new Error(`生产模块初始化检查禁止网络：${channel}`);
  };
}

// 即使被检查代码意外进入 Node adapter，也不能访问真实服务。
http.request = http.get = denyNetwork("node:http");
https.request = https.get = denyNetwork("node:https");
http2.connect = denyNetwork("node:http2");
net.connect = net.createConnection = net.Socket.prototype.connect = denyNetwork("node:net");

const virtualConsole = new VirtualConsole();
virtualConsole.on("jsdomError", recordFailure);
const dom = new JSDOM("<!doctype html><html><head></head><body><div id='app'></div></body></html>", {
  url: "https://gbnt-build.invalid/login",
  pretendToBeVisual: true,
  // 不设置 resources/runScripts：jsdom 默认不加载任何子资源，不执行 HTML 脚本。
  virtualConsole,
});
const { window } = dom;

for (const name of [
  "window", "document", "navigator", "location", "history", "localStorage", "sessionStorage",
  "Element", "HTMLElement", "SVGElement", "Node", "Document", "DocumentFragment", "ShadowRoot",
  "Event", "CustomEvent", "MouseEvent", "KeyboardEvent", "MutationObserver", "DOMParser", "DOMException",
  "HTMLInputElement", "HTMLTextAreaElement", "HTMLSelectElement", "HTMLFormElement", "HTMLDivElement",
  "File", "FileReader", "Blob", "FormData",
]) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: window[name] });
}
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

// 浏览器 transport 的存在性检测仍能完成，但任何实际请求都被明确拦截并使检查失败。
class NoNetworkXHR {
  open = denyNetwork("XMLHttpRequest.open");
  send = denyNetwork("XMLHttpRequest.send");
}
window.XMLHttpRequest = globalThis.XMLHttpRequest = NoNetworkXHR;
window.fetch = globalThis.fetch = async () => denyNetwork("fetch")();
for (const name of ["WebSocket", "EventSource", "Worker", "SharedWorker"]) {
  const blocked = function () { return denyNetwork(name)(); };
  window[name] = globalThis[name] = blocked;
}
window.navigator.sendBeacon = denyNetwork("sendBeacon");
window.addEventListener("error", (event) => recordFailure(event.error ?? event.message));
window.addEventListener("unhandledrejection", (event) => recordFailure(event.reason));
process.on("unhandledRejection", recordFailure);
process.on("uncaughtException", recordFailure);

try {
  // 不使用 Vitest、Vite SSR、动态源码替换或 data URL，保留 chunk 间原始 import 与求值顺序。
  await import(pathToFileURL(modulePath).href);
  await new Promise((resolve) => setTimeout(resolve, 20));
} catch (error) {
  recordFailure(error);
} finally {
  window.close();
}
if (networkAttempts.size) failures.push(`检测到不应发生的网络初始化：${[...networkAttempts].join(", ")}`);
if (failures.length) console.error([...new Set(failures)].join("\n"));
else console.log("GBNT_PRODUCTION_MODULE_INITIALIZED");
// 只保证模块初始化及其立即调度任务；页面长期异步行为由真实浏览器测试负责。
process.exit(failures.length ? 1 : 0);
