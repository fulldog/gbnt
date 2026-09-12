import { ISSUE_FORM_QUIZZES, issueQuizDefinitions, issueQuizIsAbnormal, resolveFacilityCodeMode } from "@gbnt/api-client";
import type { FacilityCodeMode } from "@gbnt/api-client";
import type { AdminCreateIssueInput, FileItem, Issue, IssueQuizDefinition, IssueType, IssueTypeExt, ProjectYear, QuizBool, UpdateIssueInput } from "@gbnt/api-client";
import type { AdminIssue } from "@/api/types";

export interface ChecklistDraft extends IssueQuizDefinition {
  value: boolean | null;
  desc: string;
  files: string[];
  photos: FileItem[];
}
interface TypeDraftBase { checklist: ChecklistDraft[]; plan_date: string }
export type WellDraft = TypeDraftBase & { type: "well"; build_kind: "new" | "match"; outlet_total?: number; outlet_damaged?: number; casing_total?: number; casing_damaged?: number; panorama_files: string[]; panorama_photos: FileItem[] };
export type RoadDraft = TypeDraftBase & { type: "road"; length?: number; width?: number; thickness?: number };
export type BridgeDraft = TypeDraftBase & { type: "bridge"; kind: "bridge" | "culvert" | "gate"; length?: number; width?: number };
export type ForestDraft = TypeDraftBase & { type: "forest"; handover_count?: number; existing_count?: number };
export type TransformerDraft = TypeDraftBase & { type: "transformer"; capacity?: number; model: string; voltage: "10kv" | "0.4kv" };
export type IssueTypeDraft = WellDraft | RoadDraft | BridgeDraft | ForestDraft | TransformerDraft;
export interface IssueFormDraft {
  type: IssueType;
  project_year: ProjectYear;
  org_id?: number;
  code: string;
  codeMode?: FacilityCodeMode;
  address: string;
  lat?: number;
  lng?: number;
  report_user_id?: number;
  assignee_user?: number;
  reporter_name: string;
  reporter_phone: string;
  types: { well: WellDraft; road: RoadDraft; bridge: BridgeDraft; forest: ForestDraft; transformer: TransformerDraft };
}

export function createChecklist(type: IssueType): ChecklistDraft[] {
  return ISSUE_FORM_QUIZZES[type].map((item) => ({ ...item, value: null, desc: "", files: [], photos: [] }));
}

export function createIssueDraft(reportUserId?: number): IssueFormDraft {
  return {
    type: "well", project_year: 2023, org_id: undefined, code: "", address: "", lat: undefined, lng: undefined,
    report_user_id: reportUserId, assignee_user: undefined, reporter_name: "", reporter_phone: "",
    types: {
      well: { type: "well", build_kind: "new", panorama_files: [], panorama_photos: [], checklist: createChecklist("well"), plan_date: "" },
      road: { type: "road", checklist: createChecklist("road"), plan_date: "" },
      bridge: { type: "bridge", kind: "bridge", checklist: createChecklist("bridge"), plan_date: "" },
      forest: { type: "forest", checklist: createChecklist("forest"), plan_date: "" },
      transformer: { type: "transformer", model: "", voltage: "10kv", checklist: createChecklist("transformer"), plan_date: "" },
    },
  };
}

/** 每种类型独立回填，答案按稳定枚举匹配；空值不转换成 0 或 false。 */
export function hydrateIssueDraft(issue: AdminIssue): IssueFormDraft {
  const draft = createIssueDraft(issue.report_user_id);
  Object.assign(draft, {
    type: issue.type, project_year: issue.project_year, org_id: issue.org_id, code: issue.code, address: issue.address,
    codeMode: "manual",
    assignee_user: issue.assignee_user || undefined,
    lat: issue.lat ?? undefined, lng: issue.lng ?? undefined,
    reporter_name: issue.reporter_name?.trim() || issue.report_user_name || "", reporter_phone: issue.reporter_phone ?? "",
  });
  const active = draft.types[issue.type];
  const ext = issue.type_ext;
  const byType = new Map((ext.checklist ?? []).map((q) => [q.type, q]));
  active.plan_date = issue.plan_date ?? "";
  active.checklist = active.checklist.map((q) => {
    const stored = byType.get(q.type);
    return { ...q, value: typeof stored?.value === "boolean" ? stored.value : null, desc: stored?.desc ?? "", files: [...(stored?.files ?? [])], photos: (stored?.photos ?? []).map((p) => ({ ...p })) };
  });
  switch (issue.type) {
    case "well": Object.assign(draft.types.well, { build_kind: issue.type_ext.build_kind, outlet_total: issue.type_ext.outlet_total ?? undefined, outlet_damaged: issue.type_ext.outlet_damaged ?? undefined, casing_total: issue.type_ext.casing_total ?? undefined, casing_damaged: issue.type_ext.casing_damaged ?? undefined, panorama_files: [...(issue.type_ext.panorama_files ?? [])], panorama_photos: (issue.type_ext.panorama_photos ?? []).map((p) => ({ ...p })) }); break;
    case "road": Object.assign(draft.types.road, { length: issue.type_ext.length ?? undefined, width: issue.type_ext.width ?? undefined, thickness: issue.type_ext.thickness ?? undefined }); break;
    case "bridge": Object.assign(draft.types.bridge, { kind: issue.type_ext.kind, length: issue.type_ext.length ?? undefined, width: issue.type_ext.width ?? undefined }); break;
    case "forest": Object.assign(draft.types.forest, { handover_count: issue.type_ext.handover_count ?? undefined, existing_count: issue.type_ext.existing_count ?? undefined }); break;
    case "transformer": Object.assign(draft.types.transformer, { capacity: issue.type_ext.capacity ?? undefined, model: issue.type_ext.model ?? "", voltage: issue.type_ext.voltage }); break;
  }
  return draft;
}

