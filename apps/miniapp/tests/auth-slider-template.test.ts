import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "vue/compiler-sfc";

interface TemplateNode {
  type: number;
  tag?: string;
  props?: Array<{
    type: number;
    name?: string;
    value?: { content?: string };
  }>;
  children?: TemplateNode[];
}

function hasClass(node: TemplateNode, className: string): boolean {
  return node.props?.some((property) => property.type === 6
    && property.name === "class"
    && property.value?.content?.split(/\s+/).includes(className)) ?? false;
}

function findNode(
  node: TemplateNode,
  predicate: (candidate: TemplateNode) => boolean,
  parent?: TemplateNode,
): { node: TemplateNode; parent?: TemplateNode } | null {
  if (predicate(node)) return { node, parent };
  for (const child of node.children ?? []) {
    const match = findNode(child, predicate, node);
    if (match) return match;
  }
  return null;
}

describe("安全验证视图层反馈", () => {
  it("拖动轨迹常驻在 movable-view 内，不等待逻辑层切换状态后再创建", () => {
    const filename = new URL("../src/components/auth/AuthSlider.vue", import.meta.url);
    const { descriptor, errors } = parse(readFileSync(filename, "utf8"), { filename: filename.pathname });
    expect(errors).toEqual([]);

    const root = descriptor.template?.ast as unknown as TemplateNode;
    const match = findNode(root, (node) => hasClass(node, "auth-slider__trail"));

    expect(match?.parent?.tag).toBe("movable-view");
    expect(match?.node.props?.some((property) => property.type === 7 && property.name === "if")).toBe(false);

    const areaRule = descriptor.styles[0]?.content.match(/\.auth-slider__area\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(areaRule).toContain("left: 3px;");
    expect(areaRule).toContain("width: calc(100% - 6px);");

    const trailRule = descriptor.styles[0]?.content.match(/\.auth-slider__trail\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(trailRule).toContain("right: 48px;");

    const startMaskRule = descriptor.styles[0]?.content.match(/\.auth-slider__track::after\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(startMaskRule).toContain("width: 3px;");
    expect(startMaskRule).toContain("background: inherit;");
  });
});
