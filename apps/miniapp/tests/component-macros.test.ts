import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { babelParse, compileScript, parse, registerTS, version } from "vue/compiler-sfc";

const miniappRequire = createRequire(import.meta.url);
registerTS(() => miniappRequire("typescript"));
const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));
const macros = new Set(["defineProps", "withDefaults", "defineEmits", "defineExpose", "defineModel", "defineOptions", "defineSlots"]);

function vueFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? vueFiles(path) : entry.name.endsWith(".vue") ? [path] : [];
  });
}

function node(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function walk(value: unknown, visit: (item: Record<string, unknown>) => void): void {
  if (Array.isArray(value)) { value.forEach((item) => walk(item, visit)); return; }
  const item = node(value);
  if (!Object.keys(item).length) return;
  visit(item);
  Object.values(item).forEach((child) => walk(child, visit));
}

function propertyName(value: unknown): string {
  const key = node(value);
  return String(key.name ?? key.value ?? "");
}

function objectKeys(value: unknown): string[] {
  const expression = node(value);
  if (expression.type === "CallExpression" && Array.isArray(expression.arguments)) {
    // defineModel 使用编译器 mergeModels 合并普通 props 与 modelValue。
    return expression.arguments.flatMap(objectKeys);
  }
  return Array.isArray(expression.properties)
    ? expression.properties.map((property) => propertyName(node(property).key)).filter(Boolean) : [];
}

/** 编译实际 SFC 后检查输出 AST，不以源码字符串是否包含宏名称代替编译验收。 */
function compileAndInspect(source: string, filename: string) {
  const { descriptor, errors } = parse(source, { filename });
  expect(errors).toEqual([]);
  if (!descriptor.script && !descriptor.scriptSetup) return { remaining: [], props: [] };
  const compiled = compileScript(descriptor, {
    id: filename,
    fs: { fileExists: existsSync, readFile: (path) => readFileSync(path, "utf8") },
  });
  const ast = babelParse(compiled.content, { sourceType: "module", plugins: ["typescript"] });
  const remaining: string[] = [];
  walk(ast, (item) => {
    const callee = node(item.callee);
    if (item.type === "CallExpression" && callee.type === "Identifier" && macros.has(String(callee.name))) {
      remaining.push(String(callee.name));
    }
  });
  const exported = node(ast.program.body.find((item) => item.type === "ExportDefaultDeclaration"));
  const declaration = node(exported.declaration);
  const component = declaration.type === "CallExpression" && Array.isArray(declaration.arguments)
    ? node(declaration.arguments[0]) : declaration;
  const property = Array.isArray(component.properties)
    ? component.properties.find((item) => propertyName(node(item).key) === "props") : undefined;
  return { remaining, props: objectKeys(node(property).value) };
}

const files = vueFiles(sourceRoot);
const expectedProps: Record<string, string[]> = {
  "components/auth/AuthSlider.vue": ["disabled"],
  "components/media/PhotoPicker.vue": ["maximum", "cameraOnly", "cooldownSeconds", "watermark", "location", "modelValue"],
  "components/report/QuizCard.vue": ["item", "definition", "issueType", "location", "disabled"],
  "components/report/IssueTypeFields.vue": ["type", "details"],
  "components/report/FacilityTypeTabs.vue": ["value", "disabled"],
  "components/region/RegionPicker.vue": ["tree", "value", "label", "mode", "loading", "error", "disabled"],
};

describe("小程序组件编译宏", () => {
  it("使用当前小程序 Vue 3.4 编译器且发现真实 SFC", () => {
    expect(version).toBe("3.4.21");
    expect(files.length).toBeGreaterThan(0);
    for (const path of Object.keys(expectedProps)) expect(files).toContain(join(sourceRoot, path));
  });

  it.each(files.map((file) => [relative(sourceRoot, file), file]))("%s 不残留运行时宏调用，并生成所需 props", (name, file) => {
    const result = compileAndInspect(readFileSync(file, "utf8"), file);
    expect(result.remaining).toEqual([]);
    if (expectedProps[name]) expect(result.props).toEqual(expect.arrayContaining(expectedProps[name]!));
  });

  it("负例确实能识别嵌套宏泄漏和缺失 props，而非假通过", () => {
    const result = compileAndInspect(`<script setup lang="ts">
      import { toRefs } from "vue";
      const { disabled } = toRefs(withDefaults(defineProps<{ disabled?: boolean }>(), { disabled: false }));
    </script>`, join(sourceRoot, "NestedMacroRegression.vue"));
    expect(result.remaining).toEqual(expect.arrayContaining(["withDefaults", "defineProps"]));
    expect(result.props).not.toContain("disabled");
  });
});