function withoutPhotos(draft: IssueTypeDraft): unknown {
  const { checklist, plan_date: _plan, ...fields } = draft;
  const { panorama_photos: _photos, ...attributes } = fields as typeof fields & { panorama_photos?: FileItem[] };
  return { ...attributes, checklist: checklist.map(({ type, value, desc, files }) => ({ type, value, desc, files })) };
}

export function typeDraftChanged(form: IssueFormDraft, issue: AdminIssue | null): boolean {
  if (!issue || issue.type !== form.type) return true;
  return JSON.stringify(withoutPhotos(form.types[form.type])) !== JSON.stringify(withoutPhotos(hydrateIssueDraft(issue).types[issue.type]));
}

/** 旧记录未补齐新增字段时仍用旧版本保存；补齐后升级，不捏造缺失答案。 */
export function draftSchemaVersion(form: IssueFormDraft, issue: AdminIssue | null): 1 | 2 {
  if (issue?.type !== form.type || issue.type_ext.schema_version === 2) return 2;
  const active = form.types[form.type];
  if (active.type === "well" && active.panorama_files.length === 0) return 1;
  if (active.type === "road" && active.checklist.find((q) => q.type === "has_road_damage")?.value == null) return 1;
  return 2;
}

export function draftNeedsRectify(form: IssueFormDraft, issue: AdminIssue | null = null): boolean {
  const draft = form.types[form.type];
  if (draft.type === "well" && ((draft.outlet_damaged ?? 0) > 0 || (draft.casing_damaged ?? 0) > 0)) return true;
  const definitions = issueQuizDefinitions(form.type, draftSchemaVersion(form, issue));
  return draft.checklist.some((q) => {
    const definition = definitions.find((d) => d.type === q.type);
    return q.value !== null && Boolean(definition && issueQuizIsAbnormal(definition, q.value));
  }) || Boolean(draftSchemaVersion(form, issue) === 1 && issue?.type === "well" && issue.type_ext.checklist.some((q) => q.type === "transformer_ok" && !q.value));
}

export function quizPhotoMinimum(q: ChecklistDraft, version = 2): number {
  if (version === 2 && q.type === "water_out" && q.value === true) return 2;
  return q.mustImg || (q.value !== null && issueQuizIsAbnormal(q, q.value)) ? 1 : 0;
}

export function validateChecklist(form: IssueFormDraft, issue: AdminIssue | null = null): string | null {
  // 基础信息修改不强制改写、升级旧表单，但显式清除必要日期仍然校验。
  const active = form.types[form.type];
  if (issue && !typeDraftChanged(form, issue)) {
    if (active.plan_date !== issue.plan_date && draftNeedsRectify(form, issue) && !active.plan_date) return "请选择整改计划日期";
    return null;
  }
  const version = draftSchemaVersion(form, issue);
  const definitions = issueQuizDefinitions(form.type, version);
  for (const q of active.checklist) {
    const definition = definitions.find((d) => d.type === q.type);
    if (!definition) continue;
    if (q.value === null) return `请选择“${q.label}”`;
    if (issueQuizIsAbnormal(definition, q.value) && !q.desc.trim()) return `请填写“${q.label}”的说明`;
    const minimum = quizPhotoMinimum(q, version);
    if (new Set(q.files).size < minimum) return `“${q.label}”至少需要 ${minimum} 张现场照片`;
  }
  let numbers: [string, number | undefined][] = [];
  switch (active.type) {
    case "well":
      numbers = [["出水口总数", active.outlet_total], ["出水口损坏", active.outlet_damaged], ["护筒总数", active.casing_total], ["护筒损坏", active.casing_damaged]];
      if ((active.outlet_damaged ?? 0) > (active.outlet_total ?? 0)) return "出水口损坏数量不能大于总数";
      if ((active.casing_damaged ?? 0) > (active.casing_total ?? 0)) return "护筒损坏数量不能大于总数";
      if (version === 2 && !active.panorama_files.length) return "请上传全景照片";
      break;
    case "road": numbers = [["道路长度", active.length], ["道路宽度", active.width], ["道路厚度", active.thickness]]; break;
    case "bridge": numbers = [["长度", active.length], ["宽度", active.width]]; break;
    case "forest": numbers = [["移交株数", active.handover_count], ["现有株数", active.existing_count]]; break;
    case "transformer": numbers = [["容量", active.capacity]]; if (!active.model.trim()) return "请填写型号"; break;
  }
  for (const [name, number] of numbers) if (number == null || !Number.isFinite(number) || number < 0 || ((active.type === "well" || active.type === "forest") && !Number.isInteger(number))) return `请填写有效的${name}`;
  if (draftNeedsRectify(form, issue) && !active.plan_date) return "请选择整改计划日期";
  return null;
}

