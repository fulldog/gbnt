import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { computed, reactive, shallowRef } from "vue";
import { babelParse, parse } from "vue/compiler-sfc";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IssueType } from "@gbnt/api-client";
import { useFacilityTypeSelection } from "@/composables/report/useFacilityTypeSelection";
import { ISSUE_TYPE_OPTIONS, QUIZ_DEFINITIONS } from "@/domain/issues/definitions";
import { createReportDetails, createReportForm, replaceIssueType, type ReportFormState } from "@/domain/issues/form";

const facilityTypes = [
  ["well", "机井"], ["road", "道路"], ["bridge", "桥涵闸"], ["forest", "林网"], ["transformer", "变压器"],
] as const;
type ModalResult = { confirm: boolean; cancel: boolean };
const confirmed: ModalResult = { confirm: true, cancel: false };
const cancelled: ModalResult = { confirm: false, cancel: true };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((success, failure) => { resolve = success; reject = failure; });
  return { promise, resolve, reject };
}

function snapshot(form: ReportFormState): ReportFormState {
  return JSON.parse(JSON.stringify(form)) as ReportFormState;
}

function fixture(initialType: IssueType = "well") {
  const form = reactive(createReportForm());
  replaceIssueType(form, initialType);
  Object.assign(form, {
    projectYear: 2022, orgId: 23, orgLabel: "测试街道 / 测试新村", code: "001号",
    address: "测试新村北侧", lat: 36.48, lng: 116.03, planDate: "2026-10-01",
    signatureFileId: "old-signature", signaturePreviewUrl: "/uploads/old-signature.png",
  });
  form.details.length = "10.5";
  form.details.keeperName = "测试管护人";
  form.details.keeperPhone = "0013800000000";
  form.quizzes.forEach((item) => {
    item.value = false;
    item.desc = "已有排查描述";
    item.photos = [{ fileId: "old-photo", url: "/uploads/old-photo.png" }];
  });
  const disabled = shallowRef(false);
  const modal = vi.fn(async (): Promise<ModalResult> => confirmed);
  vi.stubGlobal("uni", { showModal: modal });
  const commit = vi.fn((type: IssueType) => replaceIssueType(form, type));
  const selection = useFacilityTypeSelection({ currentType: () => form.type, disabled: () => disabled.value, commit });
  // 高亮与正式组件一样只取表单的已提交类型，不维护乐观选中副本。
  const selectedLabel = computed(() => ISSUE_TYPE_OPTIONS.find((item) => item.value === form.type)?.label);
  return { form, disabled, modal, commit, selectedLabel, ...selection };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("巡查设施类型确认切换", () => {
  it("五类顺序与标签和原型保持一致", () => {
    expect(ISSUE_TYPE_OPTIONS).toEqual(facilityTypes.map(([value, label]) => ({ value, label })));
  });

  it.each(facilityTypes)("确认切换到 %s/%s 后保留基础信息并重建当前类型排查项", async (type, label) => {
    const f = fixture(type === "well" ? "road" : "well");
    const before = snapshot(f.form);
    const oldDetails = f.form.details;
    const oldQuizzes = f.form.quizzes;
    await f.selectType(type);
    expect(f.modal).toHaveBeenCalledTimes(1);
    expect(f.modal).toHaveBeenCalledWith(expect.objectContaining({ title: "切换设施类型", confirmText: "继续切换" }));
    expect(f.commit).toHaveBeenCalledTimes(1);
    expect(f.commit).toHaveBeenCalledWith(type);
    expect(f.selectedLabel.value).toBe(label);
    expect(f.form).toMatchObject({
      type, projectYear: before.projectYear, orgId: before.orgId, orgLabel: before.orgLabel, code: before.code,
      address: before.address, lat: before.lat, lng: before.lng,
      planDate: "", signatureFileId: "", signaturePreviewUrl: "",
    });
    expect(f.form.details).toEqual(createReportDetails());
    expect(f.form.details).not.toBe(oldDetails);
    expect(f.form.quizzes).not.toBe(oldQuizzes);
    expect(f.form.quizzes).toEqual(QUIZ_DEFINITIONS[type].map((item) => ({ type: item.type, value: null, desc: "", photos: [] })));
    expect(f.selectingType.value).toBe(false);
  });

  it("等待确认期间保持原高亮与全部数据，取消不提交或清空", async () => {
    const f = fixture();
    const answer = deferred<ModalResult>();
    f.modal.mockReturnValueOnce(answer.promise);
    const before = snapshot(f.form);
    const pending = f.selectType("road");
    expect(f.selectingType.value).toBe(true);
    expect(f.selectedLabel.value).toBe("机井");
    expect(f.form).toEqual(before);
    expect(f.commit).not.toHaveBeenCalled();
    answer.resolve(cancelled);
    await pending;
    expect(f.form).toEqual(before);
    expect(f.selectedLabel.value).toBe("机井");
    expect(f.selectingType.value).toBe(false);
    expect(f.commit).not.toHaveBeenCalled();
  });

  it("点击当前项不弹确认、不清空数据", async () => {
    const f = fixture("forest");
    const before = snapshot(f.form);
    await f.selectType("forest");
    expect(f.modal).not.toHaveBeenCalled();
    expect(f.commit).not.toHaveBeenCalled();
    expect(f.form).toEqual(before);
    expect(f.selectingType.value).toBe(false);
  });

  it("快速点击相同或不同项只保留第一份确认，结束后允许下次切换", async () => {
    const f = fixture();
    const answer = deferred<ModalResult>();
    f.modal.mockReturnValueOnce(answer.promise);
    const pending = f.selectType("road");
    await Promise.all([f.selectType("road"), f.selectType("bridge"), f.selectType("forest")]);
    expect(f.modal).toHaveBeenCalledTimes(1);
    expect(f.commit).not.toHaveBeenCalled();
    expect(f.form.type).toBe("well");
    answer.resolve(confirmed);
    await pending;
    expect(f.form.type).toBe("road");
    expect(f.commit).toHaveBeenCalledTimes(1);
    await f.selectType("transformer");
    expect(f.modal).toHaveBeenCalledTimes(2);
    expect(f.commit).toHaveBeenCalledTimes(2);
    expect(f.form.type).toBe("transformer");
  });

  it("已禁用时不弹窗且不修改表单", async () => {
    const f = fixture();
    const before = snapshot(f.form);
    f.disabled.value = true;
    await f.selectType("bridge");
    expect(f.modal).not.toHaveBeenCalled();
    expect(f.commit).not.toHaveBeenCalled();
    expect(f.form).toEqual(before);
    expect(f.selectingType.value).toBe(false);
  });

  it("确认期间因上传、提交或页面失效而禁用，迟到确认不得清空数据", async () => {
    const f = fixture();
    const answer = deferred<ModalResult>();
    f.modal.mockReturnValueOnce(answer.promise);
    const before = snapshot(f.form);
    const pending = f.selectType("bridge");
    f.disabled.value = true;
    answer.resolve(confirmed);
    await pending;
    expect(f.form).toEqual(before);
    expect(f.commit).not.toHaveBeenCalled();
    expect(f.selectingType.value).toBe(false);
    f.disabled.value = false;
    await f.selectType("bridge");
    expect(f.commit).toHaveBeenCalledTimes(1);
    expect(f.form.type).toBe("bridge");
  });

  it("外部已恢复为另一类型时，旧确认不能覆盖新的类型和内容", async () => {
    const f = fixture();
    const answer = deferred<ModalResult>();
    f.modal.mockReturnValueOnce(answer.promise);
    const pending = f.selectType("road");
    replaceIssueType(f.form, "transformer");
    f.form.details.capacity = "250";
    f.form.quizzes[0]!.desc = "恢复草稿后的新内容";
    const restored = snapshot(f.form);
    answer.resolve(confirmed);
    await pending;
    expect(f.form).toEqual(restored);
    expect(f.selectedLabel.value).toBe("变压器");
    expect(f.commit).not.toHaveBeenCalled();
    expect(f.selectingType.value).toBe(false);
  });

  it.each(["reject", "throw"] as const)("弹窗 %s 时保留数据并释放锁，后续重试正常", async (failure) => {
    const f = fixture();
    const before = snapshot(f.form);
    if (failure === "reject") f.modal.mockRejectedValueOnce(new Error("showModal:fail"));
    else f.modal.mockImplementationOnce(() => { throw new Error("showModal unavailable"); });
    await expect(f.selectType("forest")).resolves.toBeUndefined();
    expect(f.form).toEqual(before);
    expect(f.commit).not.toHaveBeenCalled();
    expect(f.selectingType.value).toBe(false);
    await f.selectType("forest");
    expect(f.commit).toHaveBeenCalledTimes(1);
    expect(f.form.type).toBe("forest");
  });

  it("非法类型不进入确认或修改流程", async () => {
    const f = fixture();
    const before = snapshot(f.form);
    await f.selectType("unsupported" as IssueType);
    expect(f.modal).not.toHaveBeenCalled();
    expect(f.commit).not.toHaveBeenCalled();
    expect(f.form).toEqual(before);
  });
});

type TemplateAst = NonNullable<NonNullable<ReturnType<typeof parse>["descriptor"]["template"]>["ast"]>;
type TemplateElement = Extract<TemplateAst["children"][number], { type: 1 }>;

/** 读取真实 SFC 的模板 AST；注释、脚本字符串不能伪装成已接线组件。 */
function templateElements(relativePath: string): TemplateElement[] {
  const filename = fileURLToPath(new URL(relativePath, import.meta.url));
  const parsed = parse(readFileSync(filename, "utf8"), { filename });
  expect(parsed.errors).toEqual([]);
  const ast = parsed.descriptor.template?.ast;
  if (!ast) throw new Error("目标 SFC 缺少模板 AST");
  const elements: TemplateElement[] = [];
  const visit = (children: TemplateAst["children"]): void => {
    for (const child of children) {
      if (child.type === 1) { elements.push(child); visit(child.children); }
    }
  };
  visit(ast.children);
  return elements;
}

function directive(element: TemplateElement, name: string, argument?: string) {
  const result = element.props.find((prop) => prop.type === 7 && prop.name === name &&
    (argument === undefined || (prop.arg?.type === 4 && prop.arg.content === argument)));
  return result?.type === 7 ? result : undefined;
}

function expression(element: TemplateElement, name: string, argument?: string) {
  const exp = directive(element, name, argument)?.exp;
  if (exp?.type !== 4) throw new Error(`缺少 ${element.tag} 的 ${name}:${argument ?? ""} 表达式`);
  const statement = babelParse(`(${exp.content})`, { sourceType: "module" }).program.body[0];
  if (statement?.type !== "ExpressionStatement") throw new Error("模板绑定不是可验证的表达式");
  return statement.expression;
}

function attribute(element: TemplateElement, name: string): string | undefined {
  const result = element.props.find((prop) => prop.type === 6 && prop.name === name);
  return result?.type === 6 ? result.value?.content : undefined;
}

describe("巡查顶部设施 tabs 模板接线", () => {
  it("使用横向 scroll-view 与受控选中项、真实 tab 按钮和触摸选择事件", () => {
    const elements = templateElements("../src/components/report/FacilityTypeTabs.vue");
    const scroll = elements.find((element) => element.tag === "scroll-view");
    const tab = elements.find((element) => element.tag === "button" && attribute(element, "role") === "tab");
    if (!scroll || !tab) throw new Error("缺少真实 scroll-view 或 tab 按钮");
    expect(expression(scroll, "bind", "scroll-x")).toMatchObject({ type: "BooleanLiteral", value: true });
    expect(expression(scroll, "bind", "show-scrollbar")).toMatchObject({ type: "BooleanLiteral", value: false });
    expect(directive(scroll, "bind", "scroll-into-view")).toBeDefined();
    expect(directive(tab, "for")?.forParseResult?.source).toMatchObject({ type: 4, content: "ISSUE_TYPE_OPTIONS" });
    expect(expression(tab, "bind", "aria-selected")).toMatchObject({
      type: "BinaryExpression", operator: "===",
      left: { type: "MemberExpression", object: { name: "props" }, property: { name: "value" } },
      right: { type: "MemberExpression", object: { name: "option" }, property: { name: "value" } },
    });
    expect(expression(tab, "on", "tap")).toMatchObject({ type: "CallExpression", callee: { name: "select" }, arguments: [{ type: "MemberExpression", object: { name: "option" }, property: { name: "value" } }] });
    expect(expression(tab, "bind", "disabled")).toMatchObject({ type: "MemberExpression", object: { name: "props" }, property: { name: "disabled" } });
    expect(elements.some((element) => element.tag === "picker")).toBe(false);
  });

  it("正式巡查页在步骤区前接入 tabs，仅第一步显示，以 form.type 作为高亮来源并移除主类型 picker", () => {
    const elements = templateElements("../src/pages/report/index.vue");
    const tabs = elements.filter((element) => element.tag === "FacilityTypeTabs");
    expect(tabs).toHaveLength(1);
    const tab = tabs[0]!;
    expect(expression(tab, "if")).toMatchObject({ type: "BinaryExpression", operator: "===", left: { type: "Identifier", name: "step" }, right: { type: "NumericLiteral", value: 1 } });
    expect(expression(tab, "bind", "value")).toMatchObject({ type: "MemberExpression", object: { name: "form" }, property: { name: "type" } });
    expect(expression(tab, "bind", "disabled")).toMatchObject({ type: "LogicalExpression", operator: "||", left: { name: "typeSelectionDisabled" }, right: { name: "selectingType" } });
    expect(expression(tab, "on", "select")).toMatchObject({ type: "Identifier", name: "selectType" });
    const hero = elements.find((element) => attribute(element, "class") === "report-hero");
    expect(hero).toBeDefined();
    expect(tab.loc.start.offset).toBeLessThan(hero!.loc.start.offset);
    const pickers = elements.filter((element) => element.tag === "picker");
    expect(pickers.length).toBeGreaterThan(0);
    for (const picker of pickers) {
      if (directive(picker, "bind", "range")) {
        expect(expression(picker, "bind", "range")).not.toMatchObject({ type: "Identifier", name: "ISSUE_TYPE_OPTIONS" });
      }
      expect(directive(picker, "on", "change")?.exp).not.toMatchObject({ content: "selectType" });
    }
  });
});
