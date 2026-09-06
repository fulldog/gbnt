import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "vue/compiler-sfc";
import { privacyPolicy, userAgreement } from "@/content/legal";

type HtmlAst = NonNullable<NonNullable<ReturnType<typeof parse>["descriptor"]["template"]>["ast"]>;
type HtmlNode = HtmlAst["children"][number];
type HtmlElement = Extract<HtmlNode, { type: 1 }>;
interface ExpectedDocument {
  title: string;
  updatedAt: string;
  introduction: string;
  sections: { title: string; paragraphs: string[] }[];
}

function attribute(element: HtmlElement, name: string): string | undefined {
  const prop = element.props.find((item) => item.type === 6 && item.name === name);
  return prop?.type === 6 ? prop.value?.content : undefined;
}

function textContent(node: HtmlNode): string {
  if (node.type === 2) return node.content;
  if (node.type === 3) return "";
  if (node.type === 1) return node.children.map(textContent).join("");
  throw new Error("原型正文不是静态 HTML 文本，请人工核对提取规则");
}

function visibleText(node: HtmlNode): string {
  // 仅折叠 HTML 排版空白；不删标点、数字或正文字符，也不改写内容。
  return textContent(node).replace(/[\t\n\f\r ]+/g, " ").trim();
}

/** 用实际 HTML 解析器定位 article，避免正则漏段落或把壳层/脚本文案混入正文。 */
function parsePrototype(source: string, filename: string): ExpectedDocument {
  const { descriptor, errors } = parse(`<template>${source}</template>`, { filename });
  expect(errors).toEqual([]);
  const ast = descriptor.template?.ast;
  if (!ast) throw new Error("无法解析原型文档");
  const elements: HtmlElement[] = [];
  const visit = (children: HtmlNode[]): void => {
    for (const child of children) {
      if (child.type === 1) { elements.push(child); visit(child.children); }
    }
  };
  visit(ast.children);
  const articles = elements.filter((element) => element.tag === "article");
  expect(articles).toHaveLength(1);
  const shell = elements.find((element) => attribute(element, "id") === "app-viewport");
  const title = shell && attribute(shell, "data-mp-title");
  if (!title) throw new Error("原型缺少正式导航标题");

  const document: ExpectedDocument = { title, updatedAt: "", introduction: "", sections: [] };
  for (const child of articles[0]!.children) {
    if (child.type !== 1) {
      if (visibleText(child)) throw new Error("article 包含未归段正文，请人工核对");
      continue;
    }
    const text = visibleText(child);
    if (!text) throw new Error("article 存在空正文块，请人工核对");
    if (child.tag === "h2") {
      document.sections.push({ title: text, paragraphs: [] });
    } else if (child.tag === "p") {
      if ((attribute(child, "class") ?? "").split(/\s+/).includes("m-legal__meta")) {
        if (document.updatedAt || !text.startsWith("更新日期：")) throw new Error("原型更新日期结构异常");
        document.updatedAt = text.slice("更新日期：".length);
      } else if (document.sections.length) {
        document.sections[document.sections.length - 1]!.paragraphs.push(text);
      } else {
        if (document.introduction) throw new Error("原型出现多段导语，请先同步正式数据结构");
        document.introduction = text;
      }
    } else {
      throw new Error(`article 存在尚未覆盖的 ${child.tag} 正文块，请人工核对`);
    }
  }
  if (!document.updatedAt || !document.introduction || !document.sections.length ||
    document.sections.some((section) => !section.paragraphs.length)) {
    throw new Error("原型日期、导语或章节内容不完整");
  }
  return document;
}

const documents = [
  { filename: "agreement", title: "用户协议", sectionCount: 7, document: userAgreement },
  { filename: "privacy", title: "隐私政策", sectionCount: 8, document: privacyPolicy },
] as const;

describe("正式法律说明与只读原型全文一致", () => {
  it.each(documents)("$title 的日期、导语、全部标题和段落按原型顺序完整保留", ({ filename, title, sectionCount, document }) => {
    const path = fileURLToPath(new URL(`../../../prototypes/static-demo/miniapp/${filename}.html`, import.meta.url));
    const expected = parsePrototype(readFileSync(path, "utf8"), path);
    expect(expected.title).toBe(title);
    expect(expected.updatedAt).toBe("2026年8月20日");
    expect(expected.sections).toHaveLength(sectionCount);
    // 严格比较整份结构：删段、增段、顺序变化或任何措辞改动都会失败。
    expect(document).toStrictEqual(expected);
  });

  it.each(documents)("$title 保持既有分包路由和原生导航标题", ({ filename, title, document }) => {
    interface Page { path: string; style?: { navigationBarTitleText?: string } }
    const manifest = JSON.parse(readFileSync(new URL("../src/pages.json", import.meta.url), "utf8")) as {
      pages: Page[];
      subPackages: { root: string; pages: Page[] }[];
    };
    const routes = [
      ...manifest.pages,
      ...manifest.subPackages.flatMap((group) => group.pages.map((page) => ({ ...page, path: `${group.root}/${page.path}` }))),
    ];
    const matches = routes.filter((page) => page.path === `pages-sub/legal/${filename}`);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.style?.navigationBarTitleText).toBe(title);
    expect(matches[0]!.style?.navigationBarTitleText).toBe(document.title);
  });
});

describe("法律正文提取的完整性保护", () => {
  const example = (body: string) => `<div id="app-viewport" data-mp-title="测试协议"><p>壳层文字不属于协议</p>
    <article><p class="m-legal__meta">更新日期：2026年8月20日</p><p>完整导语。</p>${body}</article>
    <footer>页脚不属于协议</footer></div>`;

  it("保留章节内所有段落的顺序及行内文本，但不混入 article 外文案", () => {
    const actual = parsePrototype(example("<h2>一、第一节</h2><p>第一段<strong>重要内容</strong>。</p><p>第二段 &amp; 说明。</p><h2>二、第二节</h2><p>最后一段。</p>"), "legal-parser-fixture.html");
    expect(actual).toStrictEqual({
      title: "测试协议", updatedAt: "2026年8月20日", introduction: "完整导语。",
      sections: [
        { title: "一、第一节", paragraphs: ["第一段重要内容。", "第二段 & 说明。"] },
        { title: "二、第二节", paragraphs: ["最后一段。"] },
      ],
    });
  });

  it.each([
    "<h2>一、测试</h2><p>正文。</p><ul><li>不可漏掉的新增列表</li></ul>",
    "<h2>一、测试</h2><p>正文。</p>不可漏掉的游离正文",
  ])("遇到未支持的正文结构时失败，不静默忽略：%s", (body) => {
    expect(() => parsePrototype(example(body), "unhandled-legal-body.html")).toThrow(/未归段|尚未覆盖/);
  });
});