function buildTypeInput(form: IssueFormDraft, issue: AdminIssue | null = null): IssueTypeExt {
  const draft = form.types[form.type];
  const version = draftSchemaVersion(form, issue);
  const definitions = issueQuizDefinitions(form.type, version);
  const checklist: QuizBool[] = definitions.map((definition) => {
    const q = draft.checklist.find((q) => q.type === definition.type);
    if (!q && issue?.type === form.type) {
      const original = issue.type_ext.checklist.find((q) => q.type === definition.type);
      if (original) return { ...original, files: [...original.files] };
    }
    if (!q || q.value === null) throw new Error(`请选择“${definition.label}”`);
    return { type: q.type, value: q.value, desc: q.desc.trim(), files: [...q.files], mustImg: quizPhotoMinimum(q, version) > 0 };
  });
  const { type: _type, plan_date: _plan, checklist: _checklist, ...attributes } = draft;
  const { panorama_photos: _photos, ...fields } = attributes as typeof attributes & { panorama_photos?: FileItem[] };
  const previous = issue?.type === form.type ? issue.type_ext : {};
  // 历史字段仅保留原值；新建不补 tree_survive / survive_rate 等已退出的字段。
  return { keeper_name: "", keeper_phone: "", ...previous, ...fields, schema_version: version, checklist } as IssueTypeExt;
}

export function buildCreateInput(form: IssueFormDraft, signatureId: string): AdminCreateIssueInput {
  if (!form.org_id) throw new Error("请选择行政区划");
  return {
    type: form.type, project_year: form.project_year, org_id: form.org_id,
    code_mode: resolveFacilityCodeMode(form), code: resolveFacilityCodeMode(form) === "manual" ? form.code.trim() : undefined, address: form.address.trim(),
    lat: form.lat, lng: form.lng, report_user_id: form.report_user_id,
    assignee_user: 0,
    reporter_name: form.reporter_name.trim(), reporter_phone: form.reporter_phone.trim(),
    reporter_signature_file_id: signatureId, plan_date: draftNeedsRectify(form) ? form.types[form.type].plan_date : "",
    type_ext: buildTypeInput(form),
  } as AdminCreateIssueInput;
}

export function buildUpdateInput(form: IssueFormDraft, issue: AdminIssue, signatureId: string): UpdateIssueInput {
  if (issue.status !== "done" && !form.assignee_user) throw new Error("请指定整改人");
  const original = hydrateIssueDraft(issue);
  const input: UpdateIssueInput = { expected_updated_at: issue.updated_at || undefined };
  const fields = ["project_year", "org_id", "code", "address", "lat", "lng", "reporter_name", "reporter_phone"] as const;
  for (const key of fields) {
    const current = typeof form[key] === "string" ? (form[key] as string).trim() : form[key];
    if (current !== original[key] && current !== undefined) Object.assign(input, { [key]: current });
  }
  if (form.reporter_name.trim() !== original.reporter_name.trim()) input.report_user_id = 0;
  if (form.assignee_user !== original.assignee_user) input.assignee_user = form.assignee_user || 0;
  const changed = typeDraftChanged(form, issue);
  if (changed) {
    input.type = form.type;
    input.type_ext = buildTypeInput(form, issue);
  }
  const plan = form.types[form.type].plan_date;
  if (plan !== issue.plan_date || changed) input.plan_date = draftNeedsRectify(form, issue) ? plan : "";
  if (signatureId !== issue.reporter_signature_file_id) input.reporter_signature_file_id = signatureId;
  return input;
}
