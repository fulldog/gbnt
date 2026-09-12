import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, vi } from "vitest";
import * as vue from "vue";
import * as apiClient from "@gbnt/api-client";
import { compileScript, parse } from "vue/compiler-sfc";
import ts from "typescript";

const scopes: ReturnType<typeof vue.effectScope>[] = [];
afterEach(() => { scopes.splice(0).forEach((scope) => scope.stop()); vi.unstubAllGlobals(); });

/** 编译并执行实际 SFC 的 setup，验证页面事件接线，不复制处理函数。 */
export function setupSfc(path: string, props: object, imports: Record<string, unknown>, emit = vi.fn()) {
  const filename = fileURLToPath(new URL(`../../src/${path}`, import.meta.url));
  const { descriptor } = parse(readFileSync(filename, "utf8"), { filename });
  const compiled = compileScript(descriptor, { id: path });
  const { outputText } = ts.transpileModule(compiled.content, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const module = { exports: {} as { default: { setup: (props: object, context: object) => Record<string, unknown> } } };
  const vueRuntime = {
    ...vue,
    // setupSfc 不创建组件实例，需补出 defineModel 编译后的 useModel 行为。
    useModel: (modelProps: Record<string, unknown>, name: string) => vue.computed({
      get: () => modelProps[name],
      set: (value) => emit(`update:${name}`, value),
    }),
  };
  const require = (name: string) => {
    if (name === "vue") return vueRuntime;
    if (name === "@gbnt/api-client") return apiClient;
    if (name in imports) return imports[name];
    throw new Error(`Unexpected component import: ${name}`);
  };
  new Function("require", "module", "exports", outputText)(require, module, module.exports);
  const scope = vue.effectScope();
  scopes.push(scope);
  return scope.run(() => module.exports.default.setup(props, { expose: () => {}, emit }))!;
}
